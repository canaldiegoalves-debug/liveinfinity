
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const elements = {
  login: $("#admin-login"),
  app: $("#admin-app"),
  user: $("#admin-user"),
  password: $("#admin-password"),
  enter: $("#admin-enter"),
  loginMessage: $("#admin-login-message"),
  logout: $("#admin-logout"),
  nav: $("#admin-nav"),
  content: $("#page-content"),
  title: $("#page-title"),
  kicker: $("#page-kicker"),
  refresh: $("#refresh"),
  lastUpdate: $("#last-update"),
  template: $("#license-card-template")
};

const state = {
  token: sessionStorage.getItem("liveInfinityAdminSession") || "",
  licenses: [],
  tickets: [],
  page: "dashboard",
  loading: false,
  refreshTimer: null
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: state.token ? `Bearer ${state.token}` : "",
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Falha na requisição.");
  return body;
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function date(value) {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}

function statusOf(license) {
  if (!license.active || license.status === "revoked") return "revoked";
  if (license.expiresAt && new Date(license.expiresAt) <= new Date()) return "expired";
  return license.activatedAt ? "active" : "pending";
}

function statusText(status) {
  return {
    active: "Ativa",
    pending: "Aguardando ativação",
    revoked: "Bloqueada",
    expired: "Expirada"
  }[status] || status;
}

function isOnline(license) {
  if (!license.lastValidationAt) return false;
  return Date.now() - new Date(license.lastValidationAt).getTime() < 5 * 60 * 1000;
}

function showLogin() {
  elements.app.classList.add("hidden");
  elements.login.classList.remove("hidden");
}

function showApp() {
  elements.login.classList.add("hidden");
  elements.app.classList.remove("hidden");
}

async function loadData({ silent = false } = {}) {
  if (state.loading) return;
  state.loading = true;

  try {
    const [licenses, tickets] = await Promise.all([
      api("/api/admin/licenses"),
      api("/api/admin/support")
    ]);

    state.licenses = licenses.licenses || [];
    state.tickets = tickets.tickets || [];
    elements.lastUpdate.textContent =
      `Atualizado às ${new Date().toLocaleTimeString("pt-BR")}`;

    renderPage();
  } catch (error) {
    if (!silent) alert(error.message);
  } finally {
    state.loading = false;
  }
}

function setPage(page) {
  state.page = page;
  $$("#admin-nav [data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  renderPage();
}

function pageMeta(title, kicker) {
  elements.title.textContent = title;
  elements.kicker.textContent = kicker;
}

function statsHtml() {
  const total = state.licenses.length;
  const active = state.licenses.filter(l => statusOf(l) === "active").length;
  const pro = state.licenses.filter(l => l.plan === "pro").length;
  const revenue = state.licenses.reduce((sum, l) => sum + Number(l.amountPaid || 0), 0);

  return `<section class="stats">
    <article class="stat-card"><span>Total de clientes</span><strong>${total}</strong><small>Base cadastrada</small></article>
    <article class="stat-card"><span>Licenças ativas</span><strong>${active}</strong><small>${state.licenses.filter(isOnline).length} online agora</small></article>
    <article class="stat-card gold"><span>Planos PRO</span><strong>${pro}</strong><small>${total ? Math.round(pro/total*100) : 0}% da base</small></article>
    <article class="stat-card gold"><span>Faturamento registrado</span><strong>${money(revenue)}</strong><small>Valor total informado</small></article>
  </section>`;
}

function dashboardPage() {
  pageMeta("Dashboard", "VISÃO GERAL");

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: date.toLocaleDateString("pt-BR", { month: "short" })
    };
  });

  const monthly = months.map(month => {
    const value = state.licenses
      .filter(l => {
        const created = new Date(l.createdAt);
        return `${created.getFullYear()}-${created.getMonth()}` === month.key;
      })
      .reduce((sum, l) => sum + Number(l.amountPaid || 0), 0);
    return { ...month, value };
  });

  const max = Math.max(...monthly.map(m => m.value), 1);
  const openTickets = state.tickets.filter(t => t.status !== "resolved").length;

  elements.content.innerHTML = `
    ${statsHtml()}
    <section class="dashboard-grid">
      <article class="card chart-card">
        <div class="card-head"><div><small>FATURAMENTO</small><h2>Últimos 6 meses</h2></div></div>
        <div class="bars">
          ${monthly.map((m, index) => `<div class="bar ${index % 2 ? "red" : ""}" style="height:${Math.max(8, (m.value/max)*145)}px" title="${money(m.value)}"><span>${m.label}</span></div>`).join("")}
        </div>
      </article>

      <article class="card">
        <div class="card-head"><div><small>OPERAÇÃO</small><h2>Resumo rápido</h2></div></div>
        <div class="metric-box"><span>Usuários online</span><strong>${state.licenses.filter(isOnline).length}</strong></div>
        <div class="metric-box"><span>Chamados abertos</span><strong>${openTickets}</strong></div>
        <div class="metric-box"><span>Licenças vencendo em 7 dias</span><strong>${state.licenses.filter(l => l.expiresAt && new Date(l.expiresAt)-Date.now() <= 7*86400000 && new Date(l.expiresAt)>Date.now()).length}</strong></div>
      </article>
    </section>

    <article class="card">
      <div class="card-head"><div><small>ATIVIDADE</small><h2>Últimos clientes</h2></div></div>
      ${usersTable(state.licenses.slice(0, 7))}
    </article>`;
}

