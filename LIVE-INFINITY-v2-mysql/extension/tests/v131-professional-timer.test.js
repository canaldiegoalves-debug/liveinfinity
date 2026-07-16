const fs = require("fs");
const path = require("path");

const panel = fs.readFileSync(path.join(__dirname, "../src/sidepanel/app.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../src/sidepanel/styles.css"), "utf8");
const controller = fs.readFileSync(path.join(__dirname, "../src/content/controller.js"), "utf8");

const checks = [
  ["large countdown exists", panel.includes("timer-clock")],
  ["quick times exist", panel.includes('data-time="60"') && panel.includes('data-time="480"')],
  ["manual minutes input exists", panel.includes('id="timer-minutes"')],
  ["pause/resume button exists", panel.includes('id="timer-pause"')],
  ["cancel button exists", panel.includes('id="timer-cancel"')],
  ["pause state persists", panel.includes("endTimerPaused")],
  ["remaining time persists", panel.includes("endTimerRemainingMs")],
  ["controller ignores paused timer", controller.includes("if (this.settings.endTimerPaused) return;")],
  ["professional timer styles exist", styles.includes(".timer-panel") && styles.includes(".timer-secondary-actions")]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);
console.log("All v1.3.1 professional timer tests passed.");
