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
    postSaleMessage: "Obrigado pela compra, {nome}! 🎉",
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
    endTimerMinutes: 240
  }
};
