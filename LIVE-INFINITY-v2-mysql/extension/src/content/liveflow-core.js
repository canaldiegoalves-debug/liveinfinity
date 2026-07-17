(() => {
  "use strict";

  const STORAGE_KEY = "orionSettings";

  function random(min, max) {
    return Math.floor(
      Math.random() * (max - min + 1)
    ) + min;
  }

  function visible(element) {
    return Boolean(
      element &&
      element.offsetParent !== null
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
        "tr,li,[class*='product'],[class*='item'],[class*='card'],[class*='coupon']"
      ) || element;

    return /cupom|coupon|voucher|desconto|discount/.test(
      textOf(container)
    );
  }

  function allButtons() {
    return [
      ...document.querySelectorAll(
        'button,[role="button"],[class*="btn"],[class*="Btn"]'
      )
    ].filter(visible);
  }

  // ================================================================
  // COMMENTS — LIVEFLOW
  // ================================================================

  let commentTimeout = null;
  let commentList = [];
  let commentIndex = 0;
  let commentIntervalMin = 30;
  let commentIntervalMax = 90;

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
          window.HTMLTextAreaElement.prototype,
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

  function stopComments() {
    clearTimeout(commentTimeout);
    commentTimeout = null;
    commentList = [];
  }

  function scheduleNextComment() {
    if (!commentList.length) return;

    const delay = random(
      commentIntervalMin,
      commentIntervalMax
    );

    commentTimeout = setTimeout(() => {
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
    intervalMin,
    intervalMax
  ) {
    stopComments();

    commentList = messages;
    commentIndex = 0;
    commentIntervalMin = intervalMin;
    commentIntervalMax = intervalMax;

    if (!commentList.length) return;

    sendComment(commentList[0]);
    commentIndex = 1;
    scheduleNextComment();
  }

  // ================================================================
  // AUTO-FIX — LIVEFLOW
  // ================================================================

  let autoFixTimeout = null;

  function stopAutoFix() {
    clearTimeout(autoFixTimeout);
    autoFixTimeout = null;
  }

  function findSafePinButton(buttons) {
    return buttons.find(button => {
      const text = textOf(button);

      const isPin =
        text === "fixar" ||
        text === "pin" ||
        text === "fix" ||
        text.includes("fixar");

      return isPin && !isCoupon(button);
    });
  }

  function executeAutoFixCycle() {
    if (autoFixTimeout === null) return;

    chrome.storage.local.get(
      STORAGE_KEY,
      data => {
        const settings =
          data[STORAGE_KEY] || {};

        if (!settings.autoPinEnabled) {
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

        if (
          unpinButton &&
          !isCoupon(unpinButton)
        ) {
          unpinButton.click();

          setTimeout(() => {
            const pinButton =
              findSafePinButton(
                allButtons()
              );

            pinButton?.click();
          }, random(1500, 4000));
        } else {
          findSafePinButton(buttons)?.click();
        }

        autoFixTimeout = setTimeout(
          executeAutoFixCycle,
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
        const settings =
          data[STORAGE_KEY] || {};

        if (!settings.autoPinEnabled) return;

        autoFixTimeout = setTimeout(
          executeAutoFixCycle,
          random(5000, 8000)
        );
      }
    );
  }

  function pinNow() {
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
        findSafePinButton(
          allButtons()
        )?.click();
      }, random(1500, 3000));

      return;
    }

    findSafePinButton(buttons)?.click();
  }

  // ================================================================
  // END LIVE — LIVEFLOW
  // ================================================================

  function endLive() {
    const svgElement =
      document.querySelector(
        ".arco-icon-im_close_chat"
      );

    if (svgElement) {
      let element = svgElement;

      for (
        let index = 0;
        index < 5;
        index += 1
      ) {
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

  function applySettings(settings) {
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
            settings.minCommentDelay || 30
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
  }

  chrome.storage.local.get(
    STORAGE_KEY,
    data => {
      applySettings(
        data[STORAGE_KEY] || {}
      );
    }
  );

  chrome.storage.onChanged.addListener(
    (changes, areaName) => {
      if (
        areaName !== "local" ||
        !changes[STORAGE_KEY]
      ) {
        return;
      }

      applySettings(
        changes[STORAGE_KEY].newValue || {}
      );
    }
  );

  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
      try {
        if (
          message?.action === "encerrarLive"
        ) {
          sendResponse?.({
            ok: endLive()
          });

          return true;
        }

        if (
          message?.action === "fixarProduto"
        ) {
          pinNow();

          sendResponse?.({
            ok: true
          });

          return true;
        }

        if (
          message?.action === "startComments"
        ) {
          startComments(
            message.messages || [],
            message.intervalMin || 30,
            message.intervalMax || 90
          );

          sendResponse?.({
            ok: true
          });

          return true;
        }

        if (
          message?.action === "stopComments"
        ) {
          stopComments();

          sendResponse?.({
            ok: true
          });

          return true;
        }
      } catch (error) {
        sendResponse?.({
          ok: false,
          error:
            error?.message ||
            "Erro no núcleo LiveFlow."
        });
      }

      return true;
    }
  );
})();
