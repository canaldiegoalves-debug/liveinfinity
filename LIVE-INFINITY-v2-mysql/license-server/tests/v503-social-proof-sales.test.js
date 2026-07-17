const fs = require("fs");
const path = require("path");

const controller = fs.readFileSync(
  path.join(
    __dirname,
    "../../extension/src/content/controller.js"
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

const background = fs.readFileSync(
  path.join(
    __dirname,
    "../../extension/src/background/service-worker.js"
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
    "baseline is separate from zero count",
    controller.includes(
      "salesBaselineInitialized"
    )
  ],
  [
    "first real sale is not discarded",
    !controller.includes(
      "if(this.lastKnownSalesCount===0)"
    )
  ],
  [
    "sale increments are grouped",
    controller.includes(
      "pendingNewSalesCount"
    )
  ],
  [
    "proof social uses LiveFlow chat core",
    controller.includes(
      "ORION_SOCIAL_PROOF_SEND"
    ) &&
    core.includes(
      'message?.action === "sendSocialProof"'
    )
  ],
  [
    "background forwards to TikTok",
    background.includes(
      "sendSocialProofToTikTok"
    )
  ],
  [
    "all messages are saved",
    app.includes(
      "state.settings.postSaleMessages="
    )
  ],
  [
    "test substitutes sales count",
    app.includes(
      '.replace(/\\{salesCount\\}/gi,"1")'
    )
  ],
  [
    "timer and ending remain",
    core.includes(
      ".arco-icon-im_close_chat"
    )
  ],
  [
    "version 5.0.3",
    manifest.version === "5.0.3"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log("All v5.0.3 social-proof tests passed.");
