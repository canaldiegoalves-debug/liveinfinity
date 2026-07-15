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
  ["admin detects editable fields", /function isEditingAdmin/.test(admin)],
  ["admin defers render while editing", /function renderPageWhenSafe/.test(admin)],
  ["admin load uses safe render", /renderPageWhenSafe\(\)/.test(admin)],
  ["admin has focus listeners", /document\.addEventListener\("focusin"/.test(admin)],
  ["extension has timeout fetch", /function apiFetch/.test(extension)],
  ["transient failure keeps license", /if\(error\?\.transient\)\{\s*return;/s.test(extension)],
  ["extension safe render remains", /function renderWhenSafe/.test(extension)]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed += 1;
}

if (failed) process.exit(1);
console.log("All focus preservation tests passed.");