function licenseCard(license) {
  const node = elements.template.content.cloneNode(true);
  const status = statusOf(license);

  node.querySelector(".license-plan").textContent =
    license.plan === "pro" ? "PLANO PRO" : "PLANO BÁSICO";
  node.querySelector(".license-email").textContent = license.email;
  node.querySelector(".license-key").textContent = license.key;

  const statusElement = node.querySelector(".license-status");
  statusElement.textContent = statusText(status);
  statusElement.classList.add(status);

  node.querySelector(".license-duration").textContent = `${license.durationDays} dias`;
  node.querySelector(".license-remaining").textContent =
    status === "pending" ? "Ainda não iniciou" : `${license.remainingDays} dias`;
  node.querySelector(".license-activated").textContent = date(license.activatedAt);
  node.querySelector(".license-expires").textContent = date(license.expiresAt);
  node.querySelector(".license-note").textContent =
    `${license.note || "Sem observações."} · ${money(license.amountPaid)} · ${license.paymentMethod || "Pagamento não informado"}`;

  const toggle = node.querySelector('[data-action="toggle"]');
  toggle.textContent = status === "revoked" ? "Desbloquear" : "Bloquear";

  node.querySelector('[data-action="copy"]').onclick = async () => {
    await navigator.clipboard.writeText(license.key);
    alert("Chave copiada.");
  };

  node.querySelector('[data-action="edit"]').onclick = async () => {
    const planInput = prompt("Plano: digite PRO ou BASICO", license.plan === "pro" ? "PRO" : "BASICO");
    if (!planInput) return;

    const plan = planInput.trim().toLowerCase() === "pro" ? "pro" : "basic";
    const amountPaid = Number(prompt("Valor pago:", license.amountPaid || 0));
    const paymentMethod = prompt("Forma de pagamento:", license.paymentMethod || "Pix");
    const note = prompt("Observação:", license.note || "");

    await api(`/api/admin/licenses/${license.id}`, {
      method: "PATCH",
      body: JSON.stringify({ plan, amountPaid, paymentMethod, note })
    });

    await loadData();
  };

  node.querySelector('[data-action="renew"]').onclick = async () => {
    const days = Number(prompt("Quantos dias deseja adicionar?"));
    if (!Number.isInteger(days) || days < 1) return;

    await api(`/api/admin/licenses/${license.id}/renew`, {
      method: "POST",
      body: JSON.stringify({ days })
    });
    await loadData();
  };

  node.querySelector('[data-action="device"]').onclick = async () => {
    if (!confirm("Liberar esta chave para outro computador?")) return;
    await api(`/api/admin/licenses/${license.id}/reset-device`, { method: "POST" });
    await loadData();
  };

  toggle.onclick = async () => {
    const action = status === "revoked" ? "restore" : "revoke";
    await api(`/api/admin/licenses/${license.id}/${action}`, { method: "POST" });
    await loadData();
  };

  node.querySelector('[data-action="delete"]').onclick = async () => {
    if (!confirm("Excluir esta licença definitivamente?")) return;
    await api(`/api/admin/licenses/${license.id}`, { method: "DELETE" });
    await loadData();
  };

  return node;
}

