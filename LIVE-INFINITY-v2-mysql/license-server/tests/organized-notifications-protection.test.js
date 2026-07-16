const fs = require("fs");
const path = require("path");

const panel = fs.readFileSync(
  path.join(__dirname, "../../extension/src/sidepanel/app.js"),
  "utf8"
);
const styles = fs.readFileSync(
  path.join(__dirname, "../../extension/src/sidepanel/styles.css"),
  "utf8"
);

const checks = [
  ["Telegram card separated", panel.includes("Notificações Telegram")],
  ["Telegram configured status exists", panel.includes("Telegram configurado!")],
  ["Protection card separated", panel.includes("Proteção da Live")],
  ["Protection automatic toggle exists", panel.includes("Ativar proteção automática")],
  ["Telegram alert toggle remains in protection", panel.includes("Enviar alerta no Telegram")],
  ["Technical cooldown input removed", !panel.includes('id="protection-cooldown"')],
  ["Cooldown fixed internally", panel.includes("protectionCooldownSeconds=120")],
  ["End live button remains", panel.includes("Encerrar transmissão agora")],
  ["Separated card styles exist", styles.includes(".telegram-status-card") && styles.includes(".protection-status-card")]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);
console.log("All organized UI tests passed.");
