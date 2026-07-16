const fs = require("fs");
const path = require("path");

const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
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
  ["server resolves account plan", server.includes("COALESCE(a.plan,l.plan) AS resolved_plan")],
  ["server returns accountPlan", server.includes("accountPlan: normalizePlan(updated.plan)")],
  ["premium has advanced access", panel.includes('["pro","premium"].includes')],
  ["premium label exists", panel.includes('"Premium"')],
  ["basic remains locked", panel.includes("Disponível nos planos Pro e Premium")],
  ["extension version 1.3.2", manifest.version === "1.3.2"]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);
console.log("All premium plan synchronization tests passed.");
