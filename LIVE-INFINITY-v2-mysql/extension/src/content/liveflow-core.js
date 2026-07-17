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

  function actionContainer(element) {
    if (!element) return null;

    return (
      element.closest(
        [
          "tr",
          "li",
          "[data-row-key]",
          "[class*='product-card']",
          "[class*='productCard']",
          "[class*='product-item']",
          "[class*='productItem']",
          "[class*='goods']",
          "[class*='item-card']",
          "[class*='itemCard']",
          "[class*='coupon']",
          "[class*='voucher']"
        ].join(",")
      ) ||
      element.parentElement?.parentElement ||
      element.parentElement ||
      element
    );
  }

  function isCoupon(element) {
    const container =
      actionContainer(element);

    const text = textOf(container);

    const couponWords =
      /cupom|coupon|voucher|desconto|discount|oferta relâmpago|oferta relampago|promo code|código promocional|codigo promocional|frete grátis|frete gratis|shipping voucher/;

    const couponClass =
      /coupon|voucher|discount|promo/i.test(
        String(container?.className || "")
      );

    const couponAttribute =
      /coupon|voucher|discount|promo/i.test(
        [
          container?.getAttribute?.("data-type"),
          container?.getAttribute?.("data-testid"),
          container?.getAttribute?.("aria-label")
        ]
          .filter(Boolean)
          .join(" ")
      );

    return Boolean(
      couponWords.test(text) ||
      couponClass ||
      couponAttribute
    );
  }

  function productScore(element) {
    const container =
      actionContainer(element);

    if (!container || isCoupon(container)) {
      return -999;
    }

    const text = textOf(container);

    let score = 0;

    if (
      container.querySelector?.(
        "img"
      )
    ) {
      score += 5;
    }

    if (
      /r\$\s*\d|preço|preco|price/.test(
        text
      )
    ) {
      score += 4;
    }

    if (
      /estoque|stock|vendido|vendidos|sold|unidade|unidades/.test(
        text
      )
    ) {
      score += 3;
    }

    if (
      /produto|product|item/.test(
        text
      )
    ) {
      score += 2;
    }

    if (
      /fixar|pin|desafixar|unpin/.test(
        text
      )
    ) {
      score += 1;
    }

    return score;
  }

  function findMainProductButton(
    buttons,
    mode
  ) {
    const safeButtons =
      buttons.filter(button => {
        if (isCoupon(button)) {
          return false;
        }

        const text = textOf(button);

        if (mode === "unpin") {
          return (
            text === "desafixar" ||
            text === "desfixar" ||
            text === "unpin" ||
            text.includes("desafix") ||
            text.includes("unpin")
          );
        }

        return (
          text === "fixar" ||
          text === "pin" ||
          text === "fix" ||
          text.includes("fixar")
        );
      });

    return (
      safeButtons
        .map(button => ({
          button,
          score:
            productScore(button)
        }))
        .filter(item =>
          item.score >= 5
        )
        .sort(
          (first, second) =>
            second.score - first.score
        )[0]?.button ||
      null
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
  // COMMENTS — SEQUENTIAL QUEUE
  // ================================================================

  let commentTimeout = null;
  let commentProgressInterval = null;
  let commentList = [];
  let commentIndex = 0;
  let commentIntervalMin = 30;
  let commentIntervalMax = 90;
  let commentScheduleStartedAt = 0;
  let commentScheduleEndsAt = 0;
  let commentCurrentDelay = 0;
  let commentConfigurationSignature = "";
  let commentRunning = false;
  let commentSending = false;

  function notifyCommentEvent(kind, extra = {}) {
    chrome.runtime.sendMessage({
      type: "ORION_AUTOMATION_EVENT",
      payload: {
        kind,
        createdAt: new Date().toISOString(),
        ...extra
      }
    }).catch(() => {});
  }

  function clearCommentTimers() {
    clearTimeout(commentTimeout);
    clearInterval(commentProgressInterval);
    commentTimeout = null;
    commentProgressInterval = null;
  }

  function commentSignature(
    messages,
    intervalMin,
    intervalMax,
    enabled
  ) {
    return JSON.stringify({
      messages,
      intervalMin,
      intervalMax,
      enabled: Boolean(enabled)
    });
  }

  function findCommentField() {
    return (
      document.querySelector(
        'textarea[placeholder*="algo" i]'
      ) ||
      document.querySelector(
        'textarea[placeholder*="comment" i]'
      ) ||
      document.querySelector(
        'textarea[placeholder*="digite" i]'
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
      document.querySelector("textarea")
    );
  }

  async function sendComment(text) {
    if (commentSending) {
      return {
        ok: false,
        retryable: true,
        error: "Outro comentário ainda está sendo enviado."
      };
    }

    commentSending = true;

    try {
      const textarea = findCommentField();

      if (!textarea) {
        return {
          ok: false,
          retryable: true,
          error: "Campo de comentário não encontrado."
        };
      }

      textarea.focus();
      textarea.click();

      const nativeSetter =
        Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        )?.set;

      if (!nativeSetter) {
        return {
          ok: false,
          retryable: true,
          error: "Campo do TikTok não está pronto."
        };
      }

      nativeSetter.call(textarea, "");
      textarea.dispatchEvent(
        new Event("input", { bubbles: true })
      );

      nativeSetter.call(textarea, text);

      textarea.dispatchEvent(
        new Event("input", { bubbles: true })
      );

      textarea.dispatchEvent(
        new Event("change", { bubbles: true })
      );

      try {
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
      } catch {}

      await new Promise(resolve =>
        setTimeout(resolve, 350)
      );

      const keyboardOptions = {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      };

      textarea.dispatchEvent(
        new KeyboardEvent("keydown", keyboardOptions)
      );

      textarea.dispatchEvent(
        new KeyboardEvent("keypress", keyboardOptions)
      );

      textarea.dispatchEvent(
        new KeyboardEvent("keyup", keyboardOptions)
      );

      await new Promise(resolve =>
        setTimeout(resolve, 400)
      );

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        retryable: true,
        error:
          error?.message ||
          "Falha ao enviar comentário."
      };
    } finally {
      commentSending = false;
    }
  }

  function publishCommentProgress() {
    if (!commentRunning || !commentScheduleEndsAt) {
      return;
    }

    const now = Date.now();

    const totalMs = Math.max(
      1,
      commentScheduleEndsAt -
      commentScheduleStartedAt
    );

    const remainingMs = Math.max(
      0,
      commentScheduleEndsAt - now
    );

    const elapsedMs =
      totalMs - remainingMs;

    const progress = Math.min(
      100,
      Math.max(
        0,
        Math.round(
          (elapsedMs / totalMs) * 100
        )
      )
    );

    notifyCommentEvent(
      "comment-progress",
      {
        progress,
        remainingSeconds:
          Math.ceil(remainingMs / 1000),
        delaySeconds:
          commentCurrentDelay,
        currentIndex:
          commentIndex,
        totalComments:
          commentList.length,
        nextComment:
          commentList[
            commentIndex %
            commentList.length
          ] || ""
      }
    );
  }

  function selectNextDelay() {
    const minimum = Math.min(
      commentIntervalMin,
      commentIntervalMax
    );

    const maximum = Math.max(
      commentIntervalMin,
      commentIntervalMax
    );

    return random(minimum, maximum);
  }

  function scheduleNextComment({
    retryDelaySeconds = null
  } = {}) {
    clearCommentTimers();

    if (!commentRunning || !commentList.length) {
      return;
    }

    const delaySeconds =
      retryDelaySeconds ??
      selectNextDelay();

    commentCurrentDelay =
      delaySeconds;

    commentScheduleStartedAt =
      Date.now();

    commentScheduleEndsAt =
      commentScheduleStartedAt +
      delaySeconds * 1000;

    publishCommentProgress();

    commentProgressInterval =
      setInterval(
        publishCommentProgress,
        250
      );

    commentTimeout = setTimeout(
      executeScheduledComment,
      delaySeconds * 1000
    );
  }

  async function executeScheduledComment() {
    clearCommentTimers();

    if (!commentRunning || !commentList.length) {
      return;
    }

    const selectedIndex =
      commentIndex %
      commentList.length;

    const message =
      commentList[selectedIndex];

    const result =
      await sendComment(message);

    if (result.ok) {
      notifyCommentEvent(
        "comment-sent",
        {
          message,
          selectedIndex,
          currentPosition:
            selectedIndex + 1,
          totalComments:
            commentList.length,
          delaySeconds:
            commentCurrentDelay
        }
      );

      // Só avança depois do envio bem-sucedido.
      commentIndex =
        (selectedIndex + 1) %
        commentList.length;

      scheduleNextComment();
      return;
    }

    notifyCommentEvent(
      "comment-failed",
      {
        message,
        selectedIndex,
        result
      }
    );

    // Repete o mesmo comentário e mantém a ordem.
    scheduleNextComment({
      retryDelaySeconds: 3
    });
  }

  function stopComments({
    resetIndex = false
  } = {}) {
    clearCommentTimers();

    commentRunning = false;
    commentScheduleStartedAt = 0;
    commentScheduleEndsAt = 0;
    commentCurrentDelay = 0;

    if (resetIndex) {
      commentIndex = 0;
    }

    notifyCommentEvent(
      "comment-stopped",
      {
        currentIndex:
          commentIndex,
        totalComments:
          commentList.length
      }
    );
  }

  function startComments(
    messages,
    intervalMin,
    intervalMax,
    {
      preserveIndex = false
    } = {}
  ) {
    clearCommentTimers();

    commentList = messages;
    commentIntervalMin =
      intervalMin;
    commentIntervalMax =
      intervalMax;
    commentRunning = true;

    if (!preserveIndex) {
      commentIndex = 0;
    } else if (
      commentIndex >=
      commentList.length
    ) {
      commentIndex = 0;
    }

    if (!commentList.length) {
      stopComments({
        resetIndex: true
      });
      return;
    }

    notifyCommentEvent(
      "comment-started",
      {
        currentIndex:
          commentIndex,
        totalComments:
          commentList.length,
        intervalMin:
          commentIntervalMin,
        intervalMax:
          commentIntervalMax
      }
    );

    // O primeiro comentário também respeita o intervalo.
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
    return findMainProductButton(
      buttons,
      "pin"
    );
  }

  function executeAutoFixCycle() {
    if (autoFixTimeout === null) return;

    chrome.storage.local.get(
      STORAGE_KEY,
      data => {
        const settings =
          data[STORAGE_KEY] || {};

        // Regra obrigatória:
        // cupom nunca pode ser fixado.
        settings.skipCoupons = true;

        if (!settings.autoPinEnabled) {
          stopAutoFix();
          return;
        }

        const buttons = allButtons();

        const unpinButton =
          findMainProductButton(
            buttons,
            "unpin"
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

    const unpinButton =
      findMainProductButton(
        buttons,
        "unpin"
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

    const configuredMinimum =
      Math.floor(
        Number(
          settings.minCommentDelay || 30
        )
      );

    const configuredMaximum =
      Math.floor(
        Number(
          settings.maxCommentDelay || 90
        )
      );

    const minimum = Math.max(
      1,
      Number.isFinite(configuredMinimum)
        ? configuredMinimum
        : 30
    );

    const maximum = Math.max(
      1,
      Number.isFinite(configuredMaximum)
        ? configuredMaximum
        : 90
    );

    const orderedMinimum =
      Math.min(minimum, maximum);

    const orderedMaximum =
      Math.max(minimum, maximum);

    const nextSignature =
      commentSignature(
        comments,
        orderedMinimum,
        orderedMaximum,
        settings.commentsEnabled
      );

    // Alterações em outros módulos não reiniciam a fila.
    if (
      nextSignature !==
      commentConfigurationSignature
    ) {
      const sameList =
        JSON.stringify(commentList) ===
        JSON.stringify(comments);

      commentConfigurationSignature =
        nextSignature;

      if (
        settings.commentsEnabled &&
        comments.length
      ) {
        startComments(
          comments,
          orderedMinimum,
          orderedMaximum,
          {
            preserveIndex:
              sameList &&
              commentRunning
          }
        );
      } else {
        commentList = comments;
        stopComments({
          resetIndex: false
        });
      }
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
          message?.action === "sendSocialProof"
        ) {
          sendComment(
            String(message.text||"").trim()
          ).then(sendResponse);

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
