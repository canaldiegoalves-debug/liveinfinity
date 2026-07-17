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



function telegramTime() {
  return new Date().toLocaleTimeString(
    "pt-BR"
  );
}

async function telegramSettings() {
  const stored =
    await chrome.storage.local.get([
      "orionSettings"
    ]);

  return {
    ...DEFAULTS,
    ...(stored.orionSettings || {})
  };
}

async function sendTelegramMessage(
  text,
  parseMode = null
) {
  const settings =
    await telegramSettings();

  const token =
    String(
      settings.telegramToken || ""
    ).trim();

  const chatId =
    String(
      settings.telegramChatId || ""
    ).trim();

  if (
    !settings.telegramEnabled ||
    !token ||
    !chatId
  ) {
    return {
      ok:false,
      skipped:true,
      error:
        "Telegram ainda não configurado."
    };
  }

  const payload = {
    chat_id:chatId,
    text:String(text || "")
  };

  if (parseMode) {
    payload.parse_mode = parseMode;
  }

  try {
    const response = await fetch(
      "https://api.telegram.org/bot" +
      token +
      "/sendMessage",
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify(payload)
      }
    );

    const body =
      await response
        .json()
        .catch(() => ({}));

    if (
      !response.ok ||
      body?.ok === false
    ) {
      return {
        ok:false,
        status:response.status,
        error:
          body?.description ||
          "Telegram retornou erro."
      };
    }

    return {
      ok:true,
      result:body.result || null
    };
  } catch (error) {
    return {
      ok:false,
      error:
        error?.message ||
        "Falha de conexão com o Telegram."
    };
  }
}

async function notifyTelegramSale(data = {}) {
  const settings =
    await telegramSettings();

  if (
    settings.telegramSalesEnabled === false
  ) {
    return {
      ok:false,
      skipped:true
    };
  }

  const viewers =
    data.viewers ?? "—";

  const sales =
    data.sales ?? "—";

  const saleValue =
    data.saleValue || "—";

  const gmv =
    data.gmv || "—";

  const message =
    "🔴 *NOVA VENDA — " +
    saleValue +
    "*\n" +
    "━━━━━━━━━━━━━━━\n" +
    "📦 Total de vendas: " +
    sales +
    " itens\n" +
    "💰 GMV total: " +
    gmv +
    "\n" +
    "👀 Ao vivo: " +
    viewers +
    " espectadores\n" +
    "🕐 Horário: " +
    telegramTime() +
    "\n" +
    "━━━━━━━━━━━━━━━\n" +
    "Live Infinity • TikTok Shop";

  return sendTelegramMessage(
    message,
    "Markdown"
  );
}

async function notifyTelegramStart() {
  const settings =
    await telegramSettings();

  if (
    settings.telegramStatusEnabled === false
  ) {
    return {
      ok:false,
      skipped:true
    };
  }

  const message =
    "LIVE INICIADA\n\n" +
    "Horário: " +
    telegramTime() +
    "\n\n" +
    "Live Infinity - TikTok Shop";

  return sendTelegramMessage(message);
}

async function notifyTelegramEnd(data = {}) {
  const settings =
    await telegramSettings();

  if (
    settings.telegramStatusEnabled === false
  ) {
    return {
      ok:false,
      skipped:true
    };
  }

  const message =
    "LIVE ENCERRADA\n\n" +
    "Total vendas: " +
    (data.sales ?? "—") +
    " itens\n" +
    "GMV: " +
    (data.gmv || "—") +
    "\n" +
    "Horário: " +
    telegramTime() +
    "\n\n" +
    "Live Infinity - TikTok Shop";

  return sendTelegramMessage(message);
}

async function notifyTelegramViolation(
  data = {}
) {
  const settings =
    await telegramSettings();

  if (
    settings.telegramViolationEnabled === false
  ) {
    return {
      ok:false,
      skipped:true
    };
  }

  const detail =
    String(
      data.text || ""
    ).trim();

  const message =
    "🔴 *VIOLAÇÃO DETECTADA!*\n" +
    "⚠️ A LIVE pode ser encerrada.\n" +
    (
      detail
        ? "📋 " +
          detail.slice(0, 350) +
          "\n"
        : ""
    ) +
    "🕐 " +
    telegramTime();

  return sendTelegramMessage(
    message,
    "Markdown"
  );
}

function sendSocialProofToTikTok(
  text,
  sendResponse
) {
  chrome.tabs.query(
    {
      url:"*://*.tiktok.com/*"
    },
    tabs => {
      const target =
        tabs?.find(tab =>
          /streamer|console|live/i.test(
            tab.url || ""
          )
        ) || tabs?.[0];

      if (!target?.id) {
        sendResponse({
          ok:false,
          error:
            "A aba da LIVE do TikTok não foi encontrada."
        });
        return;
      }

      chrome.tabs.sendMessage(
        target.id,
        {
          action:"sendSocialProof",
          text
        },
        response => {
          if (
            chrome.runtime.lastError
          ) {
            sendResponse({
              ok:false,
              error:
                chrome.runtime.lastError.message
            });
            return;
          }

          sendResponse(
            response || {
              ok:false,
              error:
                "O núcleo da LIVE não respondeu."
            }
          );
        }
      );
    }
  );
}

chrome.runtime.onMessage.addListener(
  (
    message,
    sender,
    sendResponse
  ) => {
    if (
      message?.type ===
      "ORION_SOCIAL_PROOF_SEND"
    ) {
      const text =
        String(
          message?.payload?.text || ""
        ).trim();

      if (!text) {
        sendResponse({
          ok:false,
          error:
            "Mensagem de prova social vazia."
        });
        return;
      }

      sendSocialProofToTikTok(
        text,
        sendResponse
      );

      return true;
    }

    if (
      message?.type ===
      "ORION_TELEGRAM_EVENT"
    ) {
      (async () => {
        const kind =
          String(
            message?.payload?.kind || ""
          );

        const data =
          message?.payload?.data || {};

        let result;

        if (kind === "sale") {
          result =
            await notifyTelegramSale(data);
        } else if (kind === "live-start") {
          result =
            await notifyTelegramStart();
        } else if (kind === "live-end") {
          result =
            await notifyTelegramEnd(data);
        } else if (kind === "violation") {
          result =
            await notifyTelegramViolation(
              data
            );
        } else if (kind === "test") {
          result =
            await sendTelegramMessage(
              "✅ Live Infinity conectado com sucesso!\n\n" +
              "🛒 Vendas: ativas\n" +
              "🔴 Violações: ativas\n" +
              "▶ Início/fim da LIVE: ativos"
            );
        } else {
          result = {
            ok:false,
            error:
              "Evento Telegram desconhecido."
          };
        }

        sendResponse(result);
      })();

      return true;
    }

    if (
      message?.type ===
      "ORION_NOTIFY"
    ) {
      chrome.notifications
        .create({
          type:"basic",
          iconUrl:"assets/icon128.png",
          title:
            message.payload?.title ||
            "Live Infinity",
          message:
            message.payload?.message ||
            "Novo evento."
        })
        .catch(() => {});

      sendResponse({
        ok:true
      });
    }
  }
);

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