function licensesPage() {
  pageMeta("Licenças", "GESTÃO DE ACESSOS");

  elements.content.innerHTML = `
    <article class="card">
      <div class="card-head"><div><small>NOVA LICENÇA</small><h2>Gerar chave de acesso</h2></div></div>
      <div class="form-grid">
        <input id="new-email" type="email" placeholder="E-mail do cliente">
        <select id="new-plan"><option value="basic">Básico</option><option value="pro">Pro</option></select>
        <input id="new-days" type="number" min="1" value="30" placeholder="Dias">
        <input id="new-amount" type="number" min="0" step="0.01" placeholder="Valor pago">
        <select id="new-payment"><option>Pix</option><option>Dinheiro</option><option>Cartão</option><option>Transferência</option><option>Outro</option></select>
        <input id="new-note" placeholder="Observação">
      </div>
      <button id="create-license" class="primary">Gerar chave</button>
      <p class="helper">A contagem começa somente na primeira ativação.</p>
      <div id="new-license-result"></div>
    </article>

    <article class="card">
      <div class="card-head"><div><small>CLIENTES</small><h2>Licenças cadastradas</h2></div></div>
      <div class="filters">
        <input id="license-search" placeholder="Pesquisar e-mail ou chave">
        <select id="license-filter">
          <option value="">Todos os status</option>
          <option value="active">Ativa</option>
          <option value="pending">Aguardando</option>
          <option value="revoked">Bloqueada</option>
          <option value="expired">Expirada</option>
        </select>
      </div>
      <div id="license-list" class="licenses"></div>
    </article>`;

  const renderList = () => {
    const query = $("#license-search").value.toLowerCase().trim();
    const filter = $("#license-filter").value;
    const list = $("#license-list");
    list.innerHTML = "";

    const licenses = state.licenses.filter(l =>
      (!query || l.email.toLowerCase().includes(query) || l.key.toLowerCase().includes(query)) &&
      (!filter || statusOf(l) === filter)
    );

    if (!licenses.length) {
      list.innerHTML = '<div class="empty">Nenhuma licença encontrada.</div>';
      return;
    }

    licenses.forEach(license => list.appendChild(licenseCard(license)));
  };

  $("#license-search").oninput = renderList;
  $("#license-filter").onchange = renderList;
  renderList();

  $("#create-license").onclick = async () => {
    const result = await api("/api/admin/licenses", {
      method: "POST",
      body: JSON.stringify({
        email: $("#new-email").value.trim(),
        plan: $("#new-plan").value,
        durationDays: Number($("#new-days").value),
        amountPaid: Number($("#new-amount").value || 0),
        paymentMethod: $("#new-payment").value,
        note: $("#new-note").value.trim()
      })
    });

    $("#new-license-result").innerHTML = `
      <div class="new-license">
        <strong>Chave criada com sucesso</strong>
        <code>${result.license.key}</code>
        <button id="copy-generated">Copiar chave</button>
      </div>`;

    $("#copy-generated").onclick = () => navigator.clipboard.writeText(result.license.key);
    await loadData();
  };
}

