const fs = require("fs");
const path = require("path");

const packageJson = require("../package.json");
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../extension/manifest.json"),
    "utf8"
  )
);

const adminHtml = fs.readFileSync(
  path.join(__dirname, "../public/index.html"),
  "utf8"
);

const adminApp = fs.readFileSync(
  path.join(__dirname, "../public/app.js"),
  "utf8"
);

const expected = "4.2.0";

const checks = [
  ["server version", packageJson.version === expected],
  ["extension version", manifest.version === expected],
  ["updates menu", adminHtml.includes('data-page="updates"')],
  ["updates page", adminApp.includes("function updatesPage()")],
  ["admin version badge", adminHtml.includes('id="server-version"')]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) {
  console.error(
    "\nDEPLOY BLOQUEADO: a pasta atual não é a v3.0.0 completa."
  );
  process.exit(1);
}

console.log("\nLive Infinity v4.2.0 verificada com sucesso.");
