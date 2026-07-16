const fs = require("fs");
const path = require("path");

const detector = fs.readFileSync(
  path.join(
    __dirname,
    "../../extension/src/content/detector.js"
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
    "LiveFlow native comment setter",
    detector.includes(
      "window.HTMLTextAreaElement.prototype"
    )
  ],
  [
    "LiveFlow composition events",
    detector.includes("compositionstart") &&
    detector.includes("compositionend")
  ],
  [
    "LiveFlow first comment immediate",
    controller.includes(
      "envia o primeiro e depois agenda"
    )
  ],
  [
    "LiveFlow pin 5 to 8 seconds",
    controller.includes(
      "Math.floor(Math.random() * 3001) + 5000"
    )
  ],
  [
    "LiveFlow pin 18 to 30 seconds",
    controller.includes(
      "Math.floor(Math.random() * 12001)"
    )
  ],
  [
    "coupon remains blocked",
    controller.includes(
      "isStrictCouponElement"
    )
  ],
  [
    "LiveFlow exact end selector",
    detector.includes(
      ".arco-icon-im_close_chat"
    )
  ],
  [
    "refresh cannot use expired timer",
    controller.includes(
      "timer já vencido é apagado"
    )
  ],
  [
    "timer must be armed on this page",
    detector.includes(
      "timerArmedThisPage === true"
    )
  ],
  [
    "version 4.1.0",
    manifest.version === "4.1.0"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log("All v4.1.0 LiveFlow exact tests passed.");