function usersTable(licenses) {
  if (!licenses.length) return '<div class="empty">Nenhum usuário cadastrado.</div>';

  return `<table class="table">
    <thead><tr><th>Usuário</th><th>Plano</th><th>Status</th><th>Dispositivo</th><th>Última conexão</th></tr></thead>
    <tbody>${licenses.map(l => `<tr>
      <td>${l.email}</td>
      <td>${l.plan.toUpperCase()}</td>
      <td><i class="${isOnline(l) ? "online-dot" : "online-dot offline-dot"}"></i>${isOnline(l) ? "Online" : statusText(statusOf(l))}</td>
      <td>${l.deviceId ? "Vinculado" : "Livre"}</td>
      <td>${date(l.lastValidationAt)}</td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function usersPage() {
  pageMeta("Usuários", "CLIENTES E DISPOSITIVOS");
  elements.content.innerHTML = `
    ${statsHtml()}
    <article class="card">
      <div class="card-head"><div><small>USUÁRIOS</small><h2>Presença e dispositivos</h2></div></div>
      ${usersTable(state.licenses)}
    </article>`;
}

function financePage() {
  pageMeta("Faturamento", "CONTROLE FINANCEIRO");

  const total = state.licenses.reduce((sum, l) => sum + Number(l.amountPaid || 0), 0);
  const pro = state.licenses.filter(l => l.plan === "pro").reduce((sum, l) => sum + Number(l.amountPaid || 0), 0);
  const basic = total - pro;

  elements.content.innerHTML = `
    <section class="stats">
      <article class="stat-card gold"><span>Faturamento total</span><strong>${money(total)}</strong><small>Valores cadastrados</small></article>
      <article class="stat-card"><span>Receita PRO</span><strong>${money(pro)}</strong><small>Clientes premium</small></article>
      <article class="stat-card"><span>Receita Básico</span><strong>${money(basic)}</strong><small>Plano de entrada</small></article>
      <article class="stat-card"><span>Ticket médio</span><strong>${money(state.licenses.length ? total/state.licenses.length : 0)}</strong><small>Por licença</small></article>
    </section>

    <article class="card">
      <div class="card-head"><div><small>RECEBIMENTOS</small><h2>Histórico financeiro</h2></div></div>
      <table class="table">
        <thead><tr><th>Cliente</th><th>Plano</th><th>Valor</th><th>Pagamento</th><th>Cadastro</th></tr></thead>
        <tbody>${state.licenses.map(l => `<tr><td>${l.email}</td><td>${l.plan.toUpperCase()}</td><td>${money(l.amountPaid)}</td><td>${l.paymentMethod || "—"}</td><td>${date(l.createdAt)}</td></tr>`).join("")}</tbody>
      </table>
    </article>`;
}

function downloadCsv(filename, rows) {
  const content = rows.map(row =>
    row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";")
  ).join("\n");

  const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function reportsPage() {
  pageMeta("Relatórios", "EXPORTAÇÃO E ANÁLISES");

  const active = state.licenses.filter(l => statusOf(l) === "active").length;
  const conversion = state.licenses.length ? Math.round(active/state.licenses.length*100) : 0;

  elements.content.innerHTML = `
    <section class="stats">
      <article class="stat-card"><span>Taxa de ativação</span><strong>${conversion}%</strong><small>Chaves ativadas</small></article>
      <article class="stat-card"><span>Planos PRO</span><strong>${state.licenses.filter(l => l.plan === "pro").length}</strong><small>Clientes premium</small></article>
      <article class="stat-card"><span>Bloqueadas</span><strong>${state.licenses.filter(l => statusOf(l) === "revoked").length}</strong><small>Acessos suspensos</small></article>
      <article class="stat-card gold"><span>Chamados resolvidos</span><strong>${state.tickets.filter(t => t.status === "resolved").length}</strong><small>Atendimentos concluídos</small></article>
    </section>

    <article class="card">
      <div class="card-head"><div><small>EXPORTAR</small><h2>Baixar relatórios</h2></div></div>
      <div class="report-actions">
        <button id="export-clients">Exportar clientes CSV</button>
        <button id="export-finance">Exportar faturamento CSV</button>
        <button id="export-support">Exportar suporte CSV</button>
      </div>
    </article>`;

  $("#export-clients").onclick = () => downloadCsv("live-infinity-clientes.csv", [
    ["E-mail","Chave","Plano","Status","Ativação","Vencimento","Dias restantes","Dispositivo"],
    ...state.licenses.map(l => [l.email,l.key,l.plan,statusText(statusOf(l)),date(l.activatedAt),date(l.expiresAt),l.remainingDays,l.deviceId || ""])
  ]);

  $("#export-finance").onclick = () => downloadCsv("live-infinity-faturamento.csv", [
    ["E-mail","Plano","Valor","Forma de pagamento","Cadastro"],
    ...state.licenses.map(l => [l.email,l.plan,l.amountPaid || 0,l.paymentMethod || "",date(l.createdAt)])
  ]);

  $("#export-support").onclick = () => downloadCsv("live-infinity-suporte.csv", [
    ["Assunto","Cliente","Prioridade","Status","Criado em"],
    ...state.tickets.map(t => [t.subject,t.customerEmail,t.priority,t.status,date(t.createdAt)])
  ]);
}

function supportPage() {
  pageMeta("Suporte", "ATENDIMENTO AO CLIENTE");

  elements.content.innerHTML = `
    <article class="card">
      <div class="card-head"><div><small>NOVO CHAMADO</small><h2>Registrar atendimento</h2></div></div>
      <div class="form-grid" style="grid-template-columns:2fr 2fr 1fr 3fr auto">
        <input id="ticket-subject" placeholder="Assunto">
        <input id="ticket-email" type="email" placeholder="E-mail do cliente">
        <select id="ticket-priority"><option value="low">Baixa</option><option value="normal" selected>Normal</option><option value="high">Alta</option></select>
        <input id="ticket-message" placeholder="Descrição do problema">
        <button id="create-ticket" class="primary">Criar chamado</button>
      </div>
    </article>

    <article class="card">
      <div class="card-head"><div><small>CHAMADOS</small><h2>Fila de suporte</h2></div></div>
      <div id="ticket-list"></div>
    </article>`;

  const list = $("#ticket-list");
  list.innerHTML = state.tickets.length ? "" : '<div class="empty">Nenhum chamado registrado.</div>';

  state.tickets.forEach(ticket => {
    const article = document.createElement("article");
    article.className = "ticket";
    article.innerHTML = `
      <div class="ticket-head">
        <div><strong>${ticket.subject}</strong><br><small>${ticket.customerEmail || "Cliente não informado"} · ${date(ticket.createdAt)}</small></div>
        <span class="priority-${ticket.priority}">${ticket.priority.toUpperCase()} · ${ticket.status}</span>
      </div>
      <p>${ticket.message}</p>
      <button data-status="in_progress">Em atendimento</button>
      <button data-status="resolved">Resolver</button>`;

    article.querySelectorAll("[data-status]").forEach(button => {
      button.onclick = async () => {
        await api(`/api/admin/support/${ticket.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: button.dataset.status })
        });
        await loadData();
      };
    });

    list.appendChild(article);
  });

  $("#create-ticket").onclick = async () => {
    await api("/api/admin/support", {
      method: "POST",
      body: JSON.stringify({
        subject: $("#ticket-subject").value.trim(),
        customerEmail: $("#ticket-email").value.trim(),
        priority: $("#ticket-priority").value,
        message: $("#ticket-message").value.trim()
      })
    });
    await loadData();
  };
}

function renderPage() {
  if (!elements.content) return;

  const pages = {
    dashboard: dashboardPage,
    licenses: licensesPage,
    users: usersPage,
    finance: financePage,
    reports: reportsPage,
    support: supportPage
  };

  (pages[state.page] || dashboardPage)();
}

elements.nav.addEventListener("click", event => {
  const button = event.target.closest("[data-page]");
  if (button) setPage(button.dataset.page);
});

elements.enter.onclick = async () => {
  try {
    elements.loginMessage.textContent = "Entrando...";

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: elements.user.value.trim(),
        password: elements.password.value
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Não foi possível entrar.");

    state.token = result.token;
    sessionStorage.setItem("liveInfinityAdminSession", state.token);
    showApp();
    await loadData();
    startAutoRefresh();
  } catch (error) {
    elements.loginMessage.textContent = error.message;
  }
};

elements.logout.onclick = () => {
  clearInterval(state.refreshTimer);
  state.token = "";
  sessionStorage.removeItem("liveInfinityAdminSession");
  showLogin();
};

elements.refresh.onclick = () => loadData();

function startAutoRefresh() {
  clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(() => {
    if (state.token) loadData({ silent: true });
  }, 4000);
}

(async () => {
  if (!state.token) return showLogin();

  try {
    showApp();
    await loadData();
    startAutoRefresh();
  } catch {
    state.token = "";
    sessionStorage.removeItem("liveInfinityAdminSession");
    showLogin();
  }
})();
