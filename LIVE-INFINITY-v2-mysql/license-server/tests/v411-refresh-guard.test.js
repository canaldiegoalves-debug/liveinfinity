const fs = require("fs");
const path = require("path");

const detector = fs.readFileSync(
  path.join(__dirname, "../../extension/src/content/detector.js"),
  "utf8"
);

const controller = fs.readFileSync(
  path.join(__dirname, "../../extension/src/content/controller.js"),
  "utf8"
);

const manifest = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../extension/manifest.json"),
    "utf8"
  )
);

const checks = [
  [
    "page load timestamp exists",
    detector.includes("pageLoadedAt: Date.now()")
  ],
  [
    "timer requires actual zero",
    detector.includes("Date.now() >= endTimerAt")
  ],
  [
    "timer blocked during page initialization",
    detector.includes(
      "Date.now() - this.pageLoadedAt >= 3000"
    )
  ],
  [
    "warning requires fresh authorization",
    detector.includes(
      "freshWarningAuthorizedAt > 0"
    )
  ],
  [
    "warning expires after ten seconds",
    detector.includes(
      "freshWarningAuthorizedAt <= 10000"
    )
  ],
  [
    "warning blocked during first thirty seconds",
    detector.includes(
      "Date.now() - this.pageLoadedAt >= 30000"
    )
  ],
  [
    "refresh resets warning authorization",
    controller.includes(
      "OrionDetector.freshWarningAuthorizedAt = 0"
    )
  ],
  [
    "LiveFlow functions remain",
    detector.includes(".arco-icon-im_close_chat") &&
    detector.includes("HTMLTextAreaElement.prototype")
  ],
  [
    "version 4.1.1",
    manifest.version === "4.1.1"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log("All v4.1.1 refresh guard tests passed.");
