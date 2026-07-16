const fs = require("fs");
const path = require("path");

const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const panel = fs.readFileSync(
  path.join(__dirname, "../../extension/src/sidepanel/app.js"),
  "utf8"
);
const schema = fs.readFileSync(path.join(__dirname, "../schema.sql"), "utf8");

const checks = [
  ["computer fingerprint generated", panel.includes("computerFingerprint()")],
  ["fingerprint uses SHA-256", panel.includes('crypto.subtle.digest("SHA-256"')],
  ["activation sends fingerprint", panel.includes("deviceFingerprint")],
  ["server stores fingerprint", server.includes("device_fingerprint=?")],
  ["same fingerprint allows rebind", server.includes("sameComputerReinstall")],
  ["different computer remains blocked", server.includes("já está vinculada a outro computador")],
  ["legacy activation explains one-time release", server.includes("Ativação antiga detectada")],
  ["admin release clears fingerprint", server.includes("device_fingerprint=NULL")],
  ["startup migration exists", server.includes("ensureDeviceFingerprintColumn")],
  ["fresh schema has fingerprint", schema.includes("device_fingerprint VARCHAR(64)")]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);
console.log("All same-computer reinstall tests passed.");
