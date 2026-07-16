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
  emergencyEndBusy: false,
  emergencyWarningHash: "",
  uniqueSaleIds: new Set(),

  start() {
    if (this.observer) return;

    this.scan();

    this.observer = new MutationObserver((mutations) => {
      this.scanEmergencyWarnings(mutations);

      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => this.scan(), 120);
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


  warningTextFromElement(element) {
    if (!element || !(element instanceof Element)) return "";

    return this.normalize(
      element.innerText ||
      element.textContent ||
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      ""
    );
  },

  isOfficialLiveWarning(element, text) {
    if (!element || !this.isVisible(element) || !text) return false;

    const normalized = text.toLowerCase();

    const warningTerms =
      /aviso|alerta|warning|viola[cç][aã]o|diretrizes|pol[ií]tica|restri[cç][aã]o|penalidade|suspens[aã]o|conte[uú]do inadequado|direitos autorais|copyright|risco|transmiss[aã]o pode ser encerrada|live pode ser encerrada|conta pode ser penalizada/i;

    const officialContainer = Boolean(
      element.matches?.(
        '[role="alert"],[role="alertdialog"],[aria-live="assertive"],[class*="warning" i],[class*="violation" i],[class*="risk" i],[class*="notice" i],[class*="toast" i]'
      ) ||
      element.closest?.(
        '[role="alert"],[role="alertdialog"],[aria-live="assertive"],[class*="warning" i],[class*="violation" i],[class*="risk" i],[class*="notice" i],[class*="toast" i]'
      )
    );

    const harmless=/configura[cç][aã]o salva|salvo com sucesso|mensagem enviada|produto fixado|conectado com sucesso/i;
    return officialContainer&&!harmless.test(normalized)&&(warningTerms.test(normalized)||normalized.length>=12);
  },

  scanEmergencyWarnings(mutations = []) {
    const candidates = new Set();

    for (const mutation of mutations) {
      if (mutation.target instanceof Element) {
        candidates.add(mutation.target);
      }

      for (const node of mutation.addedNodes || []) {
        if (node instanceof Element) {
          candidates.add(node);

          node.querySelectorAll?.(
            '[role="alert"],[role="alertdialog"],[aria-live="assertive"],[class*="warning" i],[class*="violation" i],[class*="risk" i],[class*="notice" i],[class*="toast" i]'
          ).forEach(element => candidates.add(element));
        }
      }
    }

    if (!candidates.size) {
      document.querySelectorAll(
        '[role="alert"],[role="alertdialog"],[aria-live="assertive"],[class*="warning" i],[class*="violation" i],[class*="risk" i],[class*="notice" i],[class*="toast" i]'
      ).forEach(element => candidates.add(element));
    }

    for (const element of candidates) {
      const scope =
        element.closest?.(
          '[role="alert"],[role="alertdialog"],[aria-live="assertive"],[class*="warning" i],[class*="violation" i],[class*="risk" i],[class*="notice" i],[class*="toast" i]'
        ) || element;

      const text = this.warningTextFromElement(scope);

      if (!this.isOfficialLiveWarning(scope, text)) continue;

      const hash = text.toLowerCase().slice(0, 300);

      if (
        hash === this.emergencyWarningHash &&
        this.emergencyEndBusy
      ) {
        continue;
      }

      this.emergencyWarningHash = hash;

      this.endLiveImmediately({
        reason: "warning",
        warningText: text
      }).catch(console.error);

      let warningAttempts=0;
      const warningRetry=setInterval(async()=>{
        warningAttempts+=1;
        const result=await this.endLive({
          dryRun:false,
          reason:"warning"
        });
        if(result.ok||warningAttempts>=20){
          clearInterval(warningRetry);
        }
      },500);

      return;
    }
  },

  async endLiveImmediately({
    reason = "warning",
    warningText = ""
  } = {}) {
    if (this.emergencyEndBusy) {
      return {
        ok: false,
        busy: true,
        error: "Encerramento já está em andamento."
      };
    }

    this.emergencyEndBusy = true;
    this.state.protectionStatus = "ending";
    this.publish();

    try {
      const result = await this.endLive({
        dryRun: false,
        reason
      });

      this.state.protectionStatus =
        result.ok ? "ended" : "failed";

      this.publish();

      chrome.runtime.sendMessage({
        type: "ORION_PROTECTION_EVENT",
        payload: {
          kind: result.ok
            ? "immediate-end-success"
            : "immediate-end-failed",
          reason,
          warningText: warningText.slice(0, 500),
          result,
          createdAt: new Date().toISOString()
        }
      }).catch(() => {});

      return result;
    } finally {
      this.emergencyEndBusy = false;
    }
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
    const parseLocaleNumber = (raw) => {
      if (raw == null) return null;

      let value = String(raw)
        .replace(/[^\d.,-]/g, "")
        .trim();

      if (!value) return null;

      if (value.includes(",") && value.includes(".")) {
        if (value.lastIndexOf(",") > value.lastIndexOf(".")) {
          value = value.replace(/\./g, "").replace(",", ".");
        } else {
          value = value.replace(/,/g, "");
        }
      } else if (value.includes(",")) {
        value = value.replace(/\./g, "").replace(",", ".");
      } else if ((value.match(/\./g) || []).length > 1) {
        value = value.replace(/\./g, "");
      }

      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    };

    for (const label of labels) {
      const safe = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        new RegExp(`${safe}\\s*[:\\-]?\\s*R?\\$?\\s*([\\d.,]+)`, "i"),
        new RegExp(`R?\\$?\\s*([\\d.,]+)\\s*${safe}`, "i")
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        const value = parseLocaleNumber(match?.[1]);
        if (value !== null) return value;
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


  readMetricFromDom(labels) {
    const parseLocaleNumber = (raw) => {
      if (raw == null) return null;

      let value = String(raw)
        .replace(/[^\d.,-]/g, "")
        .trim();

      if (!value) return null;

      if (value.includes(",") && value.includes(".")) {
        if (value.lastIndexOf(",") > value.lastIndexOf(".")) {
          value = value.replace(/\./g, "").replace(",", ".");
        } else {
          value = value.replace(/,/g, "");
        }
      } else if (value.includes(",")) {
        value = value.replace(/\./g, "").replace(",", ".");
      }

      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    };

    const nodes = [...document.querySelectorAll("body *")];

    for (const node of nodes) {
      const ownText = this.normalize(
        [...node.childNodes]
          .filter((child) => child.nodeType === Node.TEXT_NODE)
          .map((child) => child.textContent)
          .join(" ")
      );

      const matchedLabel = labels.find((label) =>
        ownText.toLowerCase().includes(label.toLowerCase())
      );

      if (!matchedLabel) continue;

      const candidates = [
        node.nextElementSibling,
        node.parentElement?.querySelector?.(
          '[class*="value"],[class*="number"],strong,b'
        ),
        node.parentElement,
        node
      ].filter(Boolean);

      for (const candidate of candidates) {
        const raw = this.normalize(
          candidate.innerText || candidate.textContent || ""
        );
        const match = raw.match(/R?\$?\s*([\d.,]+)/);
        const value = parseLocaleNumber(match?.[1]);

        if (value !== null) return value;
      }
    }

    return null;
  },

  collectSales() {
    const salePattern =
      /acabou de comprar|comprou o produto|nova venda|pedido realizado|finalizou a compra|realizou um pedido/i;

    const genericPattern =
      /^(cliente|cliente\s*\d+|comprador|usuário|usuario|user|gmv atribuído|gmv atribuido)\b/i;

    const normalizeSaleText = (value) =>
      this.normalize(value)
        .toLowerCase()
        .replace(/\b(há|a)\s+\d+\s+(segundos?|minutos?)\b/gi, "")
        .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, "")
        .replace(/r\$\s*\d[\d.,]*/gi, "")
        .replace(/\s+/g, " ")
        .trim();

    const cleanName = (value) => {
      const text = this.normalize(value)
        .replace(/\b(acabou de comprar|comprou o produto|nova venda|pedido realizado|finalizou a compra|realizou um pedido)\b.*$/i, "")
        .replace(/[•·|:–—-]+$/g, "")
        .trim();
      if (!text || genericPattern.test(text) || text.length > 80) return "";
      return text;
    };

    const roots = [...document.querySelectorAll(
      '[class*="order"],[class*="sale"],[class*="purchase"],[class*="notification"],[data-e2e*="order"],[data-testid*="order"],li'
    )].filter(element => {
      if (!this.isVisible(element)) return false;
      const text=this.normalize(element.innerText||element.textContent||"");
      return text.length<=600&&salePattern.test(text);
    });

    const leafRoots=roots.filter(root=>!roots.some(other=>
      other!==root&&root.contains(other)&&salePattern.test(this.normalize(other.innerText||other.textContent||""))
    ));

    const events=[];
    const scanSeen=new Set();

    for(const root of leafRoots){
      const text=this.normalize(root.innerText||root.textContent||"");
      if(!text||text.length>600)continue;

      const nameNodes=[...root.querySelectorAll(
        '[class*="buyer"],[class*="customer"],[class*="username"],[class*="nickname"],[class*="name"],strong,b'
      )];

      let buyerName="";
      for(const node of nameNodes){
        const candidate=cleanName(node.innerText||node.textContent||"");
        if(candidate){buyerName=candidate;break;}
      }

      if(!buyerName){
        const direct=text.match(/^(.+?)\s+(?:acabou de comprar|comprou o produto|finalizou a compra|realizou um pedido)/i);
        buyerName=cleanName(direct?.[1]||"");
      }

      const productText=this.normalize(
        root.querySelector('[class*="product"],[class*="item-name"],[data-e2e*="product"],[data-testid*="product"]')?.innerText||""
      );

      const stableText=normalizeSaleText(text);
      const id=[buyerName.toLowerCase(),normalizeSaleText(productText),stableText].filter(Boolean).join("|");
      if(!id||scanSeen.has(id))continue;

      scanSeen.add(id);
      this.uniqueSaleIds.add(id);
      events.push({id,text,buyerName,productName:productText,detectedAt:new Date().toISOString()});
    }

    if(this.uniqueSaleIds.size>1000){
      this.uniqueSaleIds=new Set([...this.uniqueSaleIds].slice(-500));
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


  isStrictCouponElement(element) {
    if (!element) return false;

    const container =
      this.findActionContainer(element) ||
      element.closest?.(
        '[class*="product"],[id*="product"],[class*="item"],[class*="card"],li'
      ) ||
      element;

    const descendants = [
      ...container.querySelectorAll?.(
        '[aria-label],[title],[data-e2e],[data-testid],[class],[id]'
      ) || []
    ].slice(0, 120);

    const text = this.normalize(
      [
        container.innerText,
        container.textContent,
        container.getAttribute?.("aria-label"),
        container.getAttribute?.("title"),
        container.getAttribute?.("data-e2e"),
        container.getAttribute?.("data-testid"),
        container.className,
        container.id,
        ...descendants.map(node => [
          node.innerText,
          node.textContent,
          node.getAttribute?.("aria-label"),
          node.getAttribute?.("title"),
          node.getAttribute?.("data-e2e"),
          node.getAttribute?.("data-testid"),
          node.className,
          node.id
        ].filter(Boolean).join(" "))
      ].filter(Boolean).join(" ")
    ).toLowerCase();

    const blockedTerms =
      /cupom|cupons|voucher|desconto|código promocional|codigo promocional|promo code|discount|oferta relâmpago|oferta relampago|claim coupon|usar cupom|resgatar cupom|coletar cupom|pegar cupom|aplicar cupom|obter cupom|% off|\\boff\\b|economize|economia de r\\$|frete grátis|frete gratis/i;

    const blockedStructure = Boolean(
      container.matches?.(
        '[class*="coupon" i],[id*="coupon" i],[class*="voucher" i],[id*="voucher" i],[class*="discount" i],[id*="discount" i],[data-e2e*="coupon" i],[data-testid*="coupon" i],[aria-label*="cupom" i],[title*="cupom" i]'
      ) ||
      container.querySelector?.(
        '[class*="coupon" i],[id*="coupon" i],[class*="voucher" i],[id*="voucher" i],[class*="discount" i],[id*="discount" i],[data-e2e*="coupon" i],[data-testid*="coupon" i],[aria-label*="cupom" i],[title*="cupom" i]'
      )
    );

    return blockedStructure || blockedTerms.test(text);
  },

  isAuthorizedMainProductElement(element) {
    if (!element) return false;

    const container =
      this.findActionContainer(element) ||
      element.closest?.(
        '[class*="product"],[id*="product"],[data-e2e*="product"],[data-testid*="product"],[class*="item-card"],[class*="goods"],li'
      );

    if (!container) return false;
    if (this.isStrictCouponElement(container)) return false;

    const text = this.normalize(
      [
        container.innerText,
        container.textContent,
        container.getAttribute?.("aria-label"),
        container.getAttribute?.("title"),
        container.className,
        container.id
      ].filter(Boolean).join(" ")
    ).toLowerCase();

    const productEvidence =
      /produto|product|item|estoque|vendido|adicionado ao carrinho|r\\$|sku/i.test(text) ||
      Boolean(container.querySelector("img"));

    const couponEvidence =
      /cupom|voucher|desconto|promo code|discount|oferta relâmpago|oferta relampago|% off/i.test(text);

    return productEvidence && !couponEvidence;
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

    // Avisos encerram a LIVE imediatamente, sem cooldown.

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

    this.state.protectionStatus = "ending";
    this.publish();

    const result = await this.endLiveImmediately({
      reason: "warning",
      warningText: violation.text
    });

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
    const viewportWidth=Math.max(window.innerWidth,1);
    const elements=[...document.querySelectorAll(
      'button,[role="button"],[aria-label],[title],[data-e2e],[data-testid]'
    )].filter(element=>this.isVisible(element));

    const ranked=elements.map((element,index)=>{
      const text=this.buttonText(element);
      const lower=text.toLowerCase();
      const attributes=this.normalize([
        element.getAttribute("aria-label"),element.getAttribute("title"),
        element.getAttribute("data-e2e"),element.getAttribute("data-testid"),
        element.id,element.className
      ].filter(Boolean).join(" ")).toLowerCase();

      const rect=element.getBoundingClientRect();
      const hasSvg=Boolean(element.querySelector("svg"));
      const iconOnly=!lower||lower.length<=2;
      const topToolbar=rect.top>=0&&rect.top<170;
      const farRight=rect.right>viewportWidth*.78;
      const toolbar=element.closest(
        'header,[class*="header" i],[class*="toolbar" i],[class*="control" i],[class*="live" i]'
      )||element.parentElement;
      const toolbarText=this.normalize(toolbar?.innerText||toolbar?.textContent||"");
      const toolbarHasTimer=/\b\d{1,2}:\d{2}:\d{2}\b/.test(toolbarText);
      const siblings=toolbar?[...toolbar.querySelectorAll('button,[role="button"]')].filter(item=>this.isVisible(item)):[];
      const lastVisibleControl=siblings.length>0&&siblings[siblings.length-1]===element;

      let score=0;
      if(/^encerrar live$|^finalizar live$|^encerrar transmissão$|^finalizar transmissão$/.test(lower))score+=1000;
      if(/encerrar live|finalizar live|encerrar transmissão|finalizar transmissão|desligar live|parar transmissão|stop live|end live/.test(lower))score+=700;
      if(/end.?live|stop.?live|power|shutdown|close.?live|finish.?live|encerrar|finalizar|desligar/.test(attributes))score+=800;

      if(hasSvg&&iconOnly&&topToolbar&&farRight&&toolbarHasTimer)score+=650;
      if(lastVisibleControl&&topToolbar&&farRight&&hasSvg)score+=180;
      if(element.tagName==="BUTTON")score+=30;
      if(/cancelar|continuar|pausar|configura|microfone|volume|som|câmera|camera/.test(lower+" "+attributes))score-=1200;

      return{element,text:text||attributes||"botão de energia",score,index};
    }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score);

    return ranked[0]||null;
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

        if (/^encerrar$|^finalizar$|^confirmar$|^encerrar agora$|^finalizar agora$|^sim$|^confirm$|^end now$/.test(text)) score += 200;
        if (/encerrar live|finalizar live|confirmar encerramento|encerrar transmissão|finalizar transmissão|end live|stop live/.test(text)) score += 160;
        if (/cancelar|continuar|voltar|manter live/.test(text)) score -= 100;

        if (score > 0) candidates.push({ element: button, text, score });
      }
    }

    return candidates.sort((a, b) => b.score - a.score)[0] || null;
  },

  wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  },

  async endLive({
    dryRun = false,
    reason = "manual"
  } = {}) {
    const initialDeadline = Date.now() + 10000;
    let initial = null;

    while (Date.now() < initialDeadline && !initial) {
      initial = this.findEndLiveButton();

      if (!initial) {
        await this.wait(20);
      }
    }

    if (!initial) {
      return {
        ok: false,
        dryRun,
        reason,
        stage: "initial-button",
        error: "Botão de encerramento da LIVE não foi localizado."
      };
    }

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        reason,
        stage: "initial-button",
        buttonText: initial.text
      };
    }

    initial.element.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true,view:window}));
    initial.element.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,cancelable:true,view:window}));
    initial.element.click();

    let confirmation = null;
    const confirmationDeadline = Date.now() + 7000;

    while (Date.now() < confirmationDeadline) {
      confirmation = this.findConfirmEndButton();

      if (confirmation) {
        confirmation.element.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true,view:window}));
        confirmation.element.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,cancelable:true,view:window}));
        confirmation.element.click();

        return {
          ok: true,
          reason,
          stage: "confirmed",
          initialButton: initial.text,
          confirmationButton: confirmation.text,
          completedAt: new Date().toISOString()
        };
      }

      const retryInitial = this.findEndLiveButton();

      if (
        retryInitial &&
        Date.now() + 100 < confirmationDeadline
      ) {
        retryInitial.element.click();
      }

      await this.wait(20);
    }

    return {
      ok: true,
      reason,
      stage: "initial-click",
      initialButton: initial.text,
      warning:
        "A interface não exibiu um segundo botão de confirmação.",
      completedAt: new Date().toISOString()
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

    const metric =
      this.readMetricFromDom([
        "Itens atribuídos vendidos",
        "Itens vendidos",
        "Vendas realizadas",
        "Vendas"
      ]) ??
      this.parseNumberNear(text, [
        "Itens atribuídos vendidos",
        "Itens vendidos",
        "Vendas realizadas",
        "Vendas"
      ]);

    const gmvMetric =
      this.readMetricFromDom([
        "GMV atribuído",
        "GMV",
        "Receita",
        "Valor vendido"
      ]) ??
      this.parseNumberNear(text, [
        "GMV atribuído",
        "GMV",
        "Receita",
        "Valor vendido"
      ]);

    this.state.dashboardDetected = dashboard;
    this.state.live = live;

    if (duration !== null) this.state.elapsedSeconds = duration;

    this.state.viewers = this.parseNumberNear(text, [
      "Espectadores atuais",
      "Espectadores"
    ]);

    const metricSales =
      metric !== null && metric !== undefined
        ? Math.max(0, Math.floor(Number(metric) || 0))
        : null;

    this.state.sales =
      metricSales !== null
        ? metricSales
        : Math.max(Number(this.state.sales) || 0,this.uniqueSaleIds.size);

    if (gmvMetric !== null && gmvMetric !== undefined) {
      this.state.gmv = Number(gmvMetric);
    }

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
      document.querySelector('[contenteditable="true"][role="textbox"]') ||
      document.querySelector('[class*="chat" i] textarea') ||
      document.querySelector('[class*="input" i] textarea') ||
      document.querySelector('textarea.arco-textarea') ||
      this.findChatInput();

    if (!input || !this.isVisible(input)) {
      return { ok: false, error: "Campo de comentário não localizado." };
    }

    const setValue = () => {
      input.focus();
      input.click();

      if (input.tagName === "TEXTAREA") {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value"
        )?.set;
        if (setter) setter.call(input, message);
        else input.value = message;
      } else if (input.tagName === "INPUT") {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        if (setter) setter.call(input, message);
        else input.value = message;
      } else {
        input.textContent = message;
      }

      try {
        input.dispatchEvent(new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: message
        }));
      } catch {}

      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    const findSendButton = () => {
      const scope =
        input.closest('[class*="chat" i],[class*="comment" i],[class*="input" i],form') ||
        input.parentElement ||
        document;

      return [...scope.querySelectorAll('button,[role="button"],[aria-label],[title]')]
        .find(button => {
          if (!this.isVisible(button)) return false;
          const label = this.normalize(
            button.innerText ||
            button.textContent ||
            button.getAttribute("aria-label") ||
            button.getAttribute("title") ||
            button.getAttribute("data-e2e") ||
            button.getAttribute("data-testid") ||
            ""
          ).toLowerCase();

          return /enviar|send|publicar|comentar|submit/.test(label);
        });
    };

    const rpcErrorVisible = () => {
      const text = this.normalize(document.body?.innerText || "").toLowerCase();
      return /rpc call error|rpc error|falha ao enviar|não foi possível enviar|nao foi possivel enviar/.test(text);
    };

    try {
      setValue();
      await this.wait(150);

      const sendButton = findSendButton();

      if (sendButton) {
        sendButton.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true,view:window}));
        sendButton.dispatchEvent(new MouseEvent("mouseup",{bubbles:true,cancelable:true,view:window}));
        sendButton.click();
      } else {
        const options = {
          key:"Enter",code:"Enter",keyCode:13,which:13,charCode:13,
          bubbles:true,cancelable:true
        };
        input.dispatchEvent(new KeyboardEvent("keydown",options));
        input.dispatchEvent(new KeyboardEvent("keypress",options));
        input.dispatchEvent(new KeyboardEvent("keyup",options));
      }

      await this.wait(600);

      if (rpcErrorVisible()) {
        return {
          ok:false,
          retryable:true,
          error:"O TikTok retornou RPC call error ao enviar este comentário."
        };
      }

      const remaining = "value" in input
        ? this.normalize(input.value)
        : this.normalize(input.textContent);

      if (remaining === message) {
        return {
          ok:false,
          retryable:true,
          error:"O comentário não foi confirmado pelo TikTok."
        };
      }

      return { ok:true, message };
    } catch (error) {
      return {
        ok:false,
        retryable:true,
        error:error?.message||"Erro inesperado ao enviar comentário."
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
    const buttons = [
      ...document.querySelectorAll(
        'button,[role="button"]'
      )
    ].filter((button) => {
      if (!this.isVisible(button)) return false;

      const label = this.normalize(
        button.innerText ||
        button.textContent ||
        button.getAttribute("aria-label") ||
        button.getAttribute("title") ||
        ""
      );

      return /^fixar$|^fixar produto$|^pin$|^pin product$/i.test(label);
    });

    if (!buttons.length) {
      return {
        ok: false,
        error: "Nenhum botão Fixar foi localizado."
      };
    }

    const candidates = buttons
      .map((button, index) => {
        const container =
          this.findActionContainer(button) ||
          button.closest(
            '[class*="product"],[id*="product"],[class*="item"],[class*="card"],li'
          );

        const text = this.normalize(
          container?.innerText || button.innerText || ""
        );

        const rect =
          container?.getBoundingClientRect?.() ||
          button.getBoundingClientRect();

        const coupon = this.isStrictCouponElement(
          container || button
        );

        const authorized =
          !coupon &&
          this.isAuthorizedMainProductElement(
            container || button
          );

        let score = 0;

        // O produto principal normalmente aparece antes dos demais.
        score += Math.max(0, 10000 - Math.max(0, rect.top));
        score -= index * 10;

        if (/produto principal|main product|em destaque/i.test(text)) {
          score += 50000;
        }

        if (/r\\$|estoque|vendido|adicionado ao carrinho/i.test(text)) {
          score += 500;
        }

        if (container?.querySelector("img")) {
          score += 100;
        }

        if (coupon) {
          score = Number.NEGATIVE_INFINITY;
        }

        return {
          button,
          container,
          text,
          coupon,
          authorized,
          score
        };
      })
      .filter(candidate =>
        candidate.authorized &&
        !candidate.coupon &&
        Number.isFinite(candidate.score)
      )
      .sort((left, right) => right.score - left.score);

    const target = candidates[0];

    if (!target) {
      return {
        ok: false,
        skippedCoupons: true,
        error:
          "Nenhum produto principal seguro foi encontrado. Cupons e descontos foram bloqueados."
      };
    }

    // Última barreira imediatamente antes do clique.
    if (
      this.isStrictCouponElement(target.container || target.button) ||
      !this.isAuthorizedMainProductElement(
        target.container || target.button
      )
    ) {
      return {
        ok: false,
        skippedCoupons: true,
        error:
          "Clique cancelado: o item não foi confirmado como produto principal."
      };
    }

    target.button.click();

    return {
      ok: true,
      text: target.text.slice(0, 160),
      skippedCoupons: true,
      selectedAs: "main-product-only"
    };
  }
};
