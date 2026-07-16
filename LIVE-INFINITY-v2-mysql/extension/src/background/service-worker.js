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
  if (
    message?.type === "ORION_TELEGRAM_SEND" ||
    message?.type === "ORION_TELEGRAM_NOTIFY"
  ) {
    (async () => {
      const stored = await chrome.storage.local.get([
        "orionSettings"
      ]);

      const settings =
        stored.orionSettings || {};

      const token = String(
        message?.payload?.token ||
        settings.telegramToken ||
        ""
      ).trim();

      const chatId = String(
        message?.payload?.chatId ||
        settings.telegramChatId ||
        ""
      ).trim();

      const text = String(
        message?.payload?.text || ""
      ).trim();

      if (!token || !chatId || !text) {
        sendResponse({
          ok: false,
          error:
            "Token, Chat ID ou mensagem não configurados."
        });
        return;
      }

      if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
        sendResponse({
          ok: false,
          error: "Token do Bot inválido."
        });
        return;
      }

      try {
        const response = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              chat_id: chatId,
              text
            })
          }
        );

        const body = await response
          .json()
          .catch(() => ({}));

        if (!response.ok || body?.ok === false) {
          sendResponse({
            ok: false,
            status: response.status,
            error:
              body?.description ||
              (
                response.status === 401
                  ? "Token do Bot inválido."
                  : response.status === 400
                    ? "Chat ID inválido ou o bot ainda não recebeu uma mensagem."
                    : `Telegram retornou HTTP ${response.status}.`
              )
          });
          return;
        }

        sendResponse({
          ok: true,
          result: body.result || null
        });
      } catch (error) {
        sendResponse({
          ok: false,
          error:
            error?.message ||
            "Falha de conexão com o Telegram."
        });
      }
    })();

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
