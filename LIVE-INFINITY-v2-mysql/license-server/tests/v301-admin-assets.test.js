const fs = require("fs");
const path = require("path");

const server = fs.readFileSync(
  path.join(__dirname, "../server.js"),
  "utf8"
);

const index = fs.readFileSync(
  path.join(__dirname, "../public/index.html"),
  "utf8"
);

const packageJson = require("../package.json");

const checks = [
  [
    "redirect secure panel to trailing slash",
    server.includes('Location: `${ADMIN_PANEL_PATH}/`')
  ],
  [
    "secure panel assets remain under prefix",
    server.includes('requestPath.startsWith(`${ADMIN_PANEL_PATH}/`)')
  ],
  [
    "admin HTML has relative base",
    index.includes('<base href="./">')
  ],
  [
    "version 3.0.1",
    packageJson.version === "3.0.1"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log("All v3.0.1 Admin asset tests passed.");
