const fs = require("fs");
const path = require("path");

const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const admin = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
const extension = fs.readFileSync(
  path.join(__dirname, "../../extension/src/sidepanel/app.js"),
  "utf8"
);

const checks = [
  ["admin login route exists", /\/api\/admin\/login/.test(server)],
  ["key generator exists", /generateKey/.test(server)],
  ["activation starts days", /if \(!license\.activatedAt\)/.test(server)],
  ["arbitrary duration is used", /license\.durationDays/.test(server)],
  ["device binding exists", /license\.deviceId = deviceId/.test(server)],
  ["admin creates licenses", /\/api\/admin\/licenses/.test(admin)],
  ["admin displays key", /license\.key/.test(admin)],
  ["extension uses activate endpoint", /\/api\/activate/.test(extension)],
  ["extension asks for key", /Chave/.test(extension)]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed += 1;
}

if (failed) process.exit(1);
console.log("All key admin tests passed.");
