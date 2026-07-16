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
  ["exact timer method", controller.includes("configureExactEndTimer() {")],
  ["exact timer timeout", controller.includes("this.exactEndTimer = setTimeout")],
  ["timer zero reason", controller.includes('reason: "timer-zero"')],
  ["warning checked immediately", detector.includes("scanEmergencyWarnings(mutations)")],
  ["no protection cooldown", detector.includes("sem cooldown")],
  ["immediate warning end", detector.includes("endLiveImmediately")],
  ["rapid 25ms retry", detector.includes("await this.wait(25)")],
  ["650ms delay removed", !detector.includes("await this.wait(650)")],
  ["confirmation retry loop", detector.includes("confirmationDeadline")],
  ["version 1.4.1", manifest.version === "1.4.1"]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);
console.log("All immediate live-ending tests passed.");
