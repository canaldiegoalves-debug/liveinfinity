OrionDetector.start();

const OrionContentAutomation = {
  settings: { ...ORION.DEFAULTS },
  commentTimer: null,
  commentIndex: 0,
  autoPinTimer: null,
  autoPinBusy: false,
  seenSales: new Set(),
  previousLiveState: false,

  async init() {
    await this.loadSettings();
    this.applySettings();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (!changes[ORION.STORAGE.SETTINGS]) return;

      this.settings = {
        ...ORION.DEFAULTS,
        ...(changes[ORION.STORAGE.SETTINGS].newValue || {})
      };

      this.applySettings();
    });

    setInterval(() => {
      this.handleLiveTransition();
      this.handleSales();
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

    this.sendFirstCommentAndSchedule();
  },

  async sendFirstCommentAndSchedule() {
    const comments = (this.settings.comments || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (!comments.length || !this.settings.commentsEnabled) return;

    const firstMessage = comments[0];
    const result = await OrionDetector.sendChat(firstMessage);

    chrome.runtime.sendMessage({
      type: "ORION_AUTOMATION_EVENT",
      payload: {
        kind: result.ok ? "comment-sent" : "comment-failed",
        message: firstMessage,
        delaySeconds: 0,
        result,
        createdAt: new Date().toISOString()
      }
    }).catch(() => {});

    this.commentIndex = 1;
    this.scheduleNextComment();
  },

  scheduleNextComment() {
    clearTimeout(this.commentTimer);

    if (!this.settings.commentsEnabled) return;

    const comments = (this.settings.comments || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (!comments.length) return;

    const minimum = Math.max(5, Number(this.settings.minCommentDelay) || 45);
    const maximum = Math.max(minimum, Number(this.settings.maxCommentDelay) || 90);
    const seconds =
      Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;

    this.commentTimer = setTimeout(async () => {
      const message = comments[this.commentIndex % comments.length];
      let result = await OrionDetector.sendChat(message);

      if (!result.ok) {
        await OrionDetector.wait(900);
        result = await OrionDetector.sendChat(message);
      }

      chrome.runtime.sendMessage({
        type: "ORION_AUTOMATION_EVENT",
        payload: {
          kind: result.ok ? "comment-sent" : "comment-failed",
          message,
          delaySeconds: seconds,
          result,
          createdAt: new Date().toISOString()
        }
      }).catch(() => {});

      this.commentIndex += 1;
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
            token: this.settings.telegramToken,
            chatId: this.settings.telegramChatId,
            text: "🛡️ A LIVE foi iniciada e a proteção contra violação foi ativada automaticamente."
          }
        }).catch(() => {});
      }
    }

    this.previousLiveState = isLive;
  },

  async handleSales() {
    for (const sale of OrionDetector.state.saleEvents || []) {
      if (this.seenSales.has(sale.id)) continue;
      this.seenSales.add(sale.id);

      if (this.settings.postSaleEnabled) {
        const name =
          sale.text.match(/^(.+?)\s+(?:comprou|acabou)/i)?.[1]?.trim() ||
          "cliente";

        const message = String(this.settings.postSaleMessage || "")
          .replace(/\{nome\}/gi, name);

        if (message.trim()) {
          await OrionDetector.sendChat(message);
        }
      }

      if (
        this.settings.telegramEnabled &&
        this.settings.telegramToken &&
        this.settings.telegramChatId
      ) {
        chrome.runtime.sendMessage({
          type: "ORION_TELEGRAM_SEND",
          payload: {
            token: this.settings.telegramToken,
            chatId: this.settings.telegramChatId,
            text: `🛒 Nova venda\n${sale.text}`
          }
        }).catch(() => {});
      }
    }
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
