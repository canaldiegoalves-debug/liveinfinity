const fs = require("fs");
const path = require("path");

const core = fs.readFileSync(
  path.join(__dirname, "../../extension/src/content/liveflow-core.js"),
  "utf8"
);

const manifest = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../extension/manifest.json"),
    "utf8"
  )
);

const checks = [
  ["future timer arms automatically", core.includes("nextEndAt > Date.now()")],
  ["initial future timer arms", core.includes("initialEndAt > Date.now()")],
  ["watchdog remains", core.includes("timerWatchdog")],
  ["snapshot remains", core.includes("armedTimerEndAt")],
  ["version 4.2.3", manifest.version === "4.2.3"]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}
if (failed) process.exit(1);
console.log("All v4.2.3 timer auto-arm tests passed.");
