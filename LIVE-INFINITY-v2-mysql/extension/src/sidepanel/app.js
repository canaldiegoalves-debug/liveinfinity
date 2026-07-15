const app=document.getElementById("app");

const state={
  page:"home",
  license:null,
  settings:{...ORION.DEFAULTS},
  collapse:{},
  live:{dashboardDetected:false,live:false,elapsedSeconds:0,viewers:null,sales:0,gmv:null,product:null,saleEvents:[],chatMessages:[],violation:null,protectionStatus:"idle",lastScanAt:null},
  commentTimer:null,endAt:null,endTimer:null,audio:null,audioFiles:[],videoFiles:[],audioIndex:0,ambientContext:null,ambientNodes:[],ambientTimers:[],protectionEvents:[],pendingRender:false,licenseError:""
};

async function ensureDeviceId(){
  const data=await chrome.storage.local.get([
    ORION.STORAGE.DEVICE_ID
  ]);

  let deviceId=data[ORION.STORAGE.DEVICE_ID];

  if(!deviceId){
    deviceId=crypto.randomUUID();

    await chrome.storage.local.set({
      [ORION.STORAGE.DEVICE_ID]:deviceId
    });
  }

  return deviceId;
}

async function validateOnlineLicense(license){
  if(!license?.email||!license?.key){
    return null;
  }

  const deviceId=await ensureDeviceId();

  const response=await fetch(
    `${ORION.API_BASE_URL}/api/validate`,
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        email:license.email,
        key:license.key,
        deviceId
      })
    }
  );

  const body=await response.json().catch(()=>({}));

  if(!response.ok||!body.ok){
    throw new Error(
      body.error||
      "Não foi possível validar a chave."
    );
  }

  const validated={
    ...body.license,
    active:true,
    validatedAt:new Date().toISOString()
  };

  await chrome.storage.local.set({
    [ORION.STORAGE.LICENSE]:validated
  });

  return validated;
}

