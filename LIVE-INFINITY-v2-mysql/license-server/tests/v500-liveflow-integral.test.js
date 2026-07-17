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
    "comments use LiveFlow setter",
    core.includes(
      "HTMLTextAreaElement.prototype"
    )
  ],
  [
    "comments use composition events",
    core.includes("compositionstart") &&
    core.includes("compositionend")
  ],
  [
    "auto-fix uses LiveFlow timings",
    core.includes("random(5000, 8000)") &&
    core.includes("random(18000, 30000)")
  ],
  [
    "coupon remains blocked",
    core.includes("isCoupon")
  ],
  [
    "end uses LiveFlow selector",
    core.includes(
      ".arco-icon-im_close_chat"
    )
  ],
  [
    "background owns timer",
    background.includes(
      "TIMER LIVEFLOW — ÚNICO DONO"
    )
  ],
  [
    "timer decrements each second",
    background.includes(
      "liveFlowTimerSeconds -= 1"
    )
  ],
  [
    "timer sends end and zero",
    background.includes(
      'sendLiveFlowContent(\n          "encerrarLive"'
    ) &&
    background.includes(
      'sendLiveFlowContent(\n          "timerZerou"'
    )
  ],
  [
    "version 5.0.0",
    manifest.version === "5.0.0"
  ]
];

let failed = 0;

for (
  const [name, passed]
  of checks
) {
  console.log(
    `${passed ? "PASS" : "FAIL"} ${name}`
  );

  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log(
  "All v5.0.0 integral LiveFlow tests passed."
);
