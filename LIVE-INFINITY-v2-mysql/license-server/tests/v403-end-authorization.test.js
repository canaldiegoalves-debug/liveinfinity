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
    "expired previous timer cleared at live start",
    controller.includes(
      "Um timer vencido de uma sessão anterior"
    ) &&
    controller.includes(
      "storedEndTimerAt <= Date.now()"
    )
  ],
  [
    "timer end requires real zero",
    detector.includes(
      'reason === "timer-zero"'
    ) &&
    detector.includes(
      "now >= endTimerAt"
    )
  ],
  [
    "warning requires protection",
    detector.includes(
      'reason === "warning"'
    ) &&
    detector.includes(
      "Boolean(settings.protectionEnabled)"
    )
  ],
  [
    "unauthorized calls are blocked",
    detector.includes(
      'stage: "authorization-blocked"'
    )
  ],
  [
    "blocked calls stop retry loop",
    controller.includes(
      "if (result.blocked)"
    )
  ],
  [
    "LiveFlow selector remains",
    detector.includes(
      ".arco-icon-im_close_chat"
    )
  ],
  [
    "version 4.0.3",
    manifest.version === "4.0.3"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log("All v4.0.3 authorization tests passed.");
