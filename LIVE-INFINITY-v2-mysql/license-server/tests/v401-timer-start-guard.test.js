const fs = require("fs");
const path = require("path");

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
    "timer-zero requires valid timer",
    controller.includes('if (!endTimerAt) return;')
  ],
  [
    "timer-zero requires expiration",
    controller.includes('if (!force && now < endTimerAt) return;')
  ],
  [
    "live start explicitly clears old ending attempts",
    controller.includes("Ao detectar o início da LIVE")
  ],
  [
    "no live-start emergency call",
    !controller.includes(
      'startEmergencyEndLoop("live-start")'
    )
  ],
  [
    "warning remains independent",
    detector.includes('reason: "warning"')
  ],
  [
    "version 4.0.1",
    manifest.version === "4.0.1"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log("All v4.0.1 timer guard tests passed.");