async function load(){
  const data=await chrome.storage.local.get([
    ORION.STORAGE.LICENSE,
    ORION.STORAGE.SETTINGS,
    ORION.STORAGE.COLLAPSE
  ]);

  state.license=data[ORION.STORAGE.LICENSE]||null;
  state.settings={
    ...ORION.DEFAULTS,
    ...(data[ORION.STORAGE.SETTINGS]||{})
  };
  state.endAt=Number(state.settings.endTimerAt||0)||null;
  if(state.endAt&&state.endAt>Date.now())startTicker();
  if(state.endAt&&state.endAt<=Date.now())state.endAt=null;
  state.collapse=data[ORION.STORAGE.COLLAPSE]||{};

  if(state.license){
    try{
      state.license=
        await validateOnlineLicense(state.license);

      state.licenseError="";
    }catch(error){
      state.license=null;
      state.licenseError=error.message;

      await chrome.storage.local.remove([
        ORION.STORAGE.LICENSE
      ]);
    }
  }
}
async function saveSettings(){await chrome.storage.local.set({[ORION.STORAGE.SETTINGS]:state.settings})}
async function saveCollapse(){await chrome.storage.local.set({[ORION.STORAGE.COLLAPSE]:state.collapse})}
function valid(){return !!(state.license?.active&&new Date(state.license.expiresAt)>new Date())}
function pro(){return state.license?.plan==="pro"}
function fmt(s){s=Math.max(0,+s||0);return`${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
async function post(type,payload={}){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id)return {ok:false,error:"Aba ativa não localizada."};

  try{
    return await chrome.tabs.sendMessage(tab.id,{type,payload});
  }catch(error){
    return {ok:false,error:"O leitor da página não respondeu. Atualize o TikTok Shop."};
  }
}
async function activate(email,key){
  const deviceId=await ensureDeviceId();

  const response=await fetch(
    `${ORION.API_BASE_URL}/api/activate`,
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        email:email.trim(),
        key:key.trim().toUpperCase(),
        deviceId
      })
    }
  );

  const body=await response.json().catch(()=>({}));

  if(!response.ok||!body.ok){
    throw new Error(
      body.error||
      "Não foi possível ativar esta chave."
    );
  }

  state.license={
    ...body.license,
    active:true,
    validatedAt:new Date().toISOString()
  };

  await chrome.storage.local.set({
    [ORION.STORAGE.LICENSE]:state.license
  });

  return state.license;
}
function nav(page,label){return`<button data-page="${page}" class="${state.page===page?"active":""}">${label}</button>`}
function header(){
  return`<header class="brand-header">
    <div class="brand">
      <img class="brand-logo" src="../../assets/live-infinity-icon.png" alt="Live Infinity">
      <div>
        <strong><span class="live-word">LIVE</span> <span class="infinity-word">INFINITY</span></strong>
        <small>Plano ${pro()?"Pro":"Básico"} · Automação infinita</small>
      </div>
    </div>
    <span class="status-pill ${state.live.live?"active":""}">${state.live.live?"● LIVE ATIVA":"AGUARDANDO"}</span>
  </header>
  <nav>${nav("home","🏠 Início")}${nav("audio","🎵 Áudio")}${nav("ai","🤖 IA")}${nav("video","🎬 Vídeos")}${nav("settings","⚙ Config.")}</nav>`;
}
function section(id,icon,title,sub,body,open=true){
  const collapsed=state.collapse[id]??!open;
  return`<section class="panel-section ${collapsed?"collapsed":""}" data-section="${id}">
    <button class="section-head" data-collapse="${id}">
      <span class="section-title"><span>${icon}</span><span><b>${title}</b><small>${sub}</small></span></span><span class="chev">▼</span>
    </button><div class="section-body">${body}</div></section>`;
}

function isEditingPanel(){
  const active=document.activeElement;

  if(!active||!app.contains(active))return false;

  return (
    active.matches("input, textarea, select") ||
    active.isContentEditable
  );
}

function renderWhenSafe(){
  if(isEditingPanel()){
    state.pendingRender=true;
    return;
  }

  state.pendingRender=false;
  render();
}

function updateLiveFields(){
  const setText=(selector,value)=>{
    document.querySelectorAll(selector).forEach(element=>{
      element.textContent=value;
    });
  };

  setText('[data-live-value="sales"]',state.live.sales);
  setText('[data-live-value="viewers"]',state.live.viewers??"—");
  setText('[data-live-value="status"]',state.live.live?"ATIVA":"INATIVA");
  setText('[data-live-value="elapsed"]',fmt(state.live.elapsedSeconds));
  setText('[data-live-value="gmv"]',state.live.gmv?`R$ ${state.live.gmv}`:"—");

  const product=document.querySelector('[data-live-value="product"]');
  if(product)product.textContent=state.live.product||"não localizado";

  const headerStatus=document.querySelector(".status-pill");
  if(headerStatus){
    headerStatus.textContent=state.live.live?"LIVE ATIVA":"AGUARDANDO";
    headerStatus.classList.toggle("active",Boolean(state.live.live));
  }
}

function render(){
  if(!valid()) return login();
  app.innerHTML=header()+`<main id="page"></main>`;
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>{state.page=b.dataset.page;render()});
  page();
}
function login(){
  if(document.getElementById("orion-login-form")){
    return;
  }

  app.innerHTML=`<header class="brand-header login-brand">
    <div class="brand">
      <img class="brand-logo" src="../../assets/live-infinity-icon.png" alt="Live Infinity">
      <div>
        <strong><span class="live-word">LIVE</span> <span class="infinity-word">INFINITY</span></strong>
        <small>Automação infinita. Lucro sem limites.</small>
      </div>
    </div>
  </header>
  <section id="orion-login-form" class="login">
    <h1>Ativar extensão</h1>
    <p>Digite o e-mail cadastrado e a chave gerada no painel Admin.</p>

    <label>E-mail</label>
    <input id="email" type="email">

    <label>Chave de acesso</label>
    <input id="key" type="text" placeholder="LIVEINF-BASIC-...">

    <div id="msg" class="message">${state.licenseError?esc(state.licenseError):""}</div>

    <button id="activate" class="btn-primary">
      Ativar acesso
    </button>
  </section>`;

  document.getElementById("activate").onclick=async()=>{
    const emailValue=
      document.getElementById("email").value.trim();

    const keyValue=
      document.getElementById("key").value.trim();

    const message=
      document.getElementById("msg");

    if(!emailValue.includes("@")||!keyValue){
      message.textContent=
        "Preencha o e-mail e a chave.";
      return;
    }

    try{
      message.textContent=
        "Validando com o servidor...";

      await activate(emailValue,keyValue);
      state.licenseError="";
      render();
    }catch(error){
      message.textContent=error.message;
    }
  };
}
function page(){
  const el=document.getElementById("page");
  if((state.page==="ai"||state.page==="video")&&!pro()){el.innerHTML=`<div class="locked"><h2>🔒 Recurso Pro</h2><p>Disponível apenas no Plano Pro.</p></div>`;return}
  el.innerHTML=state.page==="home"?home():state.page==="audio"?audio():state.page==="ai"?ai():state.page==="video"?video():settings();
  bind();
}
function home(){
  const timerRemaining=state.endAt?Math.max(0,Math.ceil((state.endAt-Date.now())/1000)):0;
  return`
  <div class="top-summary">
    <div class="summary"><span>Vendas</span><strong data-live-value="sales">${state.live.sales}</strong></div>
    <div class="summary"><span>Espectadores</span><strong data-live-value="viewers">${state.live.viewers??"—"}</strong></div>
    <div class="summary"><span>Alertas</span><strong>0</strong></div>
  </div>

  ${section("live","📡","Status da LIVE","detecção em tempo real",`
    <div class="card-row">
      <div class="mini-card"><span>LIVE</span><strong data-live-value="status">${state.live.live?"ATIVA":"INATIVA"}</strong></div>
      <div class="mini-card"><span>Tempo</span><strong data-live-value="elapsed">${fmt(state.live.elapsedSeconds)}</strong></div>
    </div>
    <p class="helper">Produto: <span data-live-value="product">${esc(state.live.product||"não localizado")}</span></p>
    <div class="actions"><button id="scan" class="btn-secondary">Escanear agora</button></div>
  `)}

  ${section("timer","⏱️","Timer de Encerramento","encerra no horário definido",`
    <div class="timer-display"><strong id="remaining">${fmt(timerRemaining)}</strong><small>Tempo restante</small></div>
    <div class="quick-times">
      <button data-time="60">1h</button><button data-time="120">2h</button><button data-time="240" class="active">4h</button><button data-time="360">6h</button><button data-time="480">8h</button>
    </div>
    <label>Ou digite manualmente</label><input id="timer-minutes" type="number" value="${state.settings.endTimerMinutes}">
    <div class="actions"><button id="timer-start" class="${state.endAt?"btn-danger":"btn-primary"}">${state.endAt?"■ Cancelar timer":"▶ Iniciar ciclo"}</button></div><p id="timer-status" class="helper">${state.endAt?"Timer ativo. A LIVE será encerrada automaticamente.":"Timer parado."}</p>
  `)}

  ${section("product","📌","Fixação de Produto","controle rápido do produto atual",`
    <div class="toggle-line"><span>Fixar Produto #1</span><input id="auto-pin" class="toggle" type="checkbox" ${state.settings.autoPinEnabled?"checked":""}></div>
    <div class="toggle-line"><span>Ignorar cupons de desconto</span><input id="skip-coupons" class="toggle" type="checkbox" ${state.settings.skipCoupons!==false?"checked":""}></div>
    <p class="helper">Ignora linhas com cupom, voucher ou desconto e procura a primeira linha com preço, estoque e imagem de produto.</p>
    <p class="helper">Produto detectado: ${esc(state.live.product||"nenhum")}</p>
    <p id="product-auto-status" class="helper">${state.settings.autoPinEnabled?"Ativa: usa o botão DESAFIXAR como confirmação e refaz o ciclo a cada 20 segundos.":"Fixação automática desativada."}</p>
    <div class="actions"><button id="pin" class="btn-primary">Fixar produto principal</button><button id="unpin" class="btn-secondary">Desafixar</button></div><p id="pin-msg" class="helper"></p>
  `)}

  ${section("sales","🛒","Contador de Vendas","eventos da sessão atual",`
    <div class="card-row"><div class="mini-card"><span>Vendas</span><strong data-live-value="sales">${state.live.sales}</strong></div><div class="mini-card"><span>GMV</span><strong data-live-value="gmv">${state.live.gmv?`R$ ${state.live.gmv}`:"—"}</strong></div></div>
    <div class="event-list">${(state.live.saleEvents||[]).slice(-8).reverse().map(e=>`<p>🛒 ${esc(e.text)}</p>`).join("")||"<p>Nenhuma venda detectada.</p>"}</div>
  `)}

  ${section("post","💬","Mensagem pós-venda","envia parabéns no chat",`
    <div class="toggle-line"><span>Enviar automaticamente</span><input id="post-enabled" class="toggle" type="checkbox" ${state.settings.postSaleEnabled?"checked":""}></div>
    <textarea id="post-message">${esc(state.settings.postSaleMessage)}</textarea>
    <div class="actions"><button id="save-post" class="btn-primary">Salvar mensagem</button><button id="test-post" class="btn-secondary">Testar no chat</button></div>
    <p id="post-status" class="helper">${state.settings.postSaleEnabled?"Agradecimento automático ATIVO.":"Agradecimento automático DESATIVADO."}</p>
  `,false)}

  ${section("protection","🛡️","Proteção contra Violação","encerra a LIVE ao detectar aviso crítico",`
    <div class="toggle-line"><span>Proteção automática</span><input id="protection-enabled" class="toggle" type="checkbox" ${state.settings.protectionEnabled?"checked":""}></div>
    <p class="helper">A detecção exige termos fortes como violação, diretrizes, advertência ou penalidade combinados com risco para a transmissão.</p>
    <div class="protection-status ${state.live.violation?"danger":state.settings.protectionEnabled?"armed":""}">
      <b>${state.live.violation?"🚨 AVISO DETECTADO":state.settings.protectionEnabled?"🛡️ PROTEÇÃO ARMADA":"Proteção desativada"}</b>
      <span>${state.live.violation?esc(state.live.violation.text.slice(0,220)):"Nenhum aviso crítico detectado."}</span>
    </div>
    <div class="toggle-line"><span>Notificar no Telegram</span><input id="protection-telegram" class="toggle" type="checkbox" ${state.settings.protectionTelegram!==false?"checked":""}></div>
    <label>Tempo mínimo entre ações (segundos)</label><input id="protection-cooldown" type="number" min="30" value="${state.settings.protectionCooldownSeconds||120}">
    <div class="actions"><button id="protection-save" class="btn-primary">Salvar proteção</button><button id="protection-test" class="btn-secondary">Executar teste seguro</button></div>
    <div class="actions"><button id="protection-end-now" class="btn-danger">Encerrar LIVE agora</button></div>
    <p id="protection-msg" class="helper">O teste seguro valida a detecção e procura o botão de encerramento sem clicar nele.</p>
    <div class="event-list">${state.protectionEvents.slice(-5).reverse().map(event=>`<p>${esc(event)}</p>`).join("")||"<p>Nenhum evento de proteção.</p>"}</div>
  `)}

  ${section("comments","🗨️","Comentários Automáticos","mensagens em intervalos aleatórios",`
    <textarea id="comments">${esc(state.settings.comments.join("\n"))}</textarea>
    <div class="card-row"><div><label>Mínimo</label><input id="min-delay" type="number" value="${state.settings.minCommentDelay}"></div><div><label>Máximo</label><input id="max-delay" type="number" value="${state.settings.maxCommentDelay}"></div></div>
    <div class="actions"><button id="comments-start" class="btn-primary">▶ Iniciar</button><button id="comments-stop" class="btn-danger">■ Parar</button></div>
    <p id="comments-status" class="helper">${state.settings.commentsEnabled?"Automação ativa no TikTok.":"Automação parada."}</p>
  `,false)}

  ${section("telegram","✈️","Notificações Telegram","vendas e alertas",`
    <div class="toggle-line"><span>Ativar notificações</span><input id="tg-enabled" class="toggle" type="checkbox" ${state.settings.telegramEnabled?"checked":""}></div>
    <label>Token do bot</label><input id="tg-token" value="${esc(state.settings.telegramToken)}"><label>Chat ID</label><input id="tg-chat" value="${esc(state.settings.telegramChatId)}">
    <div class="actions"><button id="tg-save" class="btn-primary">Salvar</button><button id="tg-test" class="btn-secondary">Testar</button></div><p id="tg-msg" class="helper"></p>
  `,false)}

  ${section("log","📋","Log de Eventos","diagnóstico em tempo real",`
    <div class="event-list"><p>Última leitura: ${state.live.lastScanAt?new Date(state.live.lastScanAt).toLocaleTimeString("pt-BR"):"—"}</p><p>Status do dashboard: ${state.live.dashboardDetected?"detectado":"não detectado"}</p></div>
  `,false)}
  `;
}
function audio(){return`<div class="title"><small>ÁUDIO</small><h2>Roteamento e reprodução</h2></div>
  ${section("vb-cable","🔊","VB-Cable","roteamento de áudio para o Live Studio",`
    <div class="setup-card"><span class="step-badge">1</span><div><b>Instalar o VB-Cable</b><p class="helper">Cabo de áudio virtual gratuito. Permite que o áudio reproduzido pela extensão seja recebido no TikTok Live Studio.</p></div></div>
    <div class="actions"><button id="vb-download" class="btn-primary">⬇ Baixar VB-Cable oficial</button></div>
    <div class="setup-card"><span class="step-badge">2</span><div><b>Configurar o Windows</b><p class="helper">1. Botão direito no ícone de som.<br>2. <b>Sons → Reprodução</b>.<br>3. Botão direito em <b>CABLE Input</b>.<br>4. Definir como dispositivo padrão.</p></div></div>
    <div class="setup-card"><span class="step-badge">3</span><div><b>Configurar o Live Studio</b><p class="helper">1. TikTok Live Studio → Configurações → Áudio.<br>2. Microfone → <b>CABLE Output</b>.<br>3. Salve e volte para a live.</p></div></div>
    <div class="actions"><button id="vb-test" class="btn-secondary">♫ Tocar som de teste</button></div>
    <p id="vb-msg" class="helper">💡 Se o medidor do Live Studio se mover, está configurado.</p>
  `)}
  ${section("audio-main","🎵","Áudio Infinito","arquivos em loop sem repetir a sequência",`
    <label class="file-drop" for="audio-files">🎵 Clique para selecionar suas gravações</label><input id="audio-files" class="hidden-file" type="file" accept="audio/*" multiple>
    <div class="file-list">${renderAudioFiles()}</div>
    <div class="player-line"><button id="audio-play" class="round-play">▶</button><span>🔊</span><input id="audio-volume" type="range" min="0" max="1" step=".01" value=".7"></div>
    <div class="actions"><button id="audio-stop" class="btn-danger">Parar</button></div>
  `)}
  ${section("clips","✂️","Trechos","duração e pausa entre cada trecho",`
    <label>Duração mínima</label><input id="clip-min" type="range" min="2" max="30" value="${state.settings.clipMinSeconds}">
    <label>Duração máxima</label><input id="clip-max" type="range" min="3" max="60" value="${state.settings.clipMaxSeconds}">
    <label>Pausa entre trechos</label><input id="clip-pause" type="range" min="0" max="10" value="${state.settings.clipPauseSeconds}">
  `,false)}
  ${section("ambient","🌿","Camada ao Vivo","sons sintéticos para presença humana",`
    <div class="ambient-grid">
      ${ambientToggle("ambient-noise","Ruído de sala","contínuo",state.settings.ambientNoiseEnabled)}
      ${ambientToggle("ambient-breath","Respirações","a cada 5–15s",state.settings.ambientBreathEnabled)}
      ${ambientToggle("ambient-mic","Variação de mic","oscilando",state.settings.ambientMicEnabled)}
      ${ambientToggle("ambient-clicks","Cliques","aleatórios",state.settings.ambientClicksEnabled)}
    </div>
    <label>Volume do ambiente</label><input id="ambient-volume" type="range" min="0" max="0.35" step=".01" value="${state.settings.ambientVolume}">
    <div class="actions"><button id="ambient-apply" class="btn-primary">Aplicar camada</button><button id="ambient-stop" class="btn-danger">Desativar tudo</button></div>
  `)} `}
function ai(){return`<div class="title"><small>PRO</small><h2>Assistente de IA</h2></div>${section("ai-main","🤖","Respostas Inteligentes","estrutura pronta",`<p class="helper">A resposta real precisa de uma API própria.</p><div class="event-list">${(state.live.chatMessages||[]).slice(-12).map(m=>`<p>${esc(m)}</p>`).join("")||"<p>Nenhuma mensagem detectada.</p>"}</div>`)}`}
function video(){return`<div class="title"><small>PRO</small><h2>Player de Vídeos</h2></div>${section("video-main","🎬","Player 9:16","adicione vários vídeos e organize a fila",`
    <label class="file-drop" for="video-files">🎬 Adicionar vídeos à fila</label><input id="video-files" class="hidden-file" type="file" accept="video/*" multiple>
    <div class="file-list">${renderVideoFiles()}</div>
    <div class="actions"><button id="video-open" class="btn-primary">Abrir Player 9:16</button><button id="video-clear" class="btn-danger">Limpar fila</button></div>
    <p id="video-msg" class="helper">Adicione novos vídeos quando quiser e remova qualquer arquivo pelo X.</p>
  `)}`}
function renderVideoFiles(){return state.videoFiles.length?state.videoFiles.map((file,index)=>`<div class="file-item"><span>🎬 ${esc(file.name)}</span><button data-remove-video="${index}" title="Remover">×</button></div>`).join(""):`<p class="helper">Nenhum vídeo selecionado.</p>`}
function renderAudioFiles(){return state.audioFiles.length?state.audioFiles.map((file,index)=>`<div class="file-item"><span>🎵 ${esc(file.name)}</span><button data-remove-audio="${index}" title="Remover">×</button></div>`).join(""):`<p class="helper">Nenhuma gravação selecionada.</p>`}
function ambientToggle(id,title,sub,checked){return`<div class="ambient-card"><div><b>${title}</b><small>${sub}</small></div><input id="${id}" class="toggle" type="checkbox" ${checked?"checked":""}></div>`}
function stopAmbient(){state.ambientTimers.forEach(clearTimeout);state.ambientTimers=[];state.ambientNodes.forEach(node=>{try{node.stop?.()}catch{}try{node.disconnect?.()}catch{}});state.ambientNodes=[];if(state.ambientContext){state.ambientContext.close().catch(()=>{});state.ambientContext=null}}
function startAmbient(){stopAmbient();const enabled=state.settings.ambientNoiseEnabled||state.settings.ambientBreathEnabled||state.settings.ambientMicEnabled||state.settings.ambientClicksEnabled;if(!enabled)return;const ctx=new AudioContext(),master=ctx.createGain();master.gain.value=state.settings.ambientVolume;master.connect(ctx.destination);state.ambientContext=ctx;
if(state.settings.ambientNoiseEnabled){const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.12;const src=ctx.createBufferSource();src.buffer=buffer;src.loop=true;src.connect(master);src.start();state.ambientNodes.push(src)}
const breath=()=>{if(!state.ambientContext||!state.settings.ambientBreathEnabled)return;const buffer=ctx.createBuffer(1,ctx.sampleRate*1.2,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.sin(Math.PI*i/data.length)*.22;const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter();filter.type="lowpass";filter.frequency.value=900;src.buffer=buffer;src.connect(filter).connect(master);src.start();state.ambientNodes.push(src);state.ambientTimers.push(setTimeout(breath,(5+Math.random()*10)*1000))};breath();
const click=()=>{if(!state.ambientContext||!state.settings.ambientClicksEnabled)return;const osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=1200+Math.random()*700;gain.gain.setValueAtTime(.12,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.04);osc.connect(gain).connect(master);osc.start();osc.stop(ctx.currentTime+.05);state.ambientNodes.push(osc);state.ambientTimers.push(setTimeout(click,(3+Math.random()*9)*1000))};click()}
function playTestTone(){const ctx=new AudioContext(),gain=ctx.createGain(),osc=ctx.createOscillator();osc.frequency.value=660;gain.gain.setValueAtTime(.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.18,ctx.currentTime+.03);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.65);osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.7);setTimeout(()=>ctx.close(),900)}
function settings(){
  const days=
    state.license?.remainingDays ??
    Math.max(
      0,
      Math.ceil(
        (new Date(state.license.expiresAt)-new Date())/
        86400000
      )
    );

  return`<div class="title"><small>CONFIGURAÇÕES</small><h2>Conta</h2></div>${section("account","⚙️","Licença e conta","dados sincronizados com o Admin",`
    <p>${esc(state.license.email)}</p>
    <p class="helper">
      Plano ${state.license.plan.toUpperCase()} ·
      ${days} dias restantes
    </p>
    <p class="helper">
      Status: ${state.license.status||"active"}
    </p>
    <div class="actions">
      <button id="sync-license" class="btn-secondary">
        Sincronizar agora
      </button>
      <button id="logout" class="btn-danger">
        Sair
      </button>
    </div>
    <p id="license-sync-status" class="helper"></p>
  `)}`}
function bind(){
  document.querySelectorAll("[data-collapse]").forEach(b=>b.onclick=async()=>{const id=b.dataset.collapse;state.collapse[id]=!(state.collapse[id]??false);await saveCollapse();render()});
  document.getElementById("scan")?.addEventListener("click",()=>post("ORION_FORCE_SCAN"));
  document.querySelectorAll("[data-time]").forEach(b=>b.onclick=()=>{document.getElementById("timer-minutes").value=b.dataset.time;document.querySelectorAll("[data-time]").forEach(x=>x.classList.remove("active"));b.classList.add("active")});
  document.getElementById("timer-start")?.addEventListener("click",async()=>{
    if(state.endAt){
      state.endAt=null;
      state.settings.endTimerAt=null;
      clearInterval(state.endTimer);
      state.endTimer=null;
      await saveSettings();
      render();
      return;
    }

    const m=Math.max(1,+document.getElementById("timer-minutes").value||1);
    state.settings.endTimerMinutes=m;
    state.endAt=Date.now()+m*60000;
    state.settings.endTimerAt=state.endAt;
    await saveSettings();
    startTicker();
    render();
  });
  document.getElementById("pin")?.addEventListener("click",async()=>{await post("ORION_PIN_PRODUCT",{skipCoupons:state.settings.skipCoupons!==false});const m=document.getElementById("pin-msg");if(m)m.textContent="Procurando produto principal e ignorando cupons."});
  document.getElementById("unpin")?.addEventListener("click",()=>post("ORION_UNPIN_PRODUCT"));
  document.getElementById("auto-pin")?.addEventListener("change",async e=>{
    state.settings.autoPinEnabled=e.target.checked;
    await saveSettings();
    const message=document.getElementById("product-auto-status");
    if(message)message.textContent=e.target.checked?"Ativa: usa o botão DESAFIXAR como confirmação e refaz o ciclo a cada 20 segundos.":"Fixação automática desativada.";
    if(e.target.checked)await post("ORION_PIN_PRODUCT",{skipCoupons:state.settings.skipCoupons!==false});
  });
  document.getElementById("skip-coupons")?.addEventListener("change",async e=>{state.settings.skipCoupons=e.target.checked;await saveSettings()});
  document.getElementById("protection-save")?.addEventListener("click",async()=>{
    state.settings.protectionEnabled=document.getElementById("protection-enabled").checked;
    state.settings.protectionTelegram=document.getElementById("protection-telegram").checked;
    state.settings.protectionCooldownSeconds=Math.max(30,+document.getElementById("protection-cooldown").value||120);
    await saveSettings();
    const message=document.getElementById("protection-msg");
    if(message)message.textContent=state.settings.protectionEnabled?"🛡️ Proteção automática armada.":"Proteção salva no modo somente aviso.";
  });
  document.getElementById("protection-test")?.addEventListener("click",()=>{
    const message=document.getElementById("protection-msg");
    if(message)message.textContent="Executando diagnóstico seguro...";
    post("ORION_TEST_PROTECTION");
  });
  document.getElementById("protection-end-now")?.addEventListener("click",()=>{
    if(confirm("Deseja realmente encerrar a LIVE agora?"))post("ORION_END_LIVE",{dryRun:false});
  });
  document.getElementById("post-enabled")?.addEventListener("change",async e=>{
    state.settings.postSaleEnabled=e.target.checked;
    state.settings.postSaleMessage=document.getElementById("post-message").value;
    await saveSettings();

    const status=document.getElementById("post-status");
    if(status){
      status.textContent=e.target.checked
        ?"Agradecimento automático ATIVO. Será enviado após cada nova venda detectada."
        :"Agradecimento automático DESATIVADO.";
    }
  });

  document.getElementById("save-post")?.addEventListener("click",async()=>{
    state.settings.postSaleEnabled=document.getElementById("post-enabled").checked;
    state.settings.postSaleMessage=document.getElementById("post-message").value.trim();
    await saveSettings();

    const status=document.getElementById("post-status");
    if(status){
      status.textContent=state.settings.postSaleEnabled
        ?"Mensagem salva e agradecimento automático ATIVO."
        :"Mensagem salva. Ative a chave acima para enviar automaticamente.";
    }
  });

  document.getElementById("test-post")?.addEventListener("click",async()=>{
    const message=document.getElementById("post-message").value.replace(/\{nome\}/gi,"Cliente");
    const result=await post("ORION_SEND_CHAT",{text:message});
    const status=document.getElementById("post-status");

    if(status){
      status.textContent=result?.ok
        ?"Mensagem de teste enviada ao chat."
        :`Falha no teste: ${result?.error||"campo do chat não localizado"}`;
    }
  });
  document.getElementById("comments-start")?.addEventListener("click",async()=>{state.settings.comments=document.getElementById("comments").value.split("\n").map(x=>x.trim()).filter(Boolean);state.settings.minCommentDelay=+document.getElementById("min-delay").value||45;state.settings.maxCommentDelay=+document.getElementById("max-delay").value||90;state.settings.commentsEnabled=true;await saveSettings();const event=document.getElementById("comments-status");if(event)event.textContent="Comentários automáticos ativados."});
  document.getElementById("comments-stop")?.addEventListener("click",async()=>{clearTimeout(state.commentTimer);state.commentTimer=null;state.settings.commentsEnabled=false;await saveSettings();const event=document.getElementById("comments-status");if(event)event.textContent="Comentários automáticos parados."});
  document.getElementById("tg-save")?.addEventListener("click",async()=>{state.settings.telegramEnabled=document.getElementById("tg-enabled").checked;state.settings.telegramToken=document.getElementById("tg-token").value.trim();state.settings.telegramChatId=document.getElementById("tg-chat").value.trim();await saveSettings()});
  document.getElementById("tg-test")?.addEventListener("click",async()=>{const r=await chrome.runtime.sendMessage({type:"ORION_TELEGRAM_SEND",payload:{token:document.getElementById("tg-token").value.trim(),chatId:document.getElementById("tg-chat").value.trim(),text:"✅ Teste do Live Infinity."}});document.getElementById("tg-msg").textContent=r?.ok?"Enviado com sucesso.":(r?.error||"Falha.")});
  document.getElementById("vb-download")?.addEventListener("click",()=>chrome.tabs.create({url:"https://vb-audio.com/Cable/"}));
  document.getElementById("vb-test")?.addEventListener("click",()=>{playTestTone();const m=document.getElementById("vb-msg");if(m)m.textContent="♫ Som reproduzido. Confira o medidor do Live Studio."});
  document.getElementById("audio-files")?.addEventListener("change",e=>{state.audioFiles.push(...[...e.target.files].map(f=>({name:f.name,url:URL.createObjectURL(f)})));render()});
  document.querySelectorAll("[data-remove-audio]").forEach(b=>b.addEventListener("click",()=>{const [r]=state.audioFiles.splice(+b.dataset.removeAudio,1);if(r)URL.revokeObjectURL(r.url);render()}));
  document.getElementById("audio-play")?.addEventListener("click",()=>{if(!state.audioFiles.length)return;const play=()=>{if(!state.audioFiles.length)return;state.audio?.pause();const item=state.audioFiles[state.audioIndex%state.audioFiles.length];state.audio=new Audio(item.url);state.audio.volume=+document.getElementById("audio-volume")?.value||.7;state.audio.onended=()=>{state.audioIndex=(state.audioIndex+1)%state.audioFiles.length;setTimeout(play,(+state.settings.clipPauseSeconds||0)*1000)};state.audio.play()};play()});
  document.getElementById("audio-stop")?.addEventListener("click",()=>{state.audio?.pause();state.audio=null});
  document.getElementById("audio-volume")?.addEventListener("input",e=>{if(state.audio)state.audio.volume=+e.target.value});
  for(const [id,key] of [["clip-min","clipMinSeconds"],["clip-max","clipMaxSeconds"],["clip-pause","clipPauseSeconds"]])document.getElementById(id)?.addEventListener("input",async e=>{state.settings[key]=+e.target.value;await saveSettings()});
  document.getElementById("ambient-apply")?.addEventListener("click",async()=>{state.settings.ambientNoiseEnabled=document.getElementById("ambient-noise").checked;state.settings.ambientBreathEnabled=document.getElementById("ambient-breath").checked;state.settings.ambientMicEnabled=document.getElementById("ambient-mic").checked;state.settings.ambientClicksEnabled=document.getElementById("ambient-clicks").checked;state.settings.ambientVolume=+document.getElementById("ambient-volume").value;await saveSettings();startAmbient()});
  document.getElementById("ambient-stop")?.addEventListener("click",async()=>{stopAmbient();state.settings.ambientNoiseEnabled=state.settings.ambientBreathEnabled=state.settings.ambientMicEnabled=state.settings.ambientClicksEnabled=false;await saveSettings();render()});
  document.getElementById("video-files")?.addEventListener("change",e=>{state.videoFiles.push(...[...e.target.files].map(f=>({name:f.name,url:URL.createObjectURL(f)})));render()});
  document.querySelectorAll("[data-remove-video]").forEach(b=>b.addEventListener("click",()=>{const [r]=state.videoFiles.splice(+b.dataset.removeVideo,1);if(r)URL.revokeObjectURL(r.url);render()}));
  document.getElementById("video-clear")?.addEventListener("click",()=>{state.videoFiles.forEach(f=>URL.revokeObjectURL(f.url));state.videoFiles=[];render()});
  document.getElementById("video-open")?.addEventListener("click",()=>{if(!state.videoFiles.length){document.getElementById("video-msg").textContent="Selecione vídeos.";return}window.open(`../player/index.html?files=${encodeURIComponent(JSON.stringify(state.videoFiles))}`,"orion-player","width=520,height=900")});
  document.getElementById("sync-license")?.addEventListener("click",async()=>{
    const status=
      document.getElementById("license-sync-status");

    try{
      if(status)status.textContent="Sincronizando...";

      state.license=
        await validateOnlineLicense(state.license);

      if(status){
        status.textContent=
          `Atualizado: Plano ${state.license.plan.toUpperCase()} · ${state.license.remainingDays} dias.`;
      }

      setTimeout(()=>renderWhenSafe(),600);
    }catch(error){
      if(status)status.textContent=error.message;
    }
  });

  document.getElementById("logout")?.addEventListener("click",async()=>{
    await chrome.storage.local.remove([
      ORION.STORAGE.LICENSE
    ]);

    state.license=null;
    render();
  });
}
function scheduleComment(){clearTimeout(state.commentTimer);if(!state.settings.commentsEnabled||!state.settings.comments.length)return;const min=Math.max(5,state.settings.minCommentDelay),max=Math.max(min,state.settings.maxCommentDelay),delay=(Math.floor(Math.random()*(max-min+1))+min)*1000;state.commentTimer=setTimeout(()=>{post("ORION_SEND_CHAT",{text:state.settings.comments[Math.floor(Math.random()*state.settings.comments.length)]});scheduleComment()},delay)}
function startTicker(){clearInterval(state.endTimer);state.endTimer=setInterval(()=>{if(!state.endAt)return;const r=Math.max(0,Math.ceil((state.endAt-Date.now())/1000)),el=document.getElementById("remaining");if(el)el.textContent=fmt(r);if(r===0){clearInterval(state.endTimer);state.endTimer=null;state.endAt=null;const msg=document.getElementById("timer-status");if(msg)msg.textContent="Tempo concluído. Encerramento automático solicitado."}},1000)}
chrome.runtime.onMessage.addListener((message)=>{
  if(message?.type==="ORION_AUTOMATION_EVENT"){
    const payload=message.payload||{};
    const time=new Date(payload.createdAt||Date.now()).toLocaleTimeString("pt-BR");

    let description="Evento de automação.";
    if(payload.kind==="comment-sent")description=`${time} · Comentário enviado após intervalo aleatório de ${payload.delaySeconds||"?"}s: ${payload.message}`;
    if(payload.kind==="comment-failed")description=`${time} · Falha ao enviar comentário: ${payload.result?.error||"campo não localizado"}`;
    if(payload.kind==="product-pinned")description=`${time} · Produto principal fixado`;
    if(payload.kind==="product-pin-failed")description=`${time} · Falha ao fixar produto: ${payload.result?.error||"botão não localizado"}`;
    if(payload.kind==="product-refreshed")description=`${time} · Produto corrigido (${payload.result?.reason||"ciclo"}): desafixado e fixado novamente`;
    if(payload.kind==="product-refresh-failed")description=`${time} · Falha no ciclo Desafixar → Fixar: ${payload.result?.error||payload.result?.steps?.find(step=>!step.ok)?.error||"erro desconhecido"}`;
    if(payload.kind==="protection-auto-enabled")description=`${time} · Proteção contra violação ativada automaticamente ao iniciar a LIVE`;

    state.protectionEvents.push(description);
    state.protectionEvents=state.protectionEvents.slice(-30);

    if(state.page==="home")renderWhenSafe();
    return;
  }

  if(message?.type==="ORION_PROTECTION_EVENT"){
    const payload=message.payload||{};
    const time=new Date().toLocaleTimeString("pt-BR");
    let description="Evento de proteção.";

    if(payload.kind==="detected")description=`${time} · Aviso crítico detectado${payload.automatic?" · encerramento automático acionado":" · somente aviso"}`;
    if(payload.kind==="ended")description=`${time} · LIVE encerrada automaticamente`;
    if(payload.kind==="failed")description=`${time} · Falha ao encerrar: ${payload.result?.error||"erro desconhecido"}`;
    if(payload.kind==="test")description=`${time} · Teste: detecção ${payload.classification?.detected?"OK":"FALHOU"} · botão ${payload.buttonTest?.ok?"localizado":"não localizado"}`;
    if(payload.kind==="manual-end-result")description=`${time} · Encerramento manual: ${payload.result?.ok?"acionado":payload.result?.error||"falhou"}`;

    state.protectionEvents.push(description);
    state.protectionEvents=state.protectionEvents.slice(-30);

    const status=document.getElementById("protection-msg");
    if(status)status.textContent=description;

    if(state.page==="home")renderWhenSafe();
    return;
  }

  if(message?.type!=="ORION_STATE")return;

  state.live=message.payload;

  if(state.page==="home"){
    updateLiveFields();

    if(state.pendingRender&&!isEditingPanel()){
      renderWhenSafe();
    }
  }
});

app.addEventListener("focusout",()=>{
  setTimeout(()=>{
    if(state.pendingRender&&!isEditingPanel()){
      renderWhenSafe();
    }
  },120);
});

async function periodicLicenseValidation(){
  if(!state.license)return;

  try{
    const previousPlan=state.license.plan;
    const previousStatus=state.license.status;

    state.license=
      await validateOnlineLicense(state.license);

    if(
      previousPlan!==state.license.plan ||
      previousStatus!==state.license.status
    ){
      renderWhenSafe();
    }
  }catch(error){
    state.license=null;
    state.licenseError=error.message;

    await chrome.storage.local.remove([
      ORION.STORAGE.LICENSE
    ]);

    render();
  }
}

(async()=>{
  await load();
  render();

  setInterval(()=>{
    periodicLicenseValidation();
  },15000);
})();

