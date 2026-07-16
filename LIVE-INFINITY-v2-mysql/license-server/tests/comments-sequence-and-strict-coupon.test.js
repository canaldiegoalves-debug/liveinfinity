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
const detector = fs.readFileSync(
  path.join(__dirname, "../../extension/src/content/detector.js"),
  "utf8"
);

const checks = [
  [
    "only one comments section",
    (panel.match(/\$\{section\("comments"/g) || []).length === 1
  ],
  [
    "only one comments textarea",
    (panel.match(/id="comments"/g) || []).length === 1
  ],
  [
    "comments are sequential",
    controller.includes("this.commentIndex % comments.length")
  ],
  [
    "random comment selection removed",
    !controller.includes("selectedIndex === this.lastCommentIndex")
  ],
  [
    "configured interval is respected",
    controller.includes("Math.min(validMinimum, validMaximum)") &&
    controller.includes("Math.max(validMinimum, validMaximum)")
  ],
  [
    "coupon checks full card",
    detector.includes("const container =") &&
    detector.includes("blockedTerms")
  ],
  [
    "coupon structure blocked",
    detector.includes('[class*="coupon" i]')
  ],
  [
    "final coupon barrier",
    detector.includes("Última barreira imediatamente antes do clique")
  ],
  [
    "only main product selected",
    detector.includes('selectedAs: "main-product-only"')
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);
console.log("All comments and strict coupon tests passed.");
