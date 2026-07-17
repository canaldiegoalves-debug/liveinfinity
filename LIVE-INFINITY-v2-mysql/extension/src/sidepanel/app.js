const app=document.getElementById("app");

const state={
  page:"home",
  license:null,
  settings:{...ORION.DEFAULTS},
  collapse:{},
  live:{dashboardDetected:false,live:false,elapsedSeconds:0,viewers:null,sales:0,gmv:null,product:null,saleEvents:[],chatMessages:[],violation:null,protectionStatus:"idle",lastScanAt:null},
  commentTimer:null,endAt:null,endTimer:null,timerPaused:false,timerRemainingMs:null,audio:null,audioFiles:[],videoFiles:[],audioIndex:0,ambientContext:null,ambientNodes:[],ambientTimers:[],protectionEvents:[],pendingRender:false,licenseError:"",updateInfo:null,updateChecking:false
};


async function sha256Hex(value){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)]
    .map(byte=>byte.toString(16).padStart(2,"0"))
    .join("");
}

function webglIdentity(){
  try{
    const canvas=document.createElement("canvas");
    const gl=canvas.getContext("webgl")||canvas.getContext("experimental-webgl");
    if(!gl)return "";

    const extension=gl.getExtension("WEBGL_debug_renderer_info");
    const vendor=extension
      ?gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)
      :gl.getParameter(gl.VENDOR);
    const renderer=extension
      ?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
      :gl.getParameter(gl.RENDERER);

    return `${vendor||""}|${renderer||""}`;
  }catch{
    return "";
  }
}

async function computerFingerprint(){
  const highEntropy=await navigator.userAgentData?.getHighEntropyValues?.([
    "architecture",
    "bitness",
    "model",
    "platformVersion"
  ]).catch(()=>({}))||{};

  const signals=[
    navigator.userAgentData?.platform||navigator.platform||"",
    highEntropy.architecture||"",
    highEntropy.bitness||"",
    highEntropy.model||"",
    navigator.hardwareConcurrency||0,
    navigator.deviceMemory||0,
    screen.width||0,
    screen.height||0,
    screen.colorDepth||0,
    Intl.DateTimeFormat().resolvedOptions().timeZone||"",
    navigator.languages?.join(",")||navigator.language||"",
    webglIdentity()
  ];

  return sha256Hex(signals.join("||"));
}

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
  const deviceFingerprint=await computerFingerprint();

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
        deviceId,
        deviceFingerprint
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
    plan:String(
      body.license?.plan ||
      body.accountPlan ||
      body.plan ||
      license.plan ||
      "basic"
    ).toLowerCase(),
    active:true,
    validatedAt:new Date().toISOString()
  };

  await chrome.storage.local.set({
    [ORION.STORAGE.LICENSE]:validated
  });

  return validated;
}


function compareAppVersions(left,right){
  const a=String(left||"0.0.0").split("-")[0].split(".").map(Number);
  const b=String(right||"0.0.0").split("-")[0].split(".").map(Number);

  for(let index=0;index<3;index+=1){
    const difference=(a[index]||0)-(b[index]||0);
    if(difference!==0)return difference;
  }

  return 0;
}

async function checkMandatoryUpdate(){
  if(state.updateChecking)return state.updateInfo;
  state.updateChecking=true;

  try{
    const manifest=chrome.runtime.getManifest();
    const response=await fetch(
      `${ORION.API_BASE_URL}/api/updates/latest?currentVersion=${encodeURIComponent(manifest.version)}`,
      {cache:"no-store"}
    );

    const body=await response.json().catch(()=>({}));

    if(!response.ok||!body.ok){
      throw new Error(body.error||"Não foi possível verificar atualizações.");
    }

    state.updateInfo=
      body.mandatory&&
      body.update&&
      compareAppVersions(body.update.version,manifest.version)>0
        ?body.update
        :null;

    return state.updateInfo;
  }catch(error){
    // Sem bloquear por falha temporária de internet.
    console.warn("Falha ao verificar atualização:",error);
    return state.updateInfo;
  }finally{
    state.updateChecking=false;
  }
}

