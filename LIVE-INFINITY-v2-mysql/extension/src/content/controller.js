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
    const data = await chrome.storage.local.get([
      ORION.STORAGE.SETTINGS
    ]);

    this.settings = {
      ...ORION.DEFAULTS,
      ...(data[ORION.STORAGE.SETTINGS] || {})
    };

    const endTimerAt = Number(
      this.settings.endTimerAt || 0
    );

    // Ao atualizar a página:
    // timer já vencido é apagado e nunca encerra a LIVE.
    if (
      endTimerAt &&
      endTimerAt <= Date.now()
    ) {
      this.settings.endTimerAt = null;
      this.settings.endTimerPaused = false;
      this.settings.endTimerRemainingMs = null;
      this.settings.endTimerStartedAt = null;

      OrionDetector.timerArmedThisPage = false;

      await chrome.storage.local.set({
        [ORION.STORAGE.SETTINGS]: this.settings
      });
    } else {
      // Um timer futuro pode continuar após o refresh,
      // mas nunca dispara durante a inicialização da página.
      OrionDetector.timerArmedThisPage =
        endTimerAt > Date.now();

      OrionDetector.pageLoadedAt = Date.now();
      OrionDetector.freshWarningAuthorizedAt = 0;
    }
  },


  applySettings() {
    this.configureComments();
    this.configureAutoPin();
  },

  configureComments() {
    clearTimeout(this.commentTimer);
    this.commentTimer = null;

    if (!this.settings.commentsEnabled) return;

    const messages = Array.isArray(
      this.settings.comments
    )
      ? this.settings.comments
          .map(value => String(value || "").trim())
          .filter(Boolean)
      : [];

    if (!messages.length) return;

    this.settings.comments = messages;
    this.commentIndex = 0;

    // Comportamento exato do LiveFlow:
    // envia o primeiro e depois agenda os próximos.
    OrionDetector.sendChat(messages[0]);
    this.commentIndex = 1;

    this.scheduleNextComment();
  },


  scheduleNextComment() {
    if (
      !this.settings.commentsEnabled ||
      !this.settings.comments ||
      !this.settings.comments.length
    ) {
      return;
    }

    const intervalMin = Number(
      this.settings.minCommentDelay || 45
    );

    const intervalMax = Number(
      this.settings.maxCommentDelay || 90
    );

    const delay =
      Math.floor(
        Math.random() *
        (intervalMax - intervalMin + 1)
      ) +
      intervalMin;

    this.commentTimer = setTimeout(() => {
      const list = this.settings.comments;

      OrionDetector.sendChat(
        list[this.commentIndex % list.length]
      );

      this.commentIndex += 1;

      this.scheduleNextComment();
    }, delay * 1000);
  },


  configureAutoPin() {
    clearTimeout(this.autoPinTimer);
    this.autoPinTimer = null;
    this.autoPinBusy = false;

    if (!this.settings.autoPinEnabled) return;

    // LiveFlow começa entre 5 e 8 segundos.
    const delay =
      Math.floor(Math.random() * 3001) + 5000;

    this.autoPinTimer = setTimeout(
      () => this.runLiveFlowAutoFix(),
      delay
    );
  },

  runLiveFlowAutoFix() {
    if (!this.settings.autoPinEnabled) {
      clearTimeout(this.autoPinTimer);
      this.autoPinTimer = null;
      return;
    }

    const visibleButtons = [
      ...document.querySelectorAll(
        'button,[role="button"],[class*="btn"],[class*="Btn"]'
      )
    ].filter(element => {
      if (!OrionDetector.isVisible(element)) {
        return false;
      }

      // Regra obrigatória do Live Infinity:
      // cupom nunca recebe clique.
      return !OrionDetector.isStrictCouponElement(
        element
      );
    });

    const textOf = element =>
      String(
        element.textContent ||
        element.innerText ||
        element.getAttribute("aria-label") ||
        ""
      ).trim().toLowerCase();

    const unpinButton = visibleButtons.find(
      button => {
        const text = textOf(button);

        return (
          text === "desafixar" ||
          text === "unpin" ||
          text === "desfixar" ||
          text.includes("desafix") ||
          text.includes("unpin")
        );
      }
    );

    const findSafePinButton = buttons =>
      buttons.find(button => {
        const text = textOf(button);

        const isPin =
          text === "fixar" ||
          text === "pin" ||
          text === "fix" ||
          text.includes("fixar");

        if (!isPin) return false;

        return (
          !OrionDetector.isStrictCouponElement(
            button
          ) &&
          OrionDetector.isAuthorizedMainProductElement(
            button
          )
        );
      });

    if (unpinButton) {
      unpinButton.click();

      const refixDelay =
        Math.floor(Math.random() * 2501) + 1500;

      setTimeout(() => {
        const buttonsAfterUnpin = [
          ...document.querySelectorAll(
            'button,[role="button"],[class*="btn"],[class*="Btn"]'
          )
        ].filter(
          element =>
            OrionDetector.isVisible(element) &&
            !OrionDetector.isStrictCouponElement(
              element
            )
        );

        const pinButton =
          findSafePinButton(buttonsAfterUnpin);

        if (pinButton) {
          pinButton.click();
        }
      }, refixDelay);
    } else {
      const pinButton =
        findSafePinButton(visibleButtons);

      if (pinButton) {
        pinButton.click();
      }
    }

    // LiveFlow repete entre 18 e 30 segundos.
    const nextDelay =
      Math.floor(Math.random() * 12001) +
      18000;

    this.autoPinTimer = setTimeout(
      () => this.runLiveFlowAutoFix(),
      nextDelay
    );
  },

  async refreshProductCycle() {
    this.runLiveFlowAutoFix();

    return {
      ok: true,
      mode: "liveflow",
      mainProductOnly: true
    };
  },

  async pinProduct() {
    return this.refreshProductCycle();
  },


  configureExactEndTimer() {
    clearTimeout(this.exactEndTimer);
    this.exactEndTimer = null;

    if (this.settings.endTimerPaused) return;

    const endTimerAt = Number(this.settings.endTimerAt || 0);

    if (!endTimerAt) {
      OrionDetector.timerArmedThisPage = false;
      return;
    }

    if (endTimerAt <= Date.now()) {
      OrionDetector.timerArmedThisPage = false;
      return;
    }

    OrionDetector.timerArmedThisPage = true;

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

      // Uma chamada sem autorização nunca deve continuar
      // tentando clicar no botão.
      if (result.blocked) {
        clearTimeout(this.endLiveEmergencyTimer);
        this.endLiveEmergencyTimer = null;
        this.endTimerBusy = false;
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
    const endTimerAt = Number(
      this.settings.endTimerAt || 0
    );

    const now = Date.now();

    // Nunca encerra ao iniciar a LIVE.
    // Para timer-zero, exige um timer válido e realmente vencido.
    if (reason === "timer-zero") {
      if (!endTimerAt) return;
      if (this.settings.endTimerPaused) return;
      if (!force && now < endTimerAt) return;
    }

    // Aviso crítico pode forçar encerramento sem depender do timer.
    if (
      reason !== "timer-zero" &&
      reason !== "warning" &&
      !force
    ) {
      return;
    }

    if (this.endTimerBusy) return;

    if (
      reason === "timer-zero" &&
      this.completedEndTimerAt === endTimerAt
    ) {
      return;
    }

    this.endTimerBusy = true;

    if (reason === "timer-zero") {
      this.completedEndTimerAt = endTimerAt;
    }

    clearTimeout(this.commentTimer);
    clearInterval(this.autoPinTimer);

    this.commentTimer = null;
    this.autoPinTimer = null;
    this.autoPinBusy = false;

    this.startEmergencyEndLoop(reason);
  },

  async handleLiveTransition() {
    // Ao detectar o início da LIVE, apenas limpa tentativas antigas.
    // Nunca aciona o encerramento.
    if (
      OrionDetector.state.liveActive &&
      !this.previousLiveActive
    ) {
      clearTimeout(this.endLiveEmergencyTimer);
      this.endLiveEmergencyTimer = null;
      this.endTimerBusy = false;
    }

    const isLive = Boolean(OrionDetector.state.live);

    if (isLive && !this.previousLiveState) {
      // Um timer vencido de uma sessão anterior nunca pode
      // encerrar uma nova LIVE.
      const storedEndTimerAt = Number(
        this.settings.endTimerAt || 0
      );

      if (
        storedEndTimerAt &&
        storedEndTimerAt <= Date.now()
      ) {
        this.settings.endTimerAt = null;
        this.settings.endTimerPaused = false;
        this.settings.endTimerRemainingMs = null;
        this.settings.endTimerStartedAt = null;
        this.completedEndTimerAt = null;
        this.endTimerBusy = false;

        clearTimeout(this.endLiveEmergencyTimer);
        clearTimeout(this.exactEndTimer);

        this.endLiveEmergencyTimer = null;
        this.exactEndTimer = null;

        await chrome.storage.local.set({
          [ORION.STORAGE.SETTINGS]: this.settings
        });
      }

      // Mantém a preferência escolhida pelo usuário.
      // A proteção nunca é ativada automaticamente.
      chrome.runtime.sendMessage({
        type: "ORION_AUTOMATION_EVENT",
        payload: {
          kind: "live-started",
          protectionEnabled: Boolean(
            this.settings.protectionEnabled
          ),
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
            text: "🔴 LIVE iniciada."
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
