(() => {
  "use strict";

  const STORAGE_KEY = "orionSettings";

  let settings = {};
  let commentsTimeout = null;
  let commentList = [];
  let commentIndex = 0;
  let intervalMin = 45;
  let intervalMax = 90;

  let autoFixTimeout = null;
  let timerTimeout = null;
  let timerWatchdog = null;
  let armedTimerEndAt = 0;
  let timerEndTriggered = false;
  let warningLock = false;
  let sessionArmed = true;
  let pageLoadedAt = Date.now();

  function random(min, max) {
    return Math.floor(
      Math.random() * (max - min + 1)
    ) + min;
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  }

  function textOf(element) {
    return String(
      element?.textContent ||
      element?.innerText ||
      element?.getAttribute?.("aria-label") ||
      ""
    ).trim().toLowerCase();
  }

  function isCoupon(element) {
    const container =
      element?.closest?.(
        "tr,li,[class*='product'],[class*='item'],[class*='card']"
      ) || element;

    const text = textOf(container);

    return /cupom|coupon|voucher|desconto|discount|oferta relâmpago/.test(
      text
    );
  }

  // ================================================================
  // COMENTÁRIOS — fluxo do LiveFlow
  // ================================================================

  function sendComment(text) {
    try {
      const textarea =
        document.querySelector(
          'textarea[placeholder*="algo"]'
        ) ||
        document.querySelector(
          'textarea[placeholder*="comment"]'
        ) ||
        document.querySelector(
          'textarea[placeholder*="Comment"]'
        ) ||
        document.querySelector(
          'textarea[placeholder*="Digite"]'
        ) ||
        document.querySelector(
          ".chat-input textarea"
        ) ||
        document.querySelector(
          '[class*="chat"] textarea'
        ) ||
        document.querySelector(
          '[class*="input"] textarea'
        ) ||
        document.querySelector(
          "textarea.arco-textarea"
        ) ||
        document.querySelector("textarea");

      if (!textarea) {
        return {
          ok: false,
          msg: "Campo de comentário não encontrado."
        };
      }

      textarea.focus();
      textarea.click();

      const nativeSetter =
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value"
        ).set;

      nativeSetter.call(textarea, text);

      textarea.dispatchEvent(
        new Event("input", { bubbles: true })
      );

      textarea.dispatchEvent(
        new Event("change", { bubbles: true })
      );

      textarea.dispatchEvent(
        new CompositionEvent(
          "compositionstart",
          { bubbles: true }
        )
      );

      textarea.dispatchEvent(
        new CompositionEvent(
          "compositionend",
          {
            data: text,
            bubbles: true
          }
        )
      );

      setTimeout(() => {
        textarea.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Enter",
            keyCode: 13,
            bubbles: true,
            cancelable: true
          })
        );

        textarea.dispatchEvent(
          new KeyboardEvent("keypress", {
            key: "Enter",
            keyCode: 13,
            bubbles: true,
            cancelable: true
          })
        );

        textarea.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: "Enter",
            keyCode: 13,
            bubbles: true
          })
        );
      }, 300);

      return {
        ok: true,
        msg: "Comentário enviado: " + text
      };
    } catch (error) {
      return {
        ok: false,
        msg: "Erro: " + error.message
      };
    }
  }

  function scheduleNextComment() {
    if (!commentList.length) return;

    const delay = random(
      intervalMin,
      intervalMax
    );

    commentsTimeout = setTimeout(() => {
      sendComment(
        commentList[
          commentIndex % commentList.length
        ]
      );

      commentIndex += 1;
      scheduleNextComment();
    }, delay * 1000);
  }

  function startComments(
    messages,
    minimum,
    maximum
  ) {
    stopComments();

    commentList = messages;
    commentIndex = 0;
    intervalMin = minimum;
    intervalMax = maximum;

    if (!messages || !messages.length) {
      return;
    }

    sendComment(commentList[0]);
    commentIndex = 1;
    scheduleNextComment();
  }

  function stopComments() {
    if (commentsTimeout) {
      clearTimeout(commentsTimeout);
      commentsTimeout = null;
    }

    commentList = [];
  }

  // ================================================================
  // FIXAÇÃO — fluxo do LiveFlow
  // ================================================================

  function allButtons() {
    const selector =
      'button,[role="button"],[class*="btn"],[class*="Btn"]';

    return [
      ...document.querySelectorAll(selector)
    ].filter(visible);
  }

  function stopAutoFix() {
    clearTimeout(autoFixTimeout);
    autoFixTimeout = null;
  }

  function runAutoFixCycle() {
    if (autoFixTimeout === null) return;

    chrome.storage.local.get(
      STORAGE_KEY,
      data => {
        const current =
          data[STORAGE_KEY] || {};

        if (!current.autoPinEnabled) {
          stopAutoFix();
          return;
        }

        const buttons = allButtons();

        const unpinButton = buttons.find(
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

        const findPin = list =>
          list.find(button => {
            const text = textOf(button);

            const pin =
              text === "fixar" ||
              text === "pin" ||
              text === "fix" ||
              text.includes("fixar");

            return pin && !isCoupon(button);
          });

        if (unpinButton && !isCoupon(unpinButton)) {
          unpinButton.click();

          setTimeout(() => {
            const pinButton =
              findPin(allButtons());

            if (pinButton) {
              pinButton.click();
            }
          }, random(1500, 4000));
        } else {
          const pinButton = findPin(buttons);

          if (pinButton) {
            pinButton.click();
          }
        }

        autoFixTimeout = setTimeout(
          runAutoFixCycle,
          random(18000, 30000)
        );
      }
    );
  }

  function startAutoFix() {
    stopAutoFix();

    chrome.storage.local.get(
      STORAGE_KEY,
      data => {
        const current =
          data[STORAGE_KEY] || {};

        if (!current.autoPinEnabled) return;

        autoFixTimeout = setTimeout(
          runAutoFixCycle,
          random(5000, 8000)
        );
      }
    );
  }

  function manualPin() {
    const buttons = allButtons();

    const unpinButton = buttons.find(
      button =>
        /desafixar|desfixar|unpin/.test(
          textOf(button)
        ) &&
        !isCoupon(button)
    );

    if (unpinButton) {
      unpinButton.click();

      setTimeout(() => {
        const pinButton = allButtons().find(
          button =>
            (
              /^fixar$|^pin$|^fix$/.test(
                textOf(button)
              ) ||
              textOf(button).includes("fixar")
            ) &&
            !isCoupon(button)
        );

        pinButton?.click();
      }, random(1500, 3000));

      return;
    }

    const pinButton = buttons.find(
      button =>
        (
          /^fixar$|^pin$|^fix$/.test(
            textOf(button)
          ) ||
          textOf(button).includes("fixar")
        ) &&
        !isCoupon(button)
    );

    pinButton?.click();
  }

  // ================================================================
  // ENCERRAMENTO — função do LiveFlow
  // ================================================================

  function endLive() {
    const svgElement =
      document.querySelector(
        ".arco-icon-im_close_chat"
      );

    if (svgElement) {
      let element = svgElement;

      for (let index = 0; index < 5; index += 1) {
        element = element.parentElement;

        if (!element) break;

        const tag =
          element.tagName.toLowerCase();

        const className =
          element.className || "";

        if (
          tag === "button" ||
          element.getAttribute("role") === "button" ||
          className.includes("btn") ||
          className.includes("button") ||
          className.includes("icon-btn")
        ) {
          element.click();

          setTimeout(() => {
            const confirmButton = [
              ...document.querySelectorAll(
                "button"
              )
            ].find(button =>
              /encerrar agora|confirmar|end now|sim/i.test(
                button.textContent.trim()
              )
            );

            confirmButton?.click();
          }, 1500);

          return true;
        }
      }

      svgElement.parentElement?.click();

      setTimeout(() => {
        const confirmButton = [
          ...document.querySelectorAll(
            "button"
          )
        ].find(button =>
          /encerrar agora|confirmar|end now/i.test(
            button.textContent.trim()
          )
        );

        confirmButton?.click();
      }, 1500);

      return true;
    }

    const closeElement =
      document.querySelector(
        '[class*="close_chat"],[class*="im_close"]'
      );

    if (closeElement) {
      (
        closeElement.closest("button") ||
        closeElement.parentElement
      )?.click();

      setTimeout(() => {
        const confirmButton = [
          ...document.querySelectorAll(
            "button"
          )
        ].find(button =>
          /encerrar agora|confirmar/i.test(
            button.textContent.trim()
          )
        );

        confirmButton?.click();
      }, 1500);

      return true;
    }

    const endButton = [
      ...document.querySelectorAll("button")
    ].find(button =>
      /encerrar|end live/i.test(
        button.textContent.trim()
      )
    );

    if (endButton) {
      endButton.click();

      setTimeout(() => {
        const confirmButton = [
          ...document.querySelectorAll(
            "button"
          )
        ].find(button =>
          /confirmar|sim|encerrar agora/i.test(
            button.textContent.trim()
          )
        );

        confirmButton?.click();
      }, 1500);

      return true;
    }

    return false;
  }

  // ================================================================
  // TIMER — única origem autorizada
  // ================================================================

  function configureTimer() {
    // Cronômetro controlado exclusivamente pelo background,
    // igual ao fluxo funcional do LiveFlow.
  }

  function applySettings(nextSettings) {
    settings = nextSettings || {};

    const comments = Array.isArray(
      settings.comments
    )
      ? settings.comments
          .map(value =>
            String(value || "").trim()
          )
          .filter(Boolean)
      : [];

    if (
      settings.commentsEnabled &&
      comments.length
    ) {
      startComments(
        comments,
        Math.max(
          1,
          Number(
            settings.minCommentDelay || 45
          )
        ),
        Math.max(
          1,
          Number(
            settings.maxCommentDelay || 90
          )
        )
      );
    } else {
      stopComments();
    }

    if (settings.autoPinEnabled) {
      startAutoFix();
    } else {
      stopAutoFix();
    }

    configureTimer();
  }

  chrome.storage.local.get(
    STORAGE_KEY,
    data => {
      pageLoadedAt = Date.now();

      const initialSettings =
        data[STORAGE_KEY] || {};

      const initialEndAt = Number(
        initialSettings.endTimerAt || 0
      );

      sessionArmed =
        initialEndAt > Date.now() &&
        !initialSettings.endTimerPaused;

      applySettings(initialSettings);
    }
  );

  chrome.storage.onChanged.addListener(
    (changes, area) => {
      if (
        area !== "local" ||
        !changes[STORAGE_KEY]
      ) {
        return;
      }

      const nextSettings =
        changes[STORAGE_KEY].newValue || {};

      const nextEndAt = Number(
        nextSettings.endTimerAt || 0
      );

      if (
        nextEndAt > Date.now() &&
        !nextSettings.endTimerPaused
      ) {
        sessionArmed = true;
      }

      applySettings(nextSettings);
    }
  );

  // "Iniciar sessão" nunca inicia ou encerra a LIVE.
  window.addEventListener(
    "LIVE_INFINITY_SESSION_START",
    () => {
      chrome.storage.local.get(
        STORAGE_KEY,
        data => {
          applySettings(
            data[STORAGE_KEY] || {}
          );
        }
      );
    }
  );

  window.addEventListener(
    "LIVE_INFINITY_MANUAL_PIN",
    manualPin
  );

  window.addEventListener(
    "LIVE_INFINITY_END_REQUEST",
    event => {
      if (!sessionArmed) return;

      const reason =
        event.detail?.reason || "";

      // Timer é tratado exclusivamente pelo background.

      // Aviso é tratado exclusivamente pelo evento
      // LIVE_INFINITY_CRITICAL_WARNING abaixo.
    }
  );

  window.addEventListener(
    "LIVE_INFINITY_CRITICAL_WARNING",
    event => {
      if (
        !sessionArmed ||
        !settings.protectionEnabled ||
        warningLock
      ) {
        return;
      }

      const warningText = String(
        event.detail?.text || ""
      ).toLowerCase();

      // Somente avisos realmente críticos podem encerrar.
      const criticalWarning =
        /violação|violacao|violation|penalidade|penalty|suspensão|suspensao|suspension|banimento|banned|banido|diretrizes da comunidade|community guidelines|risco à transmissão|risco a transmissao|transmission risk/.test(
          warningText
        );

      if (!criticalWarning) return;

      // Ignora qualquer alerta durante os primeiros 30 segundos.
      if (Date.now() - pageLoadedAt < 30000) {
        return;
      }

      warningLock = true;
      endLive();

      setTimeout(() => {
        warningLock = false;
      }, 10000);
    }
  );

  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
      try {
        if (message?.action === "encerrarLive") {
          endLive();
          sendResponse?.({ ok: true });
          return true;
        }

        if (message?.action === "timerZerou") {
          sendResponse?.({ ok: true });
          return true;
        }
      } catch (error) {
        sendResponse?.({
          ok: false,
          error: error?.message || "Falha ao encerrar a LIVE."
        });
      }

      return true;
    }
  );

})();
