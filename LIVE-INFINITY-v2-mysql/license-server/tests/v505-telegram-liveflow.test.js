const fs = require("fs");
const path = require("path");

const bg = fs.readFileSync(
  path.join(
    __dirname,
    "../../extension/src/background/service-worker.js"
  ),
  "utf8"
);

const controller = fs.readFileSync(
  path.join(
    __dirname,
    "../../extension/src/content/controller.js"
  ),
  "utf8"
);

const detector = fs.readFileSync(
  path.join(
    __dirname,
    "../../extension/src/content/detector.js"
  ),
  "utf8"
);

const app = fs.readFileSync(
  path.join(
    __dirname,
    "../../extension/src/sidepanel/app.js"
  ),
  "utf8"
);

const manifest = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "../../extension/manifest.json"
    ),
    "utf8"
  )
);

const checks = [
  [
    "direct Telegram API from background",
    bg.includes(
      '"https://api.telegram.org/bot"'
    )
  ],
  [
    "settings read from extension storage",
    bg.includes("telegramSettings")
  ],
  [
    "sale notifier matches LiveFlow model",
    bg.includes("notifyTelegramSale") &&
    bg.includes("NOVA VENDA")
  ],
  [
    "start notifier",
    bg.includes("notifyTelegramStart")
  ],
  [
    "end notifier",
    bg.includes("notifyTelegramEnd")
  ],
  [
    "violation notifier",
    bg.includes("notifyTelegramViolation")
  ],
  [
    "real events and test use same route",
    controller.includes(
      "ORION_TELEGRAM_EVENT"
    ) &&
    detector.includes(
      "ORION_TELEGRAM_EVENT"
    ) &&
    app.includes(
      'kind:"test"'
    )
  ],
  [
    "Telegram host permission",
    manifest.host_permissions.includes(
      "https://api.telegram.org/*"
    )
  ],
  [
    "coupon stays locked",
    app.includes(
      "frozen-feature-badge"
    )
  ],
  [
    "version 5.0.5",
    manifest.version === "5.0.5"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(
    `${passed ? "PASS" : "FAIL"} ${name}`
  );

  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log(
  "All v5.0.5 Telegram tests passed."
);
