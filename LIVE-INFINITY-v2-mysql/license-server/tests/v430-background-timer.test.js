const fs = require("fs");
const path = require("path");

const core = fs.readFileSync(
  path.join(
    __dirname,
    "../../extension/src/content/liveflow-core.js"
  ),
  "utf8"
);

const background = fs.readFileSync(
  path.join(
    __dirname,
    "../../extension/src/background/service-worker.js"
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
    "background owns timer",
    background.includes("LIVEFLOW BACKGROUND TIMER")
  ],
  [
    "background checks every 250ms",
    background.includes("}, 250);")
  ],
  [
    "background sends encerrarLive",
    background.includes(
      'sendToTikTokContent("encerrarLive"'
    )
  ],
  [
    "background sends timerZerou",
    background.includes(
      'sendToTikTokContent("timerZerou"'
    )
  ],
  [
    "content receives encerrarLive",
    core.includes(
      'message?.action === "encerrarLive"'
    )
  ],
  [
    "content timer disabled",
    core.includes(
      "Cronômetro controlado exclusivamente pelo background"
    )
  ],
  [
    "LiveFlow end selector remains",
    core.includes(".arco-icon-im_close_chat")
  ],
  [
    "version 4.3.0",
    manifest.version === "4.3.0"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log("All v4.3.0 background timer tests passed.");
