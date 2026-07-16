const fs = require("fs");
const path = require("path");

const manifest = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../extension/manifest.json"),
    "utf8"
  )
);

const constants = fs.readFileSync(
  path.join(__dirname, "../../extension/src/shared/constants.js"),
  "utf8"
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

const panel = fs.readFileSync(
  path.join(__dirname, "../../extension/src/sidepanel/app.js"),
  "utf8"
);

const checks = [
  [
    "Admin host permission removed",
    !manifest.host_permissions.some(
      value => value.includes("admin.valoranegocios.com.br")
    )
  ],
  [
    "all TikTok subdomains allowed",
    manifest.host_permissions.includes("*://*.tiktok.com/*") &&
    manifest.content_scripts[0].matches.includes("*://*.tiktok.com/*")
  ],
  [
    "separate API subdomain",
    manifest.host_permissions.includes(
      "https://api.valoranegocios.com.br/*"
    ) &&
    constants.includes(
      'API_BASE_URL: "https://api.valoranegocios.com.br"'
    )
  ],
  [
    "native textarea setter",
    detector.includes("HTMLTextAreaElement.prototype")
  ],
  [
    "composition events",
    detector.includes("compositionstart") &&
    detector.includes("compositionend")
  ],
  [
    "Enter after React update",
    detector.includes("await this.wait(300)") &&
    detector.includes('key: "Enter"')
  ],
  [
    "comments remain sequential",
    controller.includes(
      "(this.commentIndex + 1) % comments.length"
    )
  ],
  [
    "exact TikTok power selector",
    detector.includes(".arco-icon-im_close_chat")
  ],
  [
    "close chat fallback",
    detector.includes('[class*="close_chat"]')
  ],
  [
    "confirmation text",
    detector.includes("encerrar agora") &&
    detector.includes("end now")
  ],
  [
    "Telegram reads storage",
    background.includes(
      'chrome.storage.local.get(["orionSettings"])'
    )
  ],
  [
    "Telegram returns API errors",
    background.includes("body?.description")
  ],
  [
    "Telegram test saves first",
    panel.includes("await saveSettings()") &&
    panel.includes("Live Infinity conectado com sucesso!")
  ],
  [
    "version 3.1.0",
    manifest.version === "3.1.0"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log("All v3.1.0 LiveFlow core tests passed.");
