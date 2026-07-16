const DEFAULTS = {
  commentsEnabled: false,
  comments: [],
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
  endTimerMinutes: 240,
  endTimerAt: null,
  endTimerPaused: false,
  endTimerRemainingMs: null,
  endTimerStartedAt: null
};

chrome.runtime.onInstalled.addListener(async () => {
  const { orionSettings } = await chrome.storage.local.get(["orionSettings"]);
  if (!orionSettings) await chrome.storage.local.set({ orionSettings: DEFAULTS });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ORION_TELEGRAM_SEND") {
    const { token, chatId, text } = message.payload || {};
    const cleanToken=String(token||"").trim();
    const cleanChatId=String(chatId||"").trim();
    const cleanText=String(text||"").trim();

    if (!cleanToken || !cleanChatId || !cleanText) {
      sendResponse({ ok: false, error: "Configuração incompleta." });
      return;
    }

    if (!/^\d+:[A-Za-z0-9_-]+$/.test(cleanToken)) {
      sendResponse({ ok: false, error: "Token do Bot inválido." });
      return;
    }
    fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cleanChatId, text: cleanText })
    }).then(async r => {
      const body = await r.json().catch(() => ({}));
      sendResponse({ ok: r.ok, body, error: r.ok ? null : (body.description || "Falha no Telegram.") });
    }).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "ORION_NOTIFY") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "assets/icon128.png",
      title: message.payload?.title || "Live Infinity",
      message: message.payload?.message || "Novo evento."
    }).catch(() => {});
    sendResponse({ ok: true });
  }
});
