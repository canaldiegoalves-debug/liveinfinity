const fs = require("fs");
const path = require("path");

const core = fs.readFileSync(
  path.join(
    __dirname,
    "../../extension/src/content/liveflow-core.js"
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
    "LiveFlow comment setter",
    core.includes(
      "HTMLTextAreaElement.prototype"
    )
  ],
  [
    "LiveFlow comment composition",
    core.includes("compositionstart") &&
    core.includes("compositionend")
  ],
  [
    "LiveFlow auto-fix timings",
    core.includes("random(5000, 8000)") &&
    core.includes("random(18000, 30000)")
  ],
  [
    "coupon is blocked",
    core.includes("isCoupon")
  ],
  [
    "LiveFlow end selector",
    core.includes(
      ".arco-icon-im_close_chat"
    )
  ],
  [
    "session start cannot end live",
    core.includes(
      '"LIVE_INFINITY_SESSION_START"'
    ) &&
    !core.includes(
      'LIVE_INFINITY_SESSION_START",\n    endLive'
    )
  ],
  [
    "only timer and warning end",
    core.includes(
      'reason === "timer-zero"'
    ) &&
    core.includes(
      'reason === "warning"'
    )
  ],
  [
    "old timer module disabled",
    controller.includes(
      "Timer gerenciado exclusivamente"
    )
  ],
  [
    "core loaded by manifest",
    manifest.content_scripts.some(
      item =>
        item.js.includes(
          "src/content/liveflow-core.js"
        )
    )
  ],
  [
    "version 4.2.0",
    manifest.version === "4.2.0"
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
  "All v4.2.0 LiveFlow core tests passed."
);
