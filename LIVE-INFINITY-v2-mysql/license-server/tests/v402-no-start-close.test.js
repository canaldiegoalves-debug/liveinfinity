const fs = require("fs");
const path = require("path");

const controller = fs.readFileSync(
  path.join(__dirname, "../../extension/src/content/controller.js"),
  "utf8"
);

const detector = fs.readFileSync(
  path.join(__dirname, "../../extension/src/content/detector.js"),
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
    "protection is not automatically enabled",
    !controller.includes(
      "this.settings.protectionEnabled = true"
    )
  ],
  [
    "warning scanner checks saved setting",
    detector.includes(
      "if (!settings.protectionEnabled) return;"
    )
  ],
  [
    "warning scanner is async",
    detector.includes(
      "async scanEmergencyWarnings"
    )
  ],
  [
    "startup grace period",
    detector.includes(
      "Date.now() - this.liveStartedAt < 30000"
    )
  ],
  [
    "timer guard remains",
    controller.includes(
      'if (reason === "timer-zero")'
    ) &&
    controller.includes(
      "if (!endTimerAt) return;"
    )
  ],
  [
    "version 4.0.2",
    manifest.version === "4.0.2"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log("All v4.0.2 tests passed.");
