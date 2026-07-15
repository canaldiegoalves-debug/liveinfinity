const fs = require("fs");
const path = require("path");

const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const admin = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");

const checks = [
  ["capture mode exists", /CAKTO_CAPTURE_ONLY/.test(server)],
  ["basic checkout configured", /3477jz3_976117/.test(server)],
  ["pro checkout configured", /387ye5s_982831/.test(server)],
  ["premium checkout configured", /3b3y7bp_982839/.test(server)],
  ["webhook route exists", /\/api\/webhooks\/cakto/.test(server)],
  ["events endpoint exists", /\/api\/admin\/cakto-events/.test(server)],
  ["admin page exists", /function caktoPage/.test(admin)],
  ["navigation exists", /data-page="cakto"/.test(html)]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed += 1;
}
if (failed) process.exit(1);
console.log("All Cakto capture tests passed.");