function mandatoryUpdateHtml(){
  const update=state.updateInfo;
  if(!update)return"";

  const items=String(update.changelog||"")
    .split(/\r?\n/)
    .map(item=>item.replace(/^[-•✔\s]+/,"").trim())
    .filter(Boolean);

  return`
    <div class="mandatory-update-overlay">
      <div class="mandatory-update-modal">
        <div class="mandatory-update-icon">⬆️</div>
        <span class="mandatory-update-kicker">ATUALIZAÇÃO OBRIGATÓRIA</span>
        <h2>${esc(update.title||"Nova versão disponível")}</h2>
        <strong>Versão ${esc(update.version)}</strong>

        <p>${esc(update.description||"Atualize para continuar usando o Live Infinity.")}</p>

        ${items.length?`
          <div class="mandatory-update-changelog">
            ${items.map(item=>`<div>✔ ${esc(item)}</div>`).join("")}
          </div>
        `:""}

        <div class="mandatory-update-warning">
          O sistema ficará bloqueado até a nova versão ser instalada.
        </div>

        <a
          id="mandatory-update-download"
          class="mandatory-update-download"
          href="${esc(update.downloadUrl)}"
          target="_blank"
          rel="noopener"
        >
          📥 Baixar atualização
        </a>

        <details class="mandatory-update-help">
          <summary>Como instalar</summary>
          <ol>
            <li>Baixe e extraia o ZIP.</li>
            <li>Abra <code>chrome://extensions</code>.</li>
            <li>Remova a versão antiga.</li>
            <li>Clique em Carregar sem compactação.</li>
            <li>Selecione a nova pasta <code>extension</code>.</li>
          </ol>
        </details>

        <small>
          Versão instalada: ${esc(chrome.runtime.getManifest().version)}
        </small>
      </div>
    </div>
  `;
}

