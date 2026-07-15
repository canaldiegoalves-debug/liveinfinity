OrionDetector.start();

const OrionContentAutomation = {
  settings: { ...ORION.DEFAULTS },
  commentTimer: null,
  commentIndex: 0,
  autoPinTimer: null,
  autoPinBusy: false,
  seenSales: new Set(),
  previousLiveState: false,
  endTimerBusy: false,
  completedEndTimerAt: null,

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

    // O primeiro comentário também respeita o intervalo definido no painel.
    this.commentIndex = 0;
    this.scheduleNextComment();
  },

  scheduleNextComment() {
    clearTimeout(this.commentTimer);

    if (!this.settings.commentsEnabled) return;

    const comments = (this.settings.comments || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (!comments.length) return;

    const configuredMinimum = Number(this.settings.minCommentDelay);
    const configuredMaximum = Number(this.settings.maxCommentDelay);
    const minimum = Math.max(
      5,
      Number.isFinite(configuredMinimum) ? Math.floor(configuredMinimum) : 45
    );
    const maximum = Math.max(
      minimum,
      Number.isFinite(configuredMaximum) ? Math.floor(configuredMaximum) : 90
    );
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


  async handleEndTimer() {
    const endTimerAt = Number(this.settings.endTimerAt || 0);

    if (!endTimerAt) return;
    if (Date.now() < endTimerAt) return;
    if (this.endTimerBusy) return;
    if (this.completedEndTimerAt === endTimerAt) return;

    this.endTimerBusy = true;
    this.completedEndTimerAt = endTimerAt;

    try {
      // Para as automações antes de encerrar a transmissão.
      clearTimeout(this.commentTimer);
      clearInterval(this.autoPinTimer);
      this.commentTimer = null;
      this.autoPinTimer = null;
      this.autoPinBusy = false;

      const result = await OrionDetector.endLive({ dryRun: false });

      this.settings.endTimerAt = null;

      await chrome.storage.local.set({
        [ORION.STORAGE.SETTINGS]: this.settings
      });

      chrome.runtime.sendMessage({
        type: "ORION_AUTOMATION_EVENT",
        payload: {
          kind: result.ok ? "timer-live-ended" : "timer-live-end-failed",
          result,
          scheduledAt: endTimerAt,
          createdAt: new Date().toISOString()
        }
      }).catch(() => {});

      chrome.runtime.sendMessage({
        type: "ORION_NOTIFY",
        payload: {
          title: result.ok
            ? "LIVE encerrada"
            : "Falha ao encerrar a LIVE",
          message: result.ok
            ? "O tempo programado terminou e a transmissão foi encerrada."
            : result.error
        }
      }).catch(() => {});
    } catch (error) {
      this.settings.endTimerAt = null;

      await chrome.storage.local.set({
        [ORION.STORAGE.SETTINGS]: this.settings
      });

      chrome.runtime.sendMessage({
        type: "ORION_NOTIFY",
        payload: {
          title: "Falha ao encerrar a LIVE",
          message: error?.message || "Erro inesperado no encerramento automático."
        }
      }).catch(() => {});
    } finally {
      this.endTimerBusy = false;
    }
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
        const extractedName =
          String(sale.buyerName || "").trim() ||
          sale.text.match(
            /^(.+?)\s+(?:comprou|acabou de comprar|finalizou a compra|realizou um pedido)/i
          )?.[1]?.trim() ||
          "";

        const name = /^(cliente|cliente\s*\d+|comprador|usuário|usuario|user)$/i.test(
          extractedName
        )
          ? ""
          : extractedName;

        const messageTemplate = String(this.settings.postSaleMessage || "");
        const message = name
          ? messageTemplate.replace(/\{nome\}/gi, name)
          : messageTemplate
              .replace(/(?:Olá|Oi|Parabéns|Obrigado|Obrigada)[, ]*\{nome\}[!,. ]*/gi, "")
              .replace(/\{nome\}/gi, "")
              .replace(/\s{2,}/g, " ")
              .trim();

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
