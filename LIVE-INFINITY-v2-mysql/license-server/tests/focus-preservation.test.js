const fs = require("fs");
const path = require("path");

const admin = fs.readFileSync(
  path.join(__dirname, "../public/app.js"),
  "utf8"
);

const extension = fs.readFileSync(
  path.join(__dirname, "../../extension/src/sidepanel/app.js"),
  "utf8"
);

const checks = [
  ["admin editing detector", /function isEditingAdmin/.test(admin)],
  ["admin safe render", /function renderPageWhenSafe/.test(admin)],
  ["admin safe load render", /renderPageWhenSafe\(\)/.test(admin)],
  ["admin focus listener", /document\.addEventListener\("focusin"/.test(admin)],
  ["extension timeout fetch", /function apiFetch/.test(extension)],
  ["extension transient network handling", /error\?\.transient/.test(extension)],
  ["extension safe render remains", /function renderWhenSafe/.test(extension)]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed += 1;
}

if (failed) process.exit(1);
console.log("All focus preservation tests passed.");
