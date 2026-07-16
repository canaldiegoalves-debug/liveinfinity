const fs = require("fs");
const path = require("path");

const manifest = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../extension/manifest.json"),
    "utf8"
  )
);

const detector = fs.readFileSync(
  path.join(__dirname, "../../extension/src/content/detector.js"),
  "utf8"
);

const controller = fs.readFileSync(
  path.join(__dirname, "../../extension/src/content/controller.js"),
  "utf8"
);

const background = fs.readFileSync(
  path.join(__dirname, "../../extension/src/background/service-worker.js"),
  "utf8"
);

const constants = fs.readFileSync(
  path.join(__dirname, "../../extension/src/shared/constants.js"),
  "utf8"
);

const checks = [
  ["native textarea setter", detector.includes("HTMLTextAreaElement.prototype")],
  ["composition events", detector.includes("compositionupdate") && detector.includes("compositionend")],
  ["sequential timeout", controller.includes("Agenda somente depois de terminar o envio atual")],
  ["exact close selector", detector.includes(".arco-icon-im_close_chat")],
  ["confirmation required", detector.includes('stage: "confirmation-not-found"')],
  ["serialized timer retries", controller.includes("attemptEnd") && controller.includes("500")],
  ["Telegram storage source", background.includes('"orionSettings"')],
  ["Telegram API error", background.includes("body?.description")],
  ["Admin permission removed", !manifest.host_permissions.some(value => value.includes("admin.valoranegocios.com.br"))],
  ["TikTok all subdomains", manifest.host_permissions.includes("*://*.tiktok.com/*")],
  ["separate API host", constants.includes('https://api.valoranegocios.com.br')],
  ["version 4.0.0", manifest.version === "4.0.0"]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log("All v4.0.0 critical module tests passed.");
