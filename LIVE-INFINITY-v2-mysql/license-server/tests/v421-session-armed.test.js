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
    "session starts disarmed",
    core.includes("let sessionArmed = false")
  ],
  [
    "refresh cannot run timer",
    core.includes("if (!sessionArmed) return;")
  ],
  [
    "session start arms automation",
    core.includes("sessionArmed = true")
  ],
  [
    "timer requires current zero",
    core.includes("Date.now() >= currentEndAt")
  ],
  [
    "warning uses strict critical words",
    core.includes("violação|violacao|violation")
  ],
  [
    "normal alerts ignored",
    core.includes("if (!criticalWarning) return;")
  ],
  [
    "warning requires armed session",
    core.includes("!sessionArmed")
  ],
  [
    "startup grace period",
    core.includes("Date.now() - pageLoadedAt < 30000")
  ],
  [
    "version 4.2.1",
    manifest.version === "4.2.1"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log("All v4.2.1 session armed tests passed.");