async function load(){
  await checkMandatoryUpdate();
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
  state.timerPaused=Boolean(state.settings.endTimerPaused);
  state.timerRemainingMs=Number(state.settings.endTimerRemainingMs||0)||null;
  if(state.endAt&&!state.timerPaused&&state.endAt>Date.now())startTicker();
  if(state.endAt&&!state.timerPaused&&state.endAt<=Date.now())state.endAt=null;
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
async function saveSettings(){
  state.settings.skipCoupons=true;await chrome.storage.local.set({[ORION.STORAGE.SETTINGS]:state.settings})}
async function saveCollapse(){await chrome.storage.local.set({[ORION.STORAGE.COLLAPSE]:state.collapse})}
function valid(){return !!(state.license?.active&&new Date(state.license.expiresAt)>new Date())}
function pro(){return ["pro","premium"].includes(String(state.license?.plan||"").toLowerCase())}

  document.getElementById("download-cash-sound")?.addEventListener("click", async () => {
    try {
      const url = chrome.runtime.getURL("assets/caixa-registradora-live-infinity.wav");
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "caixa-registradora-live-infinity.wav";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);

      const status = document.getElementById("cash-sound-status");
      if (status) status.textContent = "Som baixado com sucesso.";
    } catch (error) {
      const status = document.getElementById("cash-sound-status");
      if (status) status.textContent = "Não foi possível baixar o som.";
    }
  });

  document.getElementById("test-cash-sound")?.addEventListener("click", async () => {
    try {
      const audio = new Audio(
        chrome.runtime.getURL("assets/caixa-registradora-live-infinity.wav")
      );
      await audio.play();

      const status = document.getElementById("cash-sound-status");
      if (status) status.textContent = "Reproduzindo som de teste.";
    } catch (error) {
      const status = document.getElementById("cash-sound-status");
      if (status) status.textContent = "O navegador bloqueou a reprodução do som.";
    }
  });


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
  const deviceFingerprint=await computerFingerprint();

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
        deviceId,
        deviceFingerprint
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
    plan:String(
      body.license?.plan ||
      body.accountPlan ||
      body.plan ||
      "basic"
    ).toLowerCase(),
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
        <small>Plano ${String(state.license?.plan||"basic").toLowerCase()==="premium"?"Premium":pro()?"Pro":"Básico"} · Automação infinita</small>
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
  setText('[data-live-value="gmv"]',state.live.gmv!==null&&state.live.gmv!==undefined?`R$ ${Number(state.live.gmv).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"—");

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

  app.innerHTML=`${mandatoryUpdateHtml()}<header class="brand-header login-brand">
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
    <p>Digite o e-mail cadastrado e a sua chave de acesso.</p>

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
  if((state.page==="ai"||state.page==="video")&&!pro()){el.innerHTML=`<div class="locked"><h2>🔒 Recurso avançado</h2><p>Disponível nos planos Pro e Premium.</p></div>`;return}
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

  ${section("timer","⏱️","Timer de Encerramento","encerra a live automaticamente",`
    <div class="timer-header-line">
      <p class="helper timer-description">Encerra a live automaticamente no horário definido.</p>
      <span id="timer-badge" class="timer-badge ${state.timerPaused?"paused":state.endAt?"active":"inactive"}">
        ${state.timerPaused?"Pausado":state.endAt?"Ativo":"Inativo"}
      </span>
    </div>

    <div class="timer-panel">
      <span class="timer-kicker">TEMPO RESTANTE</span>
      <strong id="remaining" class="timer-clock ${timerRemaining<=599&&timerRemaining>0?"timer-critical":""}">${fmt(timerRemaining)}</strong>
      <small id="timer-started-label">
        ${state.settings.endTimerStartedAt
          ? `Iniciado: ${new Date(state.settings.endTimerStartedAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`
          : "Iniciado: —"}
      </small>
    </div>

    <label class="timer-label">DURAÇÃO DA LIVE</label>
    <div class="quick-times timer-quick-times">
      <button data-time="60">1h</button>
      <button data-time="120">2h</button>
      <button data-time="240">4h</button>
      <button data-time="360">6h</button>
      <button data-time="480">8h</button>
    </div>

    <div class="timer-manual-row">
      <label for="timer-minutes">Ou digite manualmente</label>
      <div class="timer-input-wrap">
        <input id="timer-minutes" type="number" min="1" value="${state.settings.endTimerMinutes}">
        <span>min</span>
      </div>
    </div>

    <div class="timer-secondary-actions">
      <button id="timer-pause" class="timer-pause-button" type="button" ${!state.endAt&&!state.timerPaused?"disabled":""}>
        ${state.timerPaused?"▶ Continuar Timer":"Ⅱ Pausar Timer"}
      </button>
      <button id="timer-cancel" class="timer-cancel-button" type="button" ${!state.endAt&&!state.timerPaused?"disabled":""}>
        ■ Cancelar
      </button>
    </div>

    <button id="timer-start" class="timer-start-button" type="button" ${state.endAt||state.timerPaused?"disabled":""}>
      ▶ Iniciar ciclo
    </button>

    <p id="timer-status" class="helper timer-status">
      ${state.timerPaused
        ? "Timer pausado. A contagem continuará do ponto atual."
        : state.endAt
          ? "Timer ativo. A LIVE será encerrada automaticamente."
          : "Defina a duração e inicie o ciclo."}
    </p>
  `)}

  ${section("product","📌","Fixação de Produto","controle rápido do produto atual",`
    <div class="toggle-line"><span>Fixar Produto #1</span><input id="auto-pin" class="toggle" type="checkbox" ${state.settings.autoPinEnabled?"checked":""}></div>
    <div class="toggle-line mandatory-coupon-rule">
      <div>
        <strong>Ignorar cupons de desconto</strong>
        <p class="helper">Proteção obrigatória: cupons, vouchers, descontos e frete grátis nunca serão fixados.</p>
      </div>
      <input id="skip-coupons" class="toggle" type="checkbox" checked disabled>
    </div>
    <p class="helper">Ignora linhas com cupom, voucher ou desconto e procura a primeira linha com preço, estoque e imagem de produto.</p>
    <p class="helper">Produto detectado: ${esc(state.live.product||"nenhum")}</p>
    <p id="product-auto-status" class="helper">${state.settings.autoPinEnabled?"Ativa: usa o botão DESAFIXAR como confirmação e refaz o ciclo a cada 20 segundos.":"Fixação automática desativada."}</p>
    <div class="actions"><button id="pin" class="btn-primary">Fixar produto principal</button><button id="unpin" class="btn-secondary">Desafixar</button></div><p id="pin-msg" class="helper"></p>
  `)}

  ${section("sales","🛒","Contador de Vendas","eventos da sessão atual",`
    <div class="card-row"><div class="mini-card"><span>Vendas</span><strong data-live-value="sales">${state.live.sales}</strong></div><div class="mini-card"><span>GMV</span><strong data-live-value="gmv">${state.live.gmv!==null&&state.live.gmv!==undefined?`R$ ${Number(state.live.gmv).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"—"}</strong></div></div>
    <div class="event-list">${(state.live.saleEvents||[]).slice(-8).reverse().map(e=>`<p>🛒 ${esc(e.text)}</p>`).join("")||"<p>Nenhuma venda detectada.</p>"}</div>
  `)}

  ${section("post","💬","Prova social após vendas","uma mensagem agrupada, sem flood",`
    <div class="toggle-line"><span>Enviar automaticamente</span><input id="post-enabled" class="toggle" type="checkbox" ${state.settings.postSaleEnabled?"checked":""}></div>
    <label>Mensagens de prova social</label>
    <textarea id="post-message" rows="7" placeholder="Digite uma mensagem por linha">${esc((state.settings.postSaleMessages||[state.settings.postSaleMessage]).join("\n"))}</textarea>
    <p class="helper">Use <code>{salesCount}</code> para inserir a quantidade real de vendas. As mensagens são usadas em sequência.</p>
    <label>Espera para agrupar vendas (segundos)</label>
    <input id="post-delay" type="number" min="5" value="${state.settings.postSaleDelaySeconds||10}">
    <div class="actions"><button id="save-post" class="btn-primary">Salvar prova social</button><button id="test-post" class="btn-secondary">Testar no chat</button></div>
    <p id="post-status" class="helper">${state.settings.postSaleEnabled?"Prova social automática ATIVA.":"Prova social automática DESATIVADA."}</p>
  `,false)}

  
    

    ${section("comments","🗨️","Comentários Automáticos","envio em sequência, respeitando o intervalo configurado",`
    <label>Lista de comentários</label>

    <textarea
      id="comments"
      rows="9"
      placeholder="Digite um comentário por linha. Exemplo:&#10;Aproveite a oferta na sacola!&#10;Esse produto está saindo muito!&#10;Garanta o seu antes que acabe!"
    >${esc((state.settings.comments||[]).join("\n"))}</textarea>

    <p class="helper">
      Os exemplos transparentes são apenas uma orientação e não serão enviados.
      A extensão usa somente os comentários que você salvar.
    </p>

    <div class="card-row">
      <div>
        <label>Intervalo mínimo (segundos)</label>
        <input
          id="min-delay"
          type="number"
          min="1"
          value="${state.settings.minCommentDelay}"
        >
      </div>

      <div>
        <label>Intervalo máximo (segundos)</label>
        <input
          id="max-delay"
          type="number"
          min="1"
          value="${state.settings.maxCommentDelay}"
        >
      </div>
    </div>

    <p class="helper">
      A ordem será: primeiro, segundo, terceiro e assim por diante.
      Ao chegar ao final da lista, volta ao primeiro comentário.
    </p>

    <div class="actions">
      <button id="comments-save" class="btn-secondary">
        💾 Salvar comentários
      </button>

      <button id="comments-start" class="btn-primary">
        ▶ Iniciar comentários
      </button>

      <button id="comments-stop" class="btn-danger">
        ■ Parar
      </button>
    </div>

    <p id="comments-status" class="helper">
      ${state.settings.commentsEnabled
        ? "Comentários ativos."
        : (state.settings.comments||[]).length
          ? `${state.settings.comments.length} comentário(s) salvo(s).`
          : "Nenhum comentário salvo."}
    </p>

    <div
      id="comment-progress-card"
      class="comment-progress-card ${state.settings.commentsEnabled?"active":"inactive"}"
    >
      <div class="comment-progress-header">
        <strong>Próximo comentário</strong>
        <span id="comment-progress-time">
          ${state.settings.commentsEnabled
            ?"Aguardando cronômetro..."
            :"Comentários parados"}
        </span>
      </div>

      <div class="comment-progress-track">
        <div
          id="comment-progress-bar"
          class="comment-progress-bar"
          style="width:0%"
        ></div>
      </div>

      <div class="comment-progress-footer">
        <span id="comment-progress-position">
          ${(state.settings.comments||[]).length
            ?"Sequência pronta"
            :"Nenhum comentário na lista"}
        </span>

        <span id="comment-progress-percent">
          0%
        </span>
      </div>

      <p
        id="comment-progress-next"
        class="comment-progress-next"
      >
        A barra será iniciada quando os comentários estiverem ativos.
      </p>
    </div>
  `,false)}

  ${section("telegram","✈️","Notificações Telegram","Receba alertas de venda e violação no celular",`
    <div class="liveflow-telegram-header">
      <div>
        <strong>✈️ Notificações Telegram</strong>
        <p>Receba alertas de venda e violação no celular</p>
      </div>
      <span
        id="telegram-badge"
        class="telegram-liveflow-badge ${state.settings.telegramEnabled&&state.settings.telegramToken&&state.settings.telegramChatId?"active":"inactive"}"
      >
        ${state.settings.telegramEnabled&&state.settings.telegramToken&&state.settings.telegramChatId?"Ativo":"Inativo"}
      </span>
    </div>

    <div
      id="telegram-form-box"
      class="${state.settings.telegramToken&&state.settings.telegramChatId?"hidden-telegram-box":""}"
    >
      <label class="telegram-liveflow-label">
        🤖 Token do Bot
        <input
          id="telegram-token"
          type="text"
          value="${esc(state.settings.telegramToken)}"
          placeholder="Ex: 8604787663:AAEiSf0juY..."
        >
      </label>

      <label class="telegram-liveflow-label">
        💬 Seu Chat ID
        <input
          id="telegram-chat"
          type="text"
          value="${esc(state.settings.telegramChatId)}"
          placeholder="Ex: 1071972751"
        >
      </label>

      <button
        id="save-telegram"
        class="btn-primary telegram-full-button"
      >
        💾 Salvar configuração
      </button>

      <details class="telegram-liveflow-help">
        <summary>📖 Como configurar notificações?</summary>
        <div>
          <strong>Passo 1 — Criar seu Bot</strong>
          <p>1. Abra o Telegram e acesse <b>@BotFather</b>.</p>
          <p>2. Envie <code>/newbot</code>.</p>
          <p>3. Escolha um nome e um username terminado em <b>bot</b>.</p>
          <p>4. Copie o Token recebido e cole acima.</p>

          <strong>Passo 2 — Pegar seu Chat ID</strong>
          <p>1. Abra <b>@userinfobot</b>.</p>
          <p>2. Envie qualquer mensagem.</p>
          <p>3. Copie o número do campo <b>Id</b>.</p>

          <strong>Passo 3 — Ativar</strong>
          <p>1. Salve a configuração.</p>
          <p>2. Clique em Testar notificação.</p>
          <p>3. Recebeu? Está pronto.</p>
        </div>
      </details>
    </div>

    <div
      id="telegram-confirm-box"
      class="telegram-confirm-box ${state.settings.telegramToken&&state.settings.telegramChatId?"":"hidden-telegram-box"}"
    >
      <div class="telegram-success-card">
        <div>✅</div>
        <strong>Telegram configurado!</strong>
        <p>Notificações de venda, violação e início/fim de live estão ativas.</p>
      </div>

      <button
        id="edit-telegram"
        class="btn-secondary telegram-full-button"
      >
        ✏️ Editar configuração
      </button>
    </div>

    <div class="telegram-liveflow-toggles">
      <label>
        <span>🛒 Notificar novas vendas</span>
        <input
          id="telegram-sales"
          class="toggle"
          type="checkbox"
          ${state.settings.telegramSalesEnabled!==false?"checked":""}
        >
      </label>

      <label>
        <span>🔴 Notificar violações</span>
        <input
          id="telegram-violations"
          class="toggle"
          type="checkbox"
          ${state.settings.telegramViolationEnabled!==false?"checked":""}
        >
      </label>

      <label>
        <span>▶ Notificar início/fim de live</span>
        <input
          id="telegram-status"
          class="toggle"
          type="checkbox"
          ${state.settings.telegramStatusEnabled!==false?"checked":""}
        >
      </label>
    </div>

    <button
      id="test-telegram"
      class="btn-primary telegram-full-button"
    >
      📨 Testar notificação agora
    </button>

    <p id="telegram-save-status" class="helper">
      ${state.settings.telegramToken&&state.settings.telegramChatId
        ?"Configuração salva neste computador."
        :"Preencha o Token e o Chat ID."}
    </p>
  `)}

  ${section("protection","🛡️","Proteção da Live","encerra a live ao detectar aviso crítico",`
    <div class="toggle-line protection-main-toggle">
      <div>
        <strong>Ativar proteção automática</strong>
        <p class="helper">Monitora avisos críticos e age para proteger a transmissão.</p>
      </div>
      <input id="protection-enabled" class="toggle" type="checkbox" ${state.settings.protectionEnabled?"checked":""}>
    </div>

    <div class="protection-status-card ${state.settings.protectionEnabled?"armed":"inactive"}">
      <strong>${state.settings.protectionEnabled?"🛡 PROTEÇÃO ARMADA":"⚪ PROTEÇÃO DESATIVADA"}</strong>
      <p>${state.settings.protectionEnabled?"Nenhum aviso crítico detectado.":"Ative a proteção para monitorar a live."}</p>
    </div>

    <div class="toggle-line">
      <div>
        <strong>Enviar alerta no Telegram</strong>
        <p class="helper">Usa a configuração do card Telegram acima.</p>
      </div>
      <input id="protection-telegram" class="toggle" type="checkbox" ${state.settings.protectionTelegram?"checked":""}>
    </div>

    <div class="actions protection-actions">
      <button id="save-protection" class="btn-primary">💾 Salvar proteção</button>
      <button id="test-protection" class="btn-secondary">🧪 Testar proteção</button>
    </div>

    <button id="end-live" class="danger-wide">Encerrar transmissão agora</button>

    <p class="helper protection-explanation">
      O intervalo de segurança entre ações é controlado automaticamente pelo sistema.
    </p>

    <div id="protection-events" class="event-list">
      ${(state.protectionEvents||[]).slice(-6).reverse().map(event=>`<p>${esc(event.message||event.kind||"Evento de proteção")}</p>`).join("")||"<p>Nenhum evento de proteção.</p>"}
    </div>
  `)}

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

  return`<div class="title"><small>CONFIGURAÇÕES</small><h2>Conta</h2></div>${section("account","⚙️","Licença e conta","dados sincronizados com o servidor",`
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

  if(state.updateInfo){
    document.querySelectorAll("button,input,textarea,select").forEach(element=>{
      if(!element.closest(".mandatory-update-modal")){
        element.disabled=true;
      }
    });
    return;
  }


  document.querySelectorAll("[data-collapse]").forEach(b=>b.onclick=async()=>{const id=b.dataset.collapse;state.collapse[id]=!(state.collapse[id]??false);await saveCollapse();render()});
  document.getElementById("scan")?.addEventListener("click",()=>post("ORION_FORCE_SCAN"));
  document.querySelectorAll("[data-time]").forEach(b=>b.onclick=()=>{document.getElementById("timer-minutes").value=b.dataset.time;document.querySelectorAll("[data-time]").forEach(x=>x.classList.remove("active"));b.classList.add("active")});
  document.getElementById("timer-start")?.addEventListener("click",async()=>{
    const minutes=Math.max(1,+document.getElementById("timer-minutes").value||1);
    const startedAt=Date.now();

    state.settings.endTimerMinutes=minutes;
    state.settings.endTimerStartedAt=startedAt;
    state.settings.endTimerPaused=false;
    state.settings.endTimerRemainingMs=null;

    state.timerPaused=false;
    state.timerRemainingMs=null;
    state.endAt=startedAt+minutes*60000;
    state.settings.endTimerAt=state.endAt;

    await saveSettings();
    startTicker();
    render();
  });

  document.getElementById("timer-pause")?.addEventListener("click",async()=>{
    if(state.timerPaused){
      const remaining=Math.max(1000,Number(state.timerRemainingMs||state.settings.endTimerRemainingMs||1000));
      state.timerPaused=false;
      state.settings.endTimerPaused=false;
      state.timerRemainingMs=null;
      state.settings.endTimerRemainingMs=null;
      state.endAt=Date.now()+remaining;
      state.settings.endTimerAt=state.endAt;

      await saveSettings();
      startTicker();
      render();
      return;
    }

    if(!state.endAt)return;

    const remaining=Math.max(1000,state.endAt-Date.now());
    clearInterval(state.endTimer);
    state.endTimer=null;
    state.timerPaused=true;
    state.settings.endTimerPaused=true;
    state.timerRemainingMs=remaining;
    state.settings.endTimerRemainingMs=remaining;
    state.endAt=null;
    state.settings.endTimerAt=null;

    await saveSettings();
    render();
  });

  document.getElementById("timer-cancel")?.addEventListener("click",async()=>{
    clearInterval(state.endTimer);
    state.endTimer=null;
    state.endAt=null;
    state.timerPaused=false;
    state.timerRemainingMs=null;

    state.settings.endTimerAt=null;
    state.settings.endTimerPaused=false;
    state.settings.endTimerRemainingMs=null;
    state.settings.endTimerStartedAt=null;

    await saveSettings();
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
  
  document.getElementById("protection-save")?.addEventListener("click",async()=>{
    state.settings.protectionEnabled=document.getElementById("protection-enabled").checked;
    state.settings.protectionTelegram=document.getElementById("protection-telegram").checked;
    state.settings.protectionCooldownSeconds=120;
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
    state.settings.postSaleMessages=document.getElementById("post-message").value
      .split("\n").map(value=>value.trim()).filter(Boolean);
    state.settings.postSaleMessage=state.settings.postSaleMessages[0]||
      "Parabéns pela compra! {salesCount} pessoas já finalizaram a compra nessa live.";
    state.settings.postSaleDelaySeconds=Math.max(5,Number(document.getElementById("post-delay")?.value)||10);
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
  document.getElementById("comments-save")?.addEventListener("click",async()=>{
    const comments=document
      .getElementById("comments")
      .value.split("\n")
      .map(value=>value.trim())
      .filter(Boolean);

    const configuredMinimum=Math.floor(
      Number(document.getElementById("min-delay").value)
    );

    const configuredMaximum=Math.floor(
      Number(document.getElementById("max-delay").value)
    );

    const validMinimum=
      Number.isFinite(configuredMinimum)&&configuredMinimum>=1
        ?configuredMinimum
        :45;

    const validMaximum=
      Number.isFinite(configuredMaximum)&&configuredMaximum>=1
        ?configuredMaximum
        :90;

    state.settings.comments=comments;
    state.settings.minCommentDelay=Math.min(
      validMinimum,
      validMaximum
    );
    state.settings.maxCommentDelay=Math.max(
      validMinimum,
      validMaximum
    );

    await saveSettings();

    const status=document.getElementById("comments-status");

    if(status){
      status.textContent=comments.length
        ?`${comments.length} comentário(s) salvo(s) com sucesso.`
        :"Lista vazia salva. Nenhum comentário será enviado.";
    }
  });

  document.getElementById("comments-start")?.addEventListener("click",async()=>{
    const comments=document
      .getElementById("comments")
      .value.split("\n")
      .map(value=>value.trim())
      .filter(Boolean);

    if(!comments.length){
      const status=document.getElementById("comments-status");
      if(status){
        status.textContent=
          "Adicione e salve pelo menos um comentário antes de iniciar.";
      }
      return;
    }

    const configuredMinimum=Math.floor(
      Number(document.getElementById("min-delay").value)
    );

    const configuredMaximum=Math.floor(
      Number(document.getElementById("max-delay").value)
    );

    const validMinimum=
      Number.isFinite(configuredMinimum)&&configuredMinimum>=1
        ?configuredMinimum
        :45;

    const validMaximum=
      Number.isFinite(configuredMaximum)&&configuredMaximum>=1
        ?configuredMaximum
        :90;

    state.settings.comments=comments;
    state.settings.minCommentDelay=Math.min(
      validMinimum,
      validMaximum
    );
    state.settings.maxCommentDelay=Math.max(
      validMinimum,
      validMaximum
    );
    state.settings.commentsEnabled=true;

    // A barra começa imediatamente no clique.
    const immediateDelay=
      Math.floor(
        Math.random()*
        (
          state.settings.maxCommentDelay-
          state.settings.minCommentDelay+1
        )
      )+
      state.settings.minCommentDelay;

    updateCommentProgress({
      kind:"comment-started",
      totalComments:comments.length,
      intervalMin:state.settings.minCommentDelay,
      intervalMax:state.settings.maxCommentDelay
    });

    updateCommentProgress({
      kind:"comment-progress",
      progress:0,
      remainingSeconds:immediateDelay,
      delaySeconds:immediateDelay,
      currentIndex:0,
      totalComments:comments.length,
      nextComment:comments[0]
    });

    await saveSettings();

    const status=document.getElementById("comments-status");
    if(status){
      status.textContent=
        `Comentários ativos: ${comments.length} item(ns) em sequência.`;
    }
  });

  document.getElementById("comments-stop")?.addEventListener("click",async()=>{clearTimeout(state.commentTimer);state.commentTimer=null;state.settings.commentsEnabled=false;await saveSettings();const event=document.getElementById("comments-status");if(event)event.textContent="Comentários automáticos parados."});

  document.getElementById("save-telegram")?.addEventListener("click",async()=>{
    const token=document.getElementById("telegram-token")?.value.trim()||"";
    const chatId=document.getElementById("telegram-chat")?.value.trim()||"";
    const status=document.getElementById("telegram-save-status");

    if(!token||!chatId){
      if(status){
        status.textContent=
          "Preencha o Token do Bot e o Chat ID.";
      }
      return;
    }

    state.settings.telegramToken=token;
    state.settings.telegramChatId=chatId;
    state.settings.telegramEnabled=true;
    state.settings.telegramSalesEnabled=
      document.getElementById("telegram-sales")?.checked!==false;
    state.settings.telegramViolationEnabled=
      document.getElementById("telegram-violations")?.checked!==false;
    state.settings.telegramStatusEnabled=
      document.getElementById("telegram-status")?.checked!==false;

    await saveSettings();

    if(status){
      status.textContent=
        "✅ Configuração do Telegram salva.";
    }

    render();
  });

  document.getElementById("edit-telegram")?.addEventListener("click",()=>{
    document
      .getElementById("telegram-form-box")
      ?.classList.remove("hidden-telegram-box");

    document
      .getElementById("telegram-confirm-box")
      ?.classList.add("hidden-telegram-box");
  });

  for(const [id,key] of [
    ["telegram-sales","telegramSalesEnabled"],
    ["telegram-violations","telegramViolationEnabled"],
    ["telegram-status","telegramStatusEnabled"]
  ]){
    document.getElementById(id)?.addEventListener("change",async event=>{
      state.settings[key]=event.target.checked;
      state.settings.telegramEnabled=Boolean(
        state.settings.telegramToken&&
        state.settings.telegramChatId
      );
      await saveSettings();
    });
  }

  document.getElementById("test-telegram")?.addEventListener("click",async()=>{
    const token=
      document.getElementById("telegram-token")?.value.trim()||
      state.settings.telegramToken||
      "";

    const chatId=
      document.getElementById("telegram-chat")?.value.trim()||
      state.settings.telegramChatId||
      "";

    const status=
      document.getElementById("telegram-save-status");

    if(!token||!chatId){
      if(status){
        status.textContent=
          "Preencha e salve o Token do Bot e o Chat ID.";
      }
      return;
    }

    state.settings.telegramToken=token;
    state.settings.telegramChatId=chatId;
    state.settings.telegramEnabled=true;
    await saveSettings();

    if(status){
      status.textContent=
        "Enviando notificação de teste...";
    }

    const result=await chrome.runtime.sendMessage({
      type:"ORION_TELEGRAM_SEND",
      payload:{
        token,
        chatId,
        text:
          "✅ Live Infinity conectado com sucesso!\n\n🛒 Vendas: ativas\n🔴 Violações: ativas\n▶ Início/fim da LIVE: ativos"
      }
    }).catch(error=>({
      ok:false,
      error:
        error?.message||
        "Falha ao testar o Telegram."
    }));

    if(status){
      status.textContent=result?.ok
        ?"✅ Notificação recebida. Telegram configurado!"
        :`❌ ${result?.error||"Não foi possível enviar a mensagem."}`;
    }
  });

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
function startTicker(){
  clearInterval(state.endTimer);

  const update=()=>{
    if(state.timerPaused)return;
    if(!state.endAt)return;

    const remaining=Math.max(0,Math.ceil((state.endAt-Date.now())/1000));
    const clock=document.getElementById("remaining");
    if(clock){
      clock.textContent=fmt(remaining);
      clock.classList.toggle("timer-critical",remaining>0&&remaining<=599);
    }

    if(remaining===0){
      clearInterval(state.endTimer);
      state.endTimer=null;
      state.endAt=null;

      const status=document.getElementById("timer-status");
      if(status)status.textContent="Tempo concluído. Encerramento automático solicitado.";

      const badge=document.getElementById("timer-badge");
      if(badge){
        badge.textContent="Encerrando";
        badge.className="timer-badge active";
      }
    }
  };

  update();
  state.endTimer=setInterval(update,1000);
}

function updateCommentProgress(payload){
  const card=document.getElementById("comment-progress-card");
  const bar=document.getElementById("comment-progress-bar");
  const time=document.getElementById("comment-progress-time");
  const percent=document.getElementById("comment-progress-percent");
  const position=document.getElementById("comment-progress-position");
  const next=document.getElementById("comment-progress-next");

  if(!card)return;

  if(payload.kind==="comment-progress"){
    const value=Math.max(0,Math.min(100,Number(payload.progress)||0));

    card.classList.add("active");
    card.classList.remove("inactive");

    if(bar)bar.style.width=`${value}%`;
    if(percent)percent.textContent=`${value}%`;

    if(time){
      time.textContent=
        `${Math.max(0,Number(payload.remainingSeconds)||0)}s`;
    }

    if(position){
      position.textContent=
        `Comentário ${(Number(payload.currentIndex)||0)+1} de ${Number(payload.totalComments)||0}`;
    }

    if(next){
      next.textContent=
        payload.nextComment
          ?`Próximo: ${payload.nextComment}`
          :"Preparando próximo comentário...";
    }

    return;
  }

  if(payload.kind==="comment-sent"){
    if(bar)bar.style.width="100%";
    if(percent)percent.textContent="100%";
    if(time)time.textContent="Enviado";

    if(position){
      position.textContent=
        `Comentário ${payload.currentPosition||1} de ${payload.totalComments||0} enviado`;
    }

    if(next){
      next.textContent=
        payload.message||"Comentário enviado.";
    }

    return;
  }

  if(payload.kind==="comment-failed"){
    card.classList.add("active");
    card.classList.remove("inactive");

    if(time)time.textContent="Tentando novamente";

    if(next){
      next.textContent=
        payload.result?.error||
        "Campo indisponível. Nova tentativa em 3 segundos.";
    }

    return;
  }

  if(payload.kind==="comment-stopped"){
    card.classList.remove("active");
    card.classList.add("inactive");

    if(bar)bar.style.width="0%";
    if(percent)percent.textContent="0%";
    if(time)time.textContent="Comentários parados";

    if(next){
      next.textContent=
        "Clique em Iniciar comentários para retomar.";
    }

    return;
  }

  if(payload.kind==="comment-started"){
    card.classList.add("active");
    card.classList.remove("inactive");

    if(position){
      position.textContent=
        `Sequência com ${payload.totalComments||0} comentário(s)`;
    }

    if(next){
      next.textContent=
        `Intervalo configurado: ${payload.intervalMin||0}s a ${payload.intervalMax||0}s`;
    }
  }
}

chrome.runtime.onMessage.addListener((message)=>{
  if(message?.type==="ORION_AUTOMATION_EVENT"){
    const payload=message.payload||{};

    updateCommentProgress(payload);
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



setInterval(async()=>{
  const previous=state.updateInfo?.version||null;
  await checkMandatoryUpdate();
  const current=state.updateInfo?.version||null;

  if(previous!==current){
    render();
  }
},5*60*1000);
