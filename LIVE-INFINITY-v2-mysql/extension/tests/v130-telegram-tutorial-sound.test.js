const fs = require("fs");
const path = require("path");

const panel = fs.readFileSync(
  path.join(__dirname, "../src/sidepanel/app.js"),
  "utf8"
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8")
);
const soundPath = path.join(
  __dirname,
  "../assets/caixa-registradora-live-infinity.wav"
);

const checks = [
  ["Telegram tutorial exists", panel.includes("Como configurar o Telegram")],
  ["BotFather instructions exist", panel.includes("@BotFather")],
  ["Chat ID instructions exist", panel.includes("@userinfobot")],
  ["Download sound button exists", panel.includes("download-cash-sound")],
  ["Test sound button exists", panel.includes("test-cash-sound")],
  ["Cash sound file exists", fs.existsSync(soundPath)],
  ["Version is 1.3.0", manifest.version === "1.3.0"]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}
if (failed) process.exit(1);
console.log("All v1.3.0 Telegram tutorial tests passed.");
