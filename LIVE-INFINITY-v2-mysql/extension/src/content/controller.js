OrionDetector.start();

const OrionContentAutomation = {
  settings: { ...ORION.DEFAULTS },
  commentTimer: null,
  commentIndex: 0,
  autoPinTimer: null,
  autoPinBusy: false,
  seenSales: new Set(),
  lastKnownSalesCount: 0,
  postSaleTimer: null,
  postSaleMessageIndex: 0,
  pendingSalesCount: 0,
  previousLiveState: false,
  endTimerBusy: false,
  exactEndTimer: null,
  endLiveEmergencyTimer: null,
  completedEndTimerAt: null,

  async init() {
    await this.loadSettings();
    this.applySettings();
    this.configureExactEndTimer();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (!changes[ORION.STORAGE.SETTINGS]) return;

      this.settings = {
        ...ORION.DEFAULTS,
        ...(changes[ORION.STORAGE.SETTINGS].newValue || {})
      };

      this.applySettings();
      this.configureExactEndTimer();
    });

    setInterval(() => {
      this.handleLiveTransition();
      this.handleSales();
      this.handleEndTimer();
    }, 1000);
  },

  async loadSettings() {
    const data = await chrome.storage.local.get([ORION.STORAGE.SETTINGS]);
    this.settings = {
      ...ORION.DEFAULTS,
      ...(data[ORION.STORAGE.SETTINGS] || {})
    };
  },

  applySettings() {
    this.configureComments();
    this.configureAutoPin();
  },

  configureComments() {
    clearTimeout(this.commentTimer);
    this.commentTimer = null;

    if (!this.settings.commentsEnabled) return;
    if (!Array.isArray(this.settings.comments) || !this.settings.comments.length) return;

    // Mantém a posição atual enquanto a extensão estiver aberta.
    // Em uma nova sessão, começa pelo primeiro item salvo.
    if (
      !Number.isInteger(this.commentIndex) ||
      this.commentIndex < 0 ||
      this.commentIndex >= this.settings.comments.length
    ) {
      this.commentIndex = 0;
    }

    this.scheduleNextComment();
  },

  scheduleNextComment() {
    clearTimeout(this.commentTimer);
    this.commentTimer = null;

    if (!this.settings.commentsEnabled) return;

    const comments = Array.isArray(this.settings.comments)
      ? this.settings.comments
          .map(value => String(value || "").trim())
          .filter(Boolean)
      : [];

    if (!comments.length) return;

    const configuredMinimum = Math.floor(
      Number(this.settings.minCommentDelay)
    );

    const configuredMaximum = Math.floor(
      Number(this.settings.maxCommentDelay)
    );

    const minimum =
      Number.isFinite(configuredMinimum) &&
      configuredMinimum >= 1
        ? configuredMinimum
        : 45;

    const maximum =
      Number.isFinite(configuredMaximum) &&
      configuredMaximum >= 1
        ? configuredMaximum
        : 90;

    const lower = Math.min(minimum, maximum);
    const upper = Math.max(minimum, maximum);

    const seconds =
      Math.floor(Math.random() * (upper - lower + 1)) +
      lower;

    this.commentTimer = setTimeout(async () => {
      if (!this.settings.commentsEnabled) return;

      const selectedIndex =
        this.commentIndex % comments.length;

      const message = comments[selectedIndex];

      let result = await OrionDetector.sendChat(message);

      if (!result.ok && result.retryable) {
        await OrionDetector.wait(1000);
        result = await OrionDetector.sendChat(message);
      }

      if (result.ok) {
        this.commentIndex =
          (this.commentIndex + 1) % comments.length;
      }

      chrome.runtime.sendMessage({
        type: "ORION_AUTOMATION_EVENT",
        payload: {
          kind: result.ok
            ? "comment-sent"
            : "comment-failed",
          selectedIndex,
          message,
          result,
          createdAt: new Date().toISOString()
        }
      }).catch(() => {});

      // Agenda somente depois de terminar o envio atual.
      this.scheduleNextComment();
    }, seconds * 1000);
  },


  configureAutoPin() {
    clearInterval(this.autoPinTimer);

    this.autoPinTimer = null;
    this.autoPinBusy = false;

    if (!this.settings.autoPinEnabled) return;

    // Faz um ciclo logo ao ativar.
    this.refreshProductCycle("startup");

    // Repete apenas a cada 20 segundos.
    // Não monitora overlay para não ficar clicando continuamente.
    this.autoPinTimer = setInterval(() => {
      this.refreshProductCycle("scheduled-20s");
    }, 20000);
  },

  async refreshProductCycle(reason = "manual") {
    if (this.autoPinBusy) return {
      ok: false,
      skipped: true,
      error: "O ciclo anterior ainda está em execução."
    };

    this.autoPinBusy = true;

    try {
      const result = await OrionDetector.refreshPinnedProduct(
        this.settings.skipCoupons !== false
      );

      chrome.runtime.sendMessage({
        type: "ORION_AUTOMATION_EVENT",
        payload: {
          kind: result.ok ? "product-refreshed" : "product-refresh-failed",
          result,
          createdAt: new Date().toISOString()
        }
      }).catch(() => {});

      return result;
    } catch (error) {
      const result = {
        ok: false,
        error: error?.message || "Erro inesperado no ciclo de fixação."
      };

      chrome.runtime.sendMessage({
        type: "ORION_AUTOMATION_EVENT",
        payload: {
          kind: "product-refresh-failed",
          result,
          createdAt: new Date().toISOString()
        }
      }).catch(() => {});

      return result;
    } finally {
      this.autoPinBusy = false;
    }
  },

  async pinProduct() {
    return this.refreshProductCycle();
  },



  configureExactEndTimer() {
    clearTimeout(this.exactEndTimer);
    this.exactEndTimer = null;

    if (this.settings.endTimerPaused) return;

    const endTimerAt = Number(this.settings.endTimerAt || 0);
    if (!endTimerAt) return;

    const delay = Math.max(0, endTimerAt - Date.now());

    this.exactEndTimer = setTimeout(() => {
      this.handleEndTimer({
        force: true,
        reason: "timer-zero"
      }).catch(console.error);
    }, delay);
  },

  startEmergencyEndLoop(reason = "timer-zero") {
    clearTimeout(this.endLiveEmergencyTimer);
    this.endLiveEmergencyTimer = null;

    let attempts = 0;
    const maxAttempts = 30;

    const attemptEnd = async () => {
      attempts += 1;

      const result = await OrionDetector.endLive({
        dryRun: false,
        reason
      });

      chrome.runtime.sendMessage({
        type: "ORION_AUTOMATION_EVENT",
        payload: {
          kind: result.ok
            ? "live-end-confirmed"
            : "live-end-retry",
          reason,
          attempts,
          result,
          createdAt: new Date().toISOString()
        }
      }).catch(() => {});

      if (result.ok) {
        await this.finishEndTimerSuccess(
          reason,
          result
        );
        return;
      }

      if (attempts >= maxAttempts) {
        await this.finishEndTimerFailure(
          reason,
          result
        );
        return;
      }

      this.endLiveEmergencyTimer = setTimeout(
        () => attemptEnd().catch(console.error),
        500
      );
    };

    attemptEnd().catch(console.error);
  },

  async finishEndTimerSuccess(reason, result) {
    clearTimeout(this.endLiveEmergencyTimer);
    clearTimeout(this.exactEndTimer);

    this.endLiveEmergencyTimer = null;
    this.exactEndTimer = null;

    this.settings.endTimerAt = null;
    this.settings.endTimerPaused = false;
    this.settings.endTimerRemainingMs = null;
    this.settings.endTimerStartedAt = null;

    await chrome.storage.local.set({
      [ORION.STORAGE.SETTINGS]: this.settings
    });

    chrome.runtime.sendMessage({
      type: "ORION_NOTIFY",
      payload: {
        title: "LIVE encerrada",
        message:
          reason === "timer-zero"
            ? "O timer zerou e o encerramento foi confirmado."
            : "A transmissão foi encerrada após um aviso."
      }
    }).catch(() => {});

    const stored = await chrome.storage.local.get([
      ORION.STORAGE.SETTINGS
    ]);

    const settings = {
      ...ORION.DEFAULTS,
      ...(stored[ORION.STORAGE.SETTINGS] || {})
    };

    if (
      settings.telegramEnabled &&
      settings.telegramToken &&
      settings.telegramChatId
    ) {
      chrome.runtime.sendMessage({
        type: "ORION_TELEGRAM_SEND",
        payload: {
          text:
            reason === "timer-zero"
              ? "⏱️ O timer zerou e a LIVE foi encerrada com confirmação."
              : "🚨 A LIVE foi encerrada automaticamente após um aviso."
        }
      }).catch(() => {});
    }

    this.endTimerBusy = false;
  },

  async finishEndTimerFailure(reason, result) {
    clearTimeout(this.endLiveEmergencyTimer);
    this.endLiveEmergencyTimer = null;

    chrome.runtime.sendMessage({
      type: "ORION_NOTIFY",
      payload: {
        title: "Falha crítica ao encerrar a LIVE",
        message:
          result?.error ||
          "O botão de confirmação não foi localizado após várias tentativas."
      }
    }).catch(() => {});

    this.endTimerBusy = false;
  },

  async handleEndTimer({
    force = false,
    reason = "timer-zero"
  } = {}) {
    const endTimerAt = Number(this.settings.endTimerAt || 0);

    if (this.settings.endTimerPaused) return;
    if (!endTimerAt) return;
    if (!force && Date.now() < endTimerAt) return;
    if (this.endTimerBusy) return;
    if (this.completedEndTimerAt === endTimerAt) return;

    this.endTimerBusy = true;
    this.completedEndTimerAt = endTimerAt;

    clearTimeout(this.commentTimer);
    clearInterval(this.autoPinTimer);

    this.commentTimer = null;
    this.autoPinTimer = null;
    this.autoPinBusy = false;

    // Não considera encerrado até clicar no botão de confirmação.
    this.startEmergencyEndLoop(reason);
  },

  async handleLiveTransition() {
    const isLive = Boolean(OrionDetector.state.live);

    if (isLive && !this.previousLiveState) {
      this.settings.protectionEnabled = true;

      await chrome.storage.local.set({
        [ORION.STORAGE.SETTINGS]: this.settings
      });

      chrome.runtime.sendMessage({
        type: "ORION_AUTOMATION_EVENT",
        payload: {
          kind: "protection-auto-enabled",
          createdAt: new Date().toISOString()
        }
      }).catch(() => {});

      if (
        this.settings.telegramEnabled &&
        this.settings.telegramToken &&
        this.settings.telegramChatId
      ) {
        chrome.runtime.sendMessage({
          type: "ORION_TELEGRAM_SEND",
          payload: {
            text: "🛡️ A LIVE foi iniciada e a proteção contra violação foi ativada automaticamente."
          }
        }).catch(() => {});
      }
    }

    this.previousLiveState = isLive;
  },


  normalizeSaleFingerprint(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  },

  saleFingerprint(sale) {
    const buyer = this.normalizeSaleFingerprint(sale?.buyerName);
    const text = this.normalizeSaleFingerprint(sale?.text)
      .replace(/\b(há|a)\s+\d+\s+(segundos?|minutos?)\b/g, "")
      .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, "")
      .trim();

    const product = this.normalizeSaleFingerprint(
      sale?.productName || sale?.product || ""
    );

    return [buyer, product, text].filter(Boolean).join("|");
  },

  async handleSales() {
    const currentCount=Math.max(0,Math.floor(Number(OrionDetector.state.sales)||0));

    if(this.lastKnownSalesCount===0){
      this.lastKnownSalesCount=currentCount;
      return;
    }

    if(currentCount<=this.lastKnownSalesCount)return;

    this.lastKnownSalesCount=currentCount;
    this.pendingSalesCount=currentCount;

    if (
      this.settings.telegramEnabled &&
      this.settings.telegramToken &&
      this.settings.telegramChatId
    ) {
      chrome.runtime.sendMessage({
        type: "ORION_TELEGRAM_SEND",
        payload: {
          text:
            `🛒 Nova venda detectada\n` +
            `Total de vendas na LIVE: ${currentCount}\n` +
            `GMV atual: R$ ${Number(OrionDetector.state.gmv || 0)
              .toFixed(2)
              .replace(".", ",")}`
        }
      }).catch(() => {});
    }

    if(!this.settings.postSaleEnabled)return;

    clearTimeout(this.postSaleTimer);

    const configuredDelay=Math.floor(Number(this.settings.postSaleDelaySeconds));
    const delaySeconds=Number.isFinite(configuredDelay)&&configuredDelay>=5?configuredDelay:10;

    this.postSaleTimer=setTimeout(async()=>{
      const salesCount=this.pendingSalesCount;
      const templates=Array.isArray(this.settings.postSaleMessages)
        ?this.settings.postSaleMessages.map(value=>String(value||"").trim()).filter(Boolean)
        :[];

      if(!templates.length){
        templates.push(String(this.settings.postSaleMessage||
          "Parabéns pela compra! {salesCount} pessoas já finalizaram a compra nessa live.").trim());
      }

      const template=templates[this.postSaleMessageIndex%templates.length];
      this.postSaleMessageIndex=(this.postSaleMessageIndex+1)%templates.length;

      const message=template
        .replace(/\{salesCount\}/gi,String(salesCount))
        .replace(/\{vendas\}/gi,String(salesCount))
        .replace(/\{nome\}/gi,"")
        .replace(/\s{2,}/g," ")
        .trim();

      const result=message
        ?await OrionDetector.sendChat(message)
        :{ok:false,error:"Mensagem pós-venda vazia."};

      chrome.runtime.sendMessage({
        type:"ORION_AUTOMATION_EVENT",
        payload:{
          kind:result.ok?"post-sale-social-proof-sent":"post-sale-social-proof-failed",
          salesCount,message,result,createdAt:new Date().toISOString()
        }
      }).catch(()=>{});
    },delaySeconds*1000);
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message || {};

  if (type === "ORION_FORCE_SCAN") {
    OrionDetector.scan();
    sendResponse({ ok: true });
    return;
  }

  if (type === "ORION_SEND_CHAT") {
    OrionDetector.sendChat(payload?.text || "")
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (type === "ORION_PIN_PRODUCT") {
    OrionDetector.refreshPinnedProduct(payload?.skipCoupons !== false)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (type === "ORION_UNPIN_PRODUCT") {
    const result = OrionDetector.clickButton(/desafixar/i);
    sendResponse(result);
    return;
  }

  if (type === "ORION_END_LIVE") {
    OrionDetector.endLive({ dryRun: Boolean(payload?.dryRun) })
      .then((result) => {
        chrome.runtime.sendMessage({
          type: "ORION_PROTECTION_EVENT",
          payload: { kind: "manual-end-result", result }
        }).catch(() => {});

        sendResponse(result);
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (type === "ORION_TEST_PROTECTION") {
    OrionDetector.runProtectionTest()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }
});

OrionContentAutomation.init().catch(console.error);
