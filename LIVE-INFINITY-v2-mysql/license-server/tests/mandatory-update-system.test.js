const fs = require("fs");
const path = require("path");

const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const admin = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const adminHtml = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
const panel = fs.readFileSync(
  path.join(__dirname, "../../extension/src/sidepanel/app.js"),
  "utf8"
);
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../extension/manifest.json"),
    "utf8"
  )
);

const checks = [
  ["updates table migration", server.includes("ensureUpdatesTable")],
  ["latest update endpoint", server.includes('/api/updates/latest')],
  ["download endpoint", server.includes('/api/updates/download/')],
  ["admin upload endpoint", server.includes('/api/admin/updates')],
  ["mandatory forced to true", server.includes("mandatory TINYINT(1) NOT NULL DEFAULT 1")],
  ["admin updates menu", adminHtml.includes('data-page="updates"')],
  ["admin publish page", admin.includes("Publicar atualização obrigatória")],
  ["extension checks updates", panel.includes("checkMandatoryUpdate")],
  ["extension blocks interface", panel.includes("mandatory-update-overlay")],
  ["mandatory download button", panel.includes("Baixar atualização")],
  ["extension version 1.4.0", manifest.version === "1.4.0"]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);
console.log("All mandatory update system tests passed.");
