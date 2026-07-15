window.OrionDetector = {
  state: {
    dashboardDetected: false,
    live: false,
    elapsedSeconds: 0,
    viewers: null,
    sales: 0,
    gmv: null,
    product: null,
    saleEvents: [],
    chatMessages: [],
    violation: null,
    protectionStatus: "idle",
    lastScanAt: null
  },

  observer: null,
  timer: null,
  debounce: null,
  lastViolationHash: "",
  lastProtectionAt: 0,

  start() {
    if (this.observer) return;

    this.scan();

    this.observer = new MutationObserver(() => {
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => this.scan(), 250);
    });

    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["role", "aria-live", "aria-label", "class"]
    });

    this.timer = setInterval(() => {
      if (this.state.live) {
        this.state.elapsedSeconds += 1;
        this.publish();
      }
      this.scanViolationOnly();
    }, 1000);
  },

  normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  },

  bodyText() {
    return this.normalize(document.body?.innerText || "");
  },

  isVisible(element) {
    if (!element || !(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  },

  parseNumberNear(text, labels) {
    for (const label of labels) {
      const safe = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        new RegExp(`${safe}\\s*[:\\-]?\\s*(\\d[\\d.,]*)`, "i"),
        new RegExp(`(\\d[\\d.,]*)\\s*${safe}`, "i")
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match) continue;
        const value = Number(match[1].replace(/\./g, "").replace(",", "."));
        if (Number.isFinite(value)) return value;
      }
    }

    return null;
  },

  parseDuration(text) {
    const matches = [...text.matchAll(/\b(\d{1,2}):(\d{2}):(\d{2})\b/g)];

    for (const match of matches) {
      const context = text
        .slice(Math.max(0, match.index - 120), match.index + 120)
        .toLowerCase();

      if (/live|transmiss|início|inicio|duração|duracao/.test(context)) {
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        const seconds = Number(match[3]);

        if (minutes < 60 && seconds < 60) {
          return hours * 3600 + minutes * 60 + seconds;
        }
      }
    }

    return null;
  },

  collectSales() {
    const salePattern =
      /cliente comprou|acabou de comprar|comprou o produto|nova venda|pedido realizado|finalizou a compra/i;

    const genericPattern =
      /^(cliente|cliente\s*\d+|comprador|usuário|usuario|user)\b/i;

    const cleanName = (value) => {
      const text = this.normalize(value)
        .replace(
          /\b(cliente comprou|acabou de comprar|comprou o produto|nova venda|pedido realizado|finalizou a compra)\b.*$/i,
          ""
        )
        .replace(/[•·|:–—-]+$/g, "")
        .trim();

      if (!text || genericPattern.test(text)) return "";
      if (text.length > 80) return "";
      return text;
    };

    const findBuyerName = (element, saleText) => {
      const root =
        element.closest(
          '[class*="order"],[class*="sale"],[class*="purchase"],[class*="notification"],[class*="message"],[class*="item"],li'
        ) || element.parentElement || element;

      const selectors = [
        '[class*="buyer"]',
        '[class*="customer"]',
        '[class*="username"]',
        '[class*="user-name"]',
        '[class*="nickname"]',
        '[class*="name"]',
        '[data-e2e*="name"]',
        '[data-testid*="name"]',
        'strong',
        'b'
      ];

      for (const selector of selectors) {
        for (const node of root.querySelectorAll(selector)) {
          const candidate = cleanName(node.innerText || node.textContent || "");
          if (candidate) return candidate;
        }
      }

      const directPatterns = [
        /^(.+?)\s+(?:acabou de comprar|comprou o produto|finalizou a compra|realizou um pedido)/i,
        /(?:nova venda|pedido realizado)[:\s-]+(.+?)(?:\s+comprou|\s*$)/i,
        /^(.+?)\s+comprou\b/i
      ];

      for (const pattern of directPatterns) {
        const match = saleText.match(pattern);
        const candidate = cleanName(match?.[1] || "");
        if (candidate) return candidate;
      }

      const lines = this.normalize(root.innerText || "")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);

      const saleIndex = lines.findIndex((line) => salePattern.test(line));
      const nearby = saleIndex >= 0
        ? lines.slice(Math.max(0, saleIndex - 3), saleIndex + 1).reverse()
        : lines.slice(0, 4);

      for (const line of nearby) {
        const candidate = cleanName(line);
        if (candidate && !salePattern.test(candidate)) return candidate;
      }

      return "";
    };

    const elements = [...document.querySelectorAll("body *")]
      .filter((element) => {
        const ownText = this.normalize(
          [...element.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent)
            .join(" ")
        );
        const fullText = this.normalize(element.innerText);
        return salePattern.test(ownText || fullText);
      });

    const events = [];
    const seen = new Set();

    for (const element of elements) {
      const text = this.normalize(element.innerText);
      if (!text || text.length > 500) continue;

      const buyerName = findBuyerName(element, text);
      const id = `${buyerName}|${text}`.toLowerCase();

      if (seen.has(id)) continue;
      seen.add(id);

      events.push({
        id,
        text,
        buyerName,
        detectedAt: new Date().toISOString()
      });
    }

    return events.slice(-50);
  },

  collectChat() {
    const input = [...document.querySelectorAll('textarea,[contenteditable="true"]')]
      .find((element) =>
        /digite|coment|mensagem/i.test(element.getAttribute("placeholder") || "")
      );

    if (!input) return [];

    const scope = input.closest("section,main,div") || document.body;

    return [...new Set(
      [...scope.querySelectorAll("p,span,div")]
        .map((element) => this.normalize(element.innerText))
        .filter((text) =>
          text.length >= 3 &&
          text.length <= 180 &&
          !/digite|todos os comentários|relacionados ao produto/i.test(text)
        )
    )].slice(-40);
  },

  findProduct() {
    const selectors = [
      '[data-e2e*="product"]',
      '[data-testid*="product"]',
      '[class*="product"]'
    ];

    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const text = this.normalize(element.innerText);

        if (
          text.length > 8 &&
          text.length < 180 &&
          /R\$|estoque|fixar|desafixar|vendidos/i.test(text)
        ) {
          return text
            .split(/R\$|Em estoque|Cliques|Vendidos/i)[0]
            .trim()
            .slice(0, 100);
        }
      }
    }

    return null;
  },

  classifyViolationText(rawText) {
    const text = this.normalize(rawText).toLowerCase();
    if (!text || text.length < 8 || text.length > 1200) {
      return { detected: false, score: 0, severity: "none", text: rawText || "" };
    }

    let score = 0;
    const reasons = [];

    const add = (points, reason) => {
      score += points;
      reasons.push(reason);
    };

    if (/\bviola[cç][aã]o\b/.test(text)) add(7, "violação");
    if (/diretrizes da comunidade|community guidelines/.test(text)) add(7, "diretrizes");
    if (/aviso de pol[ií]tica|policy warning/.test(text)) add(6, "política");
    if (/conte[uú]do (?:proibido|restrito|inadequado)|prohibited content|restricted content/.test(text)) {
      add(6, "conteúdo restrito");
    }
    if (/advert[eê]ncia|warning/.test(text)) add(4, "advertência");
    if (/puni[cç][aã]o|penalidade|penalty|strike/.test(text)) add(5, "penalidade");
    if (/risco de (?:suspens[aã]o|restri[cç][aã]o)|conta pode ser suspensa/.test(text)) {
      add(6, "risco de suspensão");
    }

    const liveContext = /live|transmiss[aã]o|stream/.test(text);
    const endConsequence = /encerrad[ao]|interrompid[ao]|finalizad[ao]|suspens[aã]o|bloquead[ao]|restri[cç][aã]o/.test(text);

    if (liveContext) add(2, "contexto de live");
    if (endConsequence) add(4, "consequência");
    if (/remova|corrija|pare|interrompa|encerre agora|take action/.test(text)) add(2, "ação exigida");

    // Evita falso positivo por textos comuns do painel.
    if (
      score < 8 ||
      (!/viola[cç][aã]o|diretrizes da comunidade|aviso de pol[ií]tica|conte[uú]do (?:proibido|restrito)|advert[eê]ncia|warning|puni[cç][aã]o|penalidade|strike/.test(text))
    ) {
      return { detected: false, score, severity: "none", text: rawText, reasons };
    }

    return {
      detected: true,
      score,
      severity: score >= 13 ? "critical" : "high",
      text: this.normalize(rawText).slice(0, 700),
      reasons
    };
  },

  findViolation() {
    const selectors = [
      '[role="alertdialog"]',
      '[role="dialog"]',
      '[role="alert"]',
      '[aria-live="assertive"]',
      '[class*="violation" i]',
      '[class*="warning" i]',
      '[class*="risk" i]',
      '[class*="notice" i]',
      '[class*="toast" i]',
      '[class*="modal" i]'
    ];

    const candidates = [];

    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (!this.isVisible(element)) continue;

        const text = this.normalize(
          element.innerText ||
          element.textContent ||
          element.getAttribute("aria-label") ||
          ""
        );

        if (text) candidates.push({ element, text });
      }
    }

    const unique = new Map();

    for (const item of candidates) {
      if (!unique.has(item.text)) unique.set(item.text, item);
    }

    const ranked = [...unique.values()]
      .map((item) => ({
        ...item,
        result: this.classifyViolationText(item.text)
      }))
      .filter((item) => item.result.detected)
      .sort((a, b) => b.result.score - a.result.score);

    if (ranked.length) {
      const best = ranked[0];
      return {
        ...best.result,
        source: "visible-alert",
        detectedAt: new Date().toISOString()
      };
    }

    // Fallback controlado: só considera o texto geral quando há termos fortes.
    const body = this.bodyText();
    if (/viola[cç][aã]o|diretrizes da comunidade|aviso de pol[ií]tica|policy warning/.test(body.toLowerCase())) {
      const result = this.classifyViolationText(body.slice(0, 1200));
      if (result.detected) {
        return {
          ...result,
          source: "page-text",
          detectedAt: new Date().toISOString()
        };
      }
    }

    return null;
  },

  violationHash(violation) {
    return this.normalize(violation?.text || "")
      .toLowerCase()
      .slice(0, 240);
  },

  async scanViolationOnly() {
    const violation = this.findViolation();

    if (!violation) {
      if (this.state.violation && this.state.protectionStatus !== "ending") {
        this.state.violation = null;
        this.state.protectionStatus = "idle";
        this.publish();
      }
      return;
    }

    const hash = this.violationHash(violation);
    const isNew = hash && hash !== this.lastViolationHash;

    this.state.violation = violation;
    if (this.state.protectionStatus === "idle") {
      this.state.protectionStatus = "detected";
    }
    this.publish();

    if (isNew) {
      this.lastViolationHash = hash;
      await this.handleViolation(violation);
    }
  },

  async handleViolation(violation) {
    const data = await chrome.storage.local.get([ORION.STORAGE.SETTINGS]);
    const settings = {
      ...ORION.DEFAULTS,
      ...(data[ORION.STORAGE.SETTINGS] || {})
    };

    const cooldownMs = Math.max(
      30,
      Number(settings.protectionCooldownSeconds) || 120
    ) * 1000;

    if (Date.now() - this.lastProtectionAt < cooldownMs) return;

    this.lastProtectionAt = Date.now();

    chrome.runtime.sendMessage({
      type: "ORION_NOTIFY",
      payload: {
        title: "Aviso de violação detectado",
        message: violation.text.slice(0, 180)
      }
    }).catch(() => {});

    if (
      settings.telegramEnabled &&
      settings.protectionTelegram &&
      settings.telegramToken &&
      settings.telegramChatId
    ) {
      chrome.runtime.sendMessage({
        type: "ORION_TELEGRAM_SEND",
        payload: {
          token: settings.telegramToken,
          chatId: settings.telegramChatId,
          text:
            `🚨 Aviso de violação detectado\n` +
            `${violation.text.slice(0, 500)}\n` +
            `Ação: ${settings.protectionEnabled ? "proteção automática ativa" : "somente aviso"}`
        }
      }).catch(() => {});
    }

    chrome.runtime.sendMessage({
      type: "ORION_PROTECTION_EVENT",
      payload: {
        kind: "detected",
        violation,
        automatic: Boolean(settings.protectionEnabled)
      }
    }).catch(() => {});

    if (!settings.protectionEnabled) return;

    this.state.protectionStatus = "ending";
    this.publish();

    const result = await this.endLive({ dryRun: false });

    this.state.protectionStatus = result.ok ? "ended" : "failed";
    this.publish();

    chrome.runtime.sendMessage({
      type: "ORION_PROTECTION_EVENT",
      payload: {
        kind: result.ok ? "ended" : "failed",
        violation,
        result
      }
    }).catch(() => {});

    chrome.runtime.sendMessage({
      type: "ORION_NOTIFY",
      payload: {
        title: result.ok ? "Proteção executada" : "Falha ao encerrar a live",
        message: result.ok
          ? "A extensão acionou o encerramento da transmissão."
          : result.error
      }
    }).catch(() => {});
  },

  buttonText(button) {
    return this.normalize(
      button.innerText ||
      button.textContent ||
      button.getAttribute("aria-label") ||
      button.getAttribute("title") ||
      ""
    );
  },

  findEndLiveButton() {
    const elements = [
      ...document.querySelectorAll(
        'button, [role="button"], [aria-label], [title]'
      )
    ].filter((element) => this.isVisible(element));

    const ranked = elements
      .map((element) => {
        const text = this.buttonText(element);
        const lower = text.toLowerCase();
        let score = 0;

        if (/^encerrar live$|^finalizar live$|^encerrar transmissão$|^finalizar transmissão$/.test(lower)) score += 100;
        if (/encerrar live|finalizar live|encerrar transmissão|finalizar transmissão/.test(lower)) score += 70;
        if (/desligar live|parar transmissão|stop live|end live/.test(lower)) score += 60;

        const rect = element.getBoundingClientRect();
        if (rect.top < 180) score += 8;
        if (element.tagName === "BUTTON") score += 5;

        if (/cancelar|continuar|pausar|configura/.test(lower)) score -= 100;

        return { element, text, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return ranked[0] || null;
  },

  findConfirmEndButton() {
    const dialogs = [
      ...document.querySelectorAll(
        '[role="dialog"], [role="alertdialog"], [class*="modal" i]'
      )
    ].filter((element) => this.isVisible(element));

    const scopes = dialogs.length ? dialogs : [document.body];

    const candidates = [];

    for (const scope of scopes) {
      for (const button of scope.querySelectorAll('button, [role="button"]')) {
        if (!this.isVisible(button)) continue;

        const text = this.buttonText(button).toLowerCase();
        let score = 0;

        if (/^encerrar$|^finalizar$|^confirmar$|^encerrar agora$|^finalizar agora$/.test(text)) score += 100;
        if (/encerrar live|finalizar live|confirmar encerramento|end live/.test(text)) score += 80;
        if (/cancelar|continuar|voltar|manter live/.test(text)) score -= 100;

        if (score > 0) candidates.push({ element: button, text, score });
      }
    }

    return candidates.sort((a, b) => b.score - a.score)[0] || null;
  },

  wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  },

  async endLive({ dryRun = false } = {}) {
    const initial = this.findEndLiveButton();

    if (!initial) {
      return {
        ok: false,
        dryRun,
        stage: "initial-button",
        error: "Botão de encerramento da LIVE não foi localizado."
      };
    }

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        stage: "initial-button",
        buttonText: initial.text
      };
    }

    initial.element.click();
    await this.wait(650);

    const confirmation = this.findConfirmEndButton();

    if (confirmation) {
      confirmation.element.click();
      await this.wait(450);

      return {
        ok: true,
        stage: "confirmed",
        initialButton: initial.text,
        confirmationButton: confirmation.text
      };
    }

    // Algumas versões encerram diretamente sem segunda confirmação.
    return {
      ok: true,
      stage: "initial-click",
      initialButton: initial.text,
      warning: "Nenhum segundo botão de confirmação foi encontrado."
    };
  },

  async runProtectionTest() {
    const sample =
      "Aviso de violação das Diretrizes da Comunidade. " +
      "Sua transmissão ao vivo pode ser encerrada e sua conta pode receber uma penalidade.";

    const classification = this.classifyViolationText(sample);
    const buttonTest = await this.endLive({ dryRun: true });

    chrome.runtime.sendMessage({
      type: "ORION_PROTECTION_EVENT",
      payload: {
        kind: "test",
        classification,
        buttonTest,
        testedAt: new Date().toISOString()
      }
    }).catch(() => {});

    return {
      ok: classification.detected,
      classification,
      buttonTest
    };
  },

  scan() {
    const text = this.bodyText();
    if (!text) return;

    const dashboard =
      /console de live|gerenciador de live|ferramentas da live|análise de transmissões ao vivo/i
        .test(text);

    const duration = this.parseDuration(text);

    const live =
      dashboard &&
      (
        /live ativa|encerrar live|transmissão ao vivo|painel de live/i.test(text) ||
        duration !== null
      );

    const events = this.collectSales();

    const metric = this.parseNumberNear(text, [
      "Itens atribuídos vendidos",
      "Itens vendidos",
      "Vendas"
    ]);

    this.state.dashboardDetected = dashboard;
    this.state.live = live;

    if (duration !== null) this.state.elapsedSeconds = duration;

    this.state.viewers = this.parseNumberNear(text, [
      "Espectadores atuais",
      "Espectadores"
    ]);

    this.state.sales = Math.max(metric || 0, events.length);

    this.state.gmv = this.parseNumberNear(text, [
      "GMV atribuído",
      "GMV",
      "Total"
    ]);

    this.state.product = this.findProduct();
    this.state.saleEvents = events;
    this.state.chatMessages = this.collectChat();
    this.state.lastScanAt = new Date().toISOString();

    this.publish();
    this.scanViolationOnly();
  },

  publish() {
    chrome.runtime.sendMessage({
      type: "ORION_STATE",
      payload: { ...this.state }
    }).catch(() => {});
  },

  elementLabel(element) {
    return this.normalize(
      element?.getAttribute?.("placeholder") ||
      element?.getAttribute?.("aria-label") ||
      element?.getAttribute?.("data-placeholder") ||
      element?.getAttribute?.("title") ||
      element?.innerText ||
      element?.textContent ||
      ""
    );
  },

  findChatInput() {
    const candidates = [
      ...document.querySelectorAll(
        'textarea, input[type="text"], [contenteditable="true"], [role="textbox"]'
      )
    ].filter((element) => this.isVisible(element) && !element.disabled);

    if (!candidates.length) return null;

    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);

    const ranked = candidates.map((element) => {
      const rect = element.getBoundingClientRect();
      const label = this.elementLabel(element).toLowerCase();
      const parentText = this.normalize(
        element.closest("form, section, [class*='chat' i], [class*='comment' i], div")
          ?.innerText || ""
      ).toLowerCase();

      let score = 0;

      if (/digite algo|digite|mensagem|coment|chat|escreva|enviar mensagem/.test(label)) score += 100;
      if (/chat|todos os comentários|comentários relacionados/.test(parentText)) score += 35;
      if (element.isContentEditable) score += 18;
      if (element.tagName === "TEXTAREA") score += 15;
      if (element.getAttribute("role") === "textbox") score += 12;

      // O chat do TikTok costuma ficar na metade direita e na parte inferior.
      if (rect.left > viewportWidth * 0.35) score += 12;
      if (rect.top > viewportHeight * 0.45) score += 10;
      if (rect.width > 180) score += 6;

      if (/pesquisar|produto|id ou nome/.test(label)) score -= 100;
      if (element.type === "search") score -= 100;

      return { element, score, label, rect };
    });

    return ranked.sort((a, b) => b.score - a.score)[0]?.element || null;
  },

  findChatSendButton(input) {
    if (!input) return null;

    const inputRect = input.getBoundingClientRect();
    const scopes = [
      input.closest("form"),
      input.closest("[class*='chat' i]"),
      input.closest("[class*='comment' i]"),
      input.parentElement,
      input.parentElement?.parentElement,
      document.body
    ].filter(Boolean);

    const seen = new Set();
    const candidates = [];

    for (const scope of scopes) {
      for (const element of scope.querySelectorAll("button, [role='button']")) {
        if (seen.has(element) || !this.isVisible(element) || element.disabled) continue;
        seen.add(element);

        const rect = element.getBoundingClientRect();
        const label = this.elementLabel(element).toLowerCase();
        let score = 0;

        if (/enviar|send|publicar|comentar/.test(label)) score += 100;
        if (element.querySelector("svg")) score += 8;

        const verticalDistance = Math.abs(
          (rect.top + rect.height / 2) -
          (inputRect.top + inputRect.height / 2)
        );

        const horizontalDistance = rect.left - inputRect.right;

        if (verticalDistance < 45) score += 30;
        if (horizontalDistance >= -20 && horizontalDistance < 180) score += 25;
        if (rect.left >= inputRect.left) score += 8;
        if (rect.width <= 80 && rect.height <= 80) score += 5;

        if (/config|emoji|anexo|imagem|produto|fechar|cancelar/.test(label)) score -= 80;

        candidates.push({ element, score, rect, label });
      }

      if (candidates.some((item) => item.score >= 80)) break;
    }

    return candidates
      .filter((item) => item.score > 15)
      .sort((a, b) => b.score - a.score)[0]?.element || null;
  },

  async sendChat(text) {
    const message = this.normalize(text);

    if (!message) {
      return { ok: false, error: "Mensagem vazia." };
    }

    const input =
      document.querySelector('textarea[placeholder*="algo" i]') ||
      document.querySelector('textarea[placeholder*="coment" i]') ||
      document.querySelector('textarea[placeholder*="comment" i]') ||
      document.querySelector('textarea[placeholder*="digite" i]') ||
      document.querySelector('[class*="chat" i] textarea') ||
      document.querySelector('[class*="input" i] textarea') ||
      document.querySelector('textarea.arco-textarea') ||
      this.findChatInput();

    if (!input || !this.isVisible(input)) {
      return { ok: false, error: "Campo de comentário não localizado." };
    }

    try {
      input.focus();
      input.click();

      if (input.tagName === "TEXTAREA") {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value"
        )?.set;

        if (setter) setter.call(input, message);
        else input.value = message;
      } else if ("value" in input) {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;

        if (setter) setter.call(input, message);
        else input.value = message;
      } else {
        input.textContent = message;
      }

      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));

      try {
        input.dispatchEvent(new CompositionEvent("compositionstart", {
          bubbles: true
        }));

        input.dispatchEvent(new CompositionEvent("compositionend", {
          bubbles: true,
          data: message
        }));
      } catch {}

      await this.wait(320);

      const keyboardOptions = {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        charCode: 13,
        bubbles: true,
        cancelable: true
      };

      input.dispatchEvent(new KeyboardEvent("keydown", keyboardOptions));
      input.dispatchEvent(new KeyboardEvent("keypress", keyboardOptions));
      input.dispatchEvent(new KeyboardEvent("keyup", keyboardOptions));

      await this.wait(250);

      const remaining = "value" in input
        ? this.normalize(input.value)
        : this.normalize(input.textContent);

      return {
        ok: remaining.length === 0,
        remainingText: remaining,
        error: remaining
          ? "A mensagem foi preenchida, mas o TikTok não limpou o campo após o Enter."
          : null
      };
    } catch (error) {
      return {
        ok: false,
        error: `Erro ao enviar comentário: ${error.message}`
      };
    }
  },

  clickButton(regex) {
    const button = [...document.querySelectorAll("button")]
      .find((element) => regex.test(this.normalize(element.innerText)));

    if (!button) {
      return { ok: false, error: "Botão não localizado." };
    }

    button.click();
    return { ok: true };
  },

  findActionContainer(button) {
    let node = button;

    for (let index = 0; index < 8 && node; index += 1, node = node.parentElement) {
      const text = this.normalize(node.innerText);

      if (
        text.length >= 8 &&
        text.length <= 900 &&
        /R\$|estoque|vendido|produto|cupom|desconto/i.test(text)
      ) {
        return node;
      }
    }

    return button.parentElement;
  },



  findPinnedProductOverlay() {
    const viewportWidth = Math.max(window.innerWidth, 1);
    const viewportHeight = Math.max(window.innerHeight, 1);

    const candidates = [
      ...document.querySelectorAll("body *")
    ]
      .filter((element) => this.isVisible(element))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const text = this.normalize(element.innerText);

        return { element, rect, text };
      })
      .filter(({ element, rect, text }) => {
        if (!text || text.length < 8 || text.length > 260) return false;
        if (!/R\$\s*\d/.test(text)) return false;
        if (!element.querySelector("img")) return false;

        // O cartão fixado aparece sobre a área de vídeo, e não na lista da esquerda.
        if (rect.left < viewportWidth * 0.35) return false;
        if (rect.top > viewportHeight * 0.75) return false;
        if (rect.width < 160 || rect.width > 650) return false;
        if (rect.height < 55 || rect.height > 280) return false;

        // Exclui a linha de produto do catálogo.
        if (/em estoque|cliques|itens vendidos|adicionado ao carrinho/i.test(text)) {
          return false;
        }

        if (/desafixar|fixar produto/i.test(text)) return false;

        return true;
      });

    if (!candidates.length) return null;

    const ranked = candidates.map((item) => {
      let score = 0;

      if (/R\$\s*\d/.test(item.text)) score += 20;
      if (/vendidos|avalia[cç][aã]o|★/.test(item.text)) score += 5;
      if (item.element.querySelector("button, [role='button']")) score += 4;
      if (item.rect.left > viewportWidth * 0.45) score += 8;
      if (item.rect.top < viewportHeight * 0.55) score += 6;

      return { ...item, score };
    });

    return ranked.sort((a, b) => b.score - a.score)[0] || null;
  },

  isPinnedProductVisible() {
    return Boolean(this.findPinnedProductOverlay());
  },

  findUnpinButton() {
    const candidates = [
      ...document.querySelectorAll("button, [role='button']")
    ]
      .filter((element) => this.isVisible(element))
      .map((element) => ({
        element,
        text: this.normalize(
          element.innerText ||
          element.textContent ||
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          ""
        )
      }))
      .filter((item) =>
        /^(desafixar|unpin)$/i.test(item.text) ||
        /desafixar produto|remover fixa[cç][aã]o|produto fixado/i.test(item.text)
      );

    if (!candidates.length) return null;

    // Prioriza o botão que pertence à área de produto, com preço/estoque/imagem.
    const ranked = candidates.map((item, index) => {
      const container = this.findActionContainer(item.element);
      const context = this.normalize(container?.innerText || item.text);
      let score = 0;

      if (/R\$/.test(context)) score += 6;
      if (/estoque|vendido|cliques|adicionado ao carrinho/i.test(context)) score += 5;
      if (container?.querySelector("img")) score += 3;
      if (/produto/i.test(context)) score += 2;
      if (/cupom|voucher|desconto/i.test(context)) score -= 12;

      score -= index * 0.01;

      return {
        ...item,
        context,
        score
      };
    });

    return ranked.sort((a, b) => b.score - a.score)[0] || null;
  },

  async waitForFixButton(timeoutMs = 2500) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const buttons = [...document.querySelectorAll("button, [role='button']")]
        .filter((element) => this.isVisible(element))
        .filter((element) => {
          const text = this.normalize(
            element.innerText ||
            element.textContent ||
            element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            ""
          );

          return /^(fixar|pin)$/i.test(text) || /fixar produto/i.test(text);
        });

      if (buttons.length) return true;
      await this.wait(150);
    }

    return false;
  },

  async refreshPinnedProduct(skipCoupons = true) {
    const steps = [];
    const unpin = this.findUnpinButton();

    if (unpin) {
      // DESAFIXAR ativo = produto está fixado.
      unpin.element.click();

      steps.push({
        action: "unpin",
        ok: true,
        text: unpin.text,
        context: unpin.context?.slice(0, 160)
      });

      // Aguarda o TikTok substituir DESAFIXAR por FIXAR.
      await this.wait(1800);
      await this.waitForFixButton(2200);
    } else {
      steps.push({
        action: "unpin",
        ok: false,
        error: "Produto não estava fixado; será fixado diretamente."
      });
    }

    const pin = this.pinMainProduct(skipCoupons);

    steps.push({
      action: "pin",
      ...pin
    });

    return {
      ok: Boolean(pin.ok),
      wasPinned: Boolean(unpin),
      pinned: Boolean(pin.ok),
      steps,
      skippedCoupons: skipCoupons
    };
  },

  pinMainProduct(skipCoupons = true) {
    const buttons = [...document.querySelectorAll("button")]
      .filter((button) =>
        /^fixar$|fixar produto|pin/i.test(this.normalize(button.innerText))
      );

    if (!buttons.length) {
      return { ok: false, error: "Nenhum botão Fixar foi localizado." };
    }

    const ranked = buttons.map((button, index) => {
      const container = this.findActionContainer(button);
      const text = this.normalize(container?.innerText || button.innerText);
      const coupon =
        /cupom|voucher|desconto|código promocional|codigo promocional|oferta relâmpago|oferta relampago/i.test(text);

      let score = 0;

      if (/R\$/.test(text)) score += 6;
      if (/estoque|vendido|cliques|adicionado ao carrinho/i.test(text)) score += 5;
      if (container?.querySelector("img")) score += 3;
      if (/produto/i.test(text)) score += 2;
      if (coupon) score -= 20;

      score -= index * 0.01;

      return { button, text, coupon, score };
    });

    const eligible = skipCoupons
      ? ranked.filter((item) => !item.coupon)
      : ranked;

    // Regra obrigatória: nunca fixar cupom, voucher ou desconto.
    // Se somente cupons forem encontrados, não clica em nada.
    if (skipCoupons && !eligible.length) {
      return {
        ok: false,
        error: "Produto principal não localizado. Cupons foram ignorados.",
        skippedCoupons: true
      };
    }

    const target = eligible
      .sort((a, b) => b.score - a.score)[0];

    if (!target) {
      return { ok: false, error: "Produto principal não localizado." };
    }

    target.button.click();

    return {
      ok: true,
      text: target.text.slice(0, 160),
      skippedCoupons: skipCoupons
    };
  }
};
