const fs = require("fs");
const path = require("path");

const app = fs.readFileSync(
  path.join(
    __dirname,
    "../../extension/src/sidepanel/app.js"
  ),
  "utf8"
);

const core = fs.readFileSync(
  path.join(
    __dirname,
    "../../extension/src/content/liveflow-core.js"
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
    "viewers and alerts share one card",
    app.includes("summary-dual") &&
    app.includes('data-live-value="alerts"')
  ],
  [
    "sales and GMV are together below",
    app.includes("sales-gmv-summary") &&
    app.includes('data-live-value="sales"') &&
    app.includes('data-live-value="gmv"')
  ],
  [
    "progress survives rerenders",
    app.includes("state.commentProgress") &&
    app.includes("renderStoredCommentProgress")
  ],
  [
    "progress has its own clock",
    app.includes("commentProgressUiTimer") &&
    app.includes("setInterval")
  ],
  [
    "progress starts immediately",
    app.includes("progressStartedAt") &&
    app.includes("endsAt:progressStartedAt")
  ],
  [
    "Telegram tutorial open state persists",
    app.includes("telegramHelpOpen") &&
    app.includes('id="telegram-liveflow-help"') &&
    app.includes('addEventListener("toggle"')
  ],
  [
    "coupon feature remains frozen",
    app.includes("frozen-feature-badge") &&
    app.includes("Proteção obrigatória")
  ],
  [
    "timer and ending remain untouched",
    core.includes(".arco-icon-im_close_chat")
  ],
  [
    "version 5.0.4",
    manifest.version === "5.0.4"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log("All v5.0.4 tests passed.");
