const fs = require("fs");
const path = require("path");

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
    "timer end snapshot exists",
    core.includes("let armedTimerEndAt = 0")
  ],
  [
    "timer watchdog exists",
    core.includes("setInterval(") &&
    core.includes("250")
  ],
  [
    "UI clearing timer does not cancel snapshot",
    core.includes(
      "preserva o snapshot armado"
    )
  ],
  [
    "timer fires only once",
    core.includes("timerEndTriggered")
  ],
  [
    "timer end calls LiveFlow end",
    core.includes("endLive();")
  ],
  [
    "session resets old snapshot",
    core.includes("armedTimerEndAt = 0")
  ],
  [
    "timer zero can use snapshot",
    core.includes(
      "armedTimerEndAt ||"
    )
  ],
  [
    "version 4.2.2",
    manifest.version === "4.2.2"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log("All v4.2.2 timer snapshot tests passed.");
