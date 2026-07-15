const fs = require("fs");
const path = require("path");

const controller = fs.readFileSync(
  path.join(__dirname, "../src/content/controller.js"),
  "utf8"
);
const panel = fs.readFileSync(
  path.join(__dirname, "../src/sidepanel/app.js"),
  "utf8"
);
const constants = fs.readFileSync(
  path.join(__dirname, "../src/shared/constants.js"),
  "utf8"
);

const checks = [
  ["persistent end timestamp default", /endTimerAt:\s*null/.test(constants)],
  ["timer timestamp saved", /state\.settings\.endTimerAt=state\.endAt/.test(panel)],
  ["timer cancellation saved", /state\.settings\.endTimerAt=null/.test(panel)],
  ["content checks timer every second", /this\.handleEndTimer\(\)/.test(controller)],
  ["content ends live", /handleEndTimer\(\)[\s\S]*OrionDetector\.endLive\(\{ dryRun: false \}\)/.test(controller)],
  ["automations stop before ending", /clearTimeout\(this\.commentTimer\)[\s\S]*clearInterval\(this\.autoPinTimer\)/.test(controller)],
  ["timer clears after execution", /this\.settings\.endTimerAt = null/.test(controller)]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}
if (failed) process.exit(1);
console.log("All v1.2.5 end timer tests passed.");
