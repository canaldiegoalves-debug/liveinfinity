const fs = require("fs");
const path = require("path");

const panel = fs.readFileSync(
  path.join(__dirname, "../../extension/src/sidepanel/app.js"),
  "utf8"
);

const controller = fs.readFileSync(
  path.join(__dirname, "../../extension/src/content/controller.js"),
  "utf8"
);

const constants = fs.readFileSync(
  path.join(__dirname, "../../extension/src/shared/constants.js"),
  "utf8"
);

const background = fs.readFileSync(
  path.join(__dirname, "../../extension/src/background/service-worker.js"),
  "utf8"
);

const manifest = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../extension/manifest.json"),
    "utf8"
  )
);

const checks = [
  [
    "no default comments in constants",
    /comments:\s*\[\s*\]/.test(constants)
  ],
  [
    "no default comments in background",
    /comments:\s*\[\s*\]/.test(background)
  ],
  [
    "placeholder examples exist",
    panel.includes("Digite um comentário por linha. Exemplo:")
  ],
  [
    "save comments button exists",
    panel.includes('id="comments-save"')
  ],
  [
    "save handler persists settings",
    panel.includes('"comments-save")?.addEventListener') &&
    panel.includes("await saveSettings()")
  ],
  [
    "start saves current list",
    panel.includes("Adicione e salve pelo menos um comentário")
  ],
  [
    "sequential order exists",
    controller.includes("this.commentIndex % comments.length")
  ],
  [
    "random selection absent",
    !controller.includes("Math.floor(Math.random() * comments.length)")
  ],
  [
    "advance only after success",
    controller.includes("if (result.ok)") &&
    controller.includes("(this.commentIndex + 1) % comments.length")
  ],
  [
    "version is 2.5.1",
    manifest.version === "2.5.1"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log("All v2.5.1 comment persistence tests passed.");
