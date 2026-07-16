window.ORION = {
  API_BASE_URL: "https://admin.valoranegocios.com.br",
  CHANNEL: "ORION_CHANNEL",
  STORAGE: {
    LICENSE: "orionLicense",
    DEVICE_ID: "orionDeviceId",
    SETTINGS: "orionSettings",
    COLLAPSE: "orionCollapse"
  },
  DEFAULTS: {
    commentsEnabled: false,
    comments: [
      "Aproveita a oferta de hoje! 🔥",
      "Clique no produto fixado para garantir o seu.",
      "Restam poucas unidades disponíveis!"
    ],
    minCommentDelay: 45,
    maxCommentDelay: 90,
    postSaleEnabled: false,
    postSaleMessage: "Parabéns pela compra! {salesCount} pessoas já finalizaram a compra nessa live. 🎉",
    postSaleMessages: [
      "Parabéns pela compra! {salesCount} pessoas já finalizaram a compra nessa live. 🎉",
      "🔥 Já são {salesCount} compras confirmadas nesta live!",
      "👏 {salesCount} pessoas já garantiram o produto. Aproveite também!"
    ],
    postSaleDelaySeconds: 10,
    telegramEnabled: false,
    telegramToken: "",
    telegramChatId: "",
    saleSoundEnabled: true,
    autoPinEnabled: false,
    skipCoupons: true,
    ambientNoiseEnabled: false,
    ambientBreathEnabled: false,
    ambientMicEnabled: false,
    ambientClicksEnabled: false,
    ambientVolume: 0.15,
    clipMinSeconds: 4,
    clipMaxSeconds: 12,
    clipPauseSeconds: 1,
    protectionEnabled: true,
    protectionAction: "end_now",
    protectionTelegram: true,
    protectionNotify: true,
    protectionCooldownSeconds: 120,
    endTimerMinutes: 240,
    endTimerAt: null,
    endTimerPaused: false,
    endTimerRemainingMs: null,
    endTimerStartedAt: null
  }
};
