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
  telegramSalesEnabled: true,
  telegramViolationEnabled: true,
  telegramStatusEnabled: true,
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


function telegramCategoryEnabled(
  settings,
  category
) {
  if (!settings.telegramEnabled) {
    return false;
  }

  if (category === "sale") {
    return settings.telegramSalesEnabled !== false;
  }

  if (category === "violation") {
    return settings.telegramViolationEnabled !== false;
  }

  if (category === "status") {
    return settings.telegramStatusEnabled !== false;
  }

  return true;
}

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

      const category = String(
        message?.payload?.category || ""
      ).trim();

      if (
        category &&
        !telegramCategoryEnabled(
          settings,
          category
        )
      ) {
        sendResponse({
          ok: false,
          skipped: true,
          error:
            "Esta categoria de notificação está desativada."
        });
        return;
      }

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

// ================================================================
// TIMER LIVEFLOW — ÚNICO DONO DO CRONÔMETRO
// ================================================================

let liveFlowTimerInterval = null;
let liveFlowTimerSeconds = 0;
let liveFlowTimerRunning = false;
let liveFlowTimerPaused = false;
let liveFlowTimerSignature = "";

function stopLiveFlowTimer() {
  clearInterval(liveFlowTimerInterval);
  liveFlowTimerInterval = null;
  liveFlowTimerRunning = false;
}

function secondsText(totalSeconds) {
  const value = Math.max(
    0,
    Number(totalSeconds || 0)
  );

  const hours = Math.floor(
    value / 3600
  );

  const minutes = Math.floor(
    (value % 3600) / 60
  );

  const seconds = value % 60;

  return [
    hours,
    minutes,
    seconds
  ]
    .map(item =>
      String(item).padStart(2, "0")
    )
    .join(":");
}

function sendLiveFlowContent(
  action,
  data = {}
) {
  chrome.tabs.query(
    {
      url: "*://*.tiktok.com/*"
    },
    tabs => {
      if (!tabs || !tabs.length) return;

      const target =
        tabs.find(tab =>
          /streamer|console|live/i.test(
            tab.url || ""
          )
        ) || tabs[0];

      chrome.tabs.sendMessage(
        target.id,
        {
          action,
          data
        },
        () => {
          void chrome.runtime.lastError;
        }
      );
    }
  );
}

function startLiveFlowTimer(
  durationSeconds,
  signature
) {
  stopLiveFlowTimer();

  liveFlowTimerSeconds = Math.max(
    0,
    Math.round(durationSeconds)
  );

  liveFlowTimerSignature =
    String(signature || "");

  liveFlowTimerRunning =
    liveFlowTimerSeconds > 0;

  liveFlowTimerPaused = false;

  if (!liveFlowTimerRunning) return;

  liveFlowTimerInterval = setInterval(
    () => {
      if (!liveFlowTimerRunning) {
        stopLiveFlowTimer();
        return;
      }

      if (liveFlowTimerPaused) return;

      liveFlowTimerSeconds -= 1;

      if (liveFlowTimerSeconds <= 0) {
        stopLiveFlowTimer();

        sendLiveFlowContent(
          "encerrarLive",
          {}
        );

        sendLiveFlowContent(
          "timerZerou",
          {}
        );

        return;
      }

      sendLiveFlowContent(
        "timerTick",
        {
          secs: liveFlowTimerSeconds,
          str: secondsText(
            liveFlowTimerSeconds
          )
        }
      );
    },
    1000
  );
}

function configureLiveFlowTimer(
  settings
) {
  const endAt = Number(
    settings.endTimerAt || 0
  );

  const paused = Boolean(
    settings.endTimerPaused
  );

  if (
    paused &&
    liveFlowTimerRunning
  ) {
    liveFlowTimerPaused = true;
    return;
  }

  if (
    !paused &&
    liveFlowTimerRunning
  ) {
    liveFlowTimerPaused = false;
  }

  if (endAt > Date.now()) {
    const signature =
      `${endAt}:${paused}`;

    if (
      signature ===
      liveFlowTimerSignature
    ) {
      return;
    }

    const durationSeconds =
      Math.max(
        1,
        Math.ceil(
          (endAt - Date.now()) / 1000
        )
      );

    startLiveFlowTimer(
      durationSeconds,
      signature
    );

    liveFlowTimerPaused = paused;
    return;
  }

  if (liveFlowTimerRunning) return;

  stopLiveFlowTimer();
}

chrome.storage.local.get(
  ["orionSettings"],
  data => {
    configureLiveFlowTimer(
      data.orionSettings || {}
    );
  }
);

chrome.storage.onChanged.addListener(
  (changes, areaName) => {
    if (
      areaName !== "local" ||
      !changes.orionSettings
    ) {
      return;
    }

    configureLiveFlowTimer(
      changes.orionSettings.newValue || {}
    );
  }
);
