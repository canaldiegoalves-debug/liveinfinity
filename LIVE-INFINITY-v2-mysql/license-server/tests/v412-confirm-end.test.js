const fs = require("fs");
const path = require("path");

const detector = fs.readFileSync(
  path.join(__dirname, "../../extension/src/content/detector.js"),
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
    "confirm search includes role button",
    detector.includes("[role='button']")
  ],
  [
    "confirm search includes div and span buttons",
    detector.includes("div[class*='button']") &&
    detector.includes("span[class*='button']")
  ],
  [
    "confirm exact text supported",
    detector.includes("confirmar|encerrar agora|sim|end now|confirm")
  ],
  [
    "modal polling loop",
    detector.includes("Date.now() + 12000") &&
    detector.includes("await this.wait(150)")
  ],
  [
    "mouse events before click",
    detector.includes('new MouseEvent("mousedown"') &&
    detector.includes('new MouseEvent("mouseup"')
  ],
  [
    "version 4.1.2",
    manifest.version === "4.1.2"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log("All v4.1.2 confirmation tests passed.");
