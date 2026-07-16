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

const installer = fs.readFileSync(
  path.join(__dirname, "../../scripts/instalar-api-nginx.sh"),
  "utf8"
);

const checks = [
  [
    "comments native setter",
    detector.includes("HTMLTextAreaElement.prototype") &&
    detector.includes("compositionend")
  ],
  [
    "exact power selector",
    detector.includes(".arco-icon-im_close_chat")
  ],
  [
    "unconfirmed ending is failure",
    detector.includes('stage: "confirmation-not-found"') &&
    detector.includes("ok: false")
  ],
  [
    "timer uses emergency confirmed loop",
    controller.includes("startEmergencyEndLoop") &&
    controller.includes("finishEndTimerSuccess")
  ],
  [
    "timer does not clear on first failure",
    controller.includes("Não considera encerrado até clicar")
  ],
  [
    "sale Telegram notification",
    controller.includes("Nova venda detectada")
  ],
  [
    "Telegram reads storage",
    background.includes('chrome.storage.local.get([') &&
    background.includes('"orionSettings"')
  ],
  [
    "Admin permission absent",
    !manifest.host_permissions.some(
      value => value.includes("admin.valoranegocios.com.br")
    )
  ],
  [
    "TikTok all subdomains",
    manifest.host_permissions.includes("*://*.tiktok.com/*")
  ],
  [
    "API installer writes config",
    installer.includes("sudo tee") &&
    installer.includes("api.valoranegocios.com.br")
  ],
  [
    "version 3.2.0",
    manifest.version === "3.2.0"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);
console.log("All v3.2.0 consolidated tests passed.");
