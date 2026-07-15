const fs = require("fs");
const path = require("path");

const admin = fs.readFileSync(
  path.join(__dirname, "../public/app.js"),
  "utf8"
);

const checks = [
  ["loadData supports render flag", /render = true/.test(admin)],
  ["licenses page blocks automatic render", /state\.page === "licenses"/.test(admin)],
  ["support page blocks automatic render", /state\.page === "support"/.test(admin)],
  ["background refresh uses render false", /render: !pageHasForm/.test(admin)],
  ["manual refresh renders page", /loadData\(\{ render: true \}\)/.test(admin)],
  ["refresh interval is five seconds", /}, 5000\)/.test(admin)]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed += 1;
}

if (failed) process.exit(1);
console.log("All form refresh tests passed.");
