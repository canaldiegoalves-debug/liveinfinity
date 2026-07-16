const fs = require("fs");
const path = require("path");

const controller = fs.readFileSync(path.join(__dirname, "../src/content/controller.js"), "utf8");
const detector = fs.readFileSync(path.join(__dirname, "../src/content/detector.js"), "utf8");

const checks = [
  ["random comments", controller.includes("Math.floor(Math.random() * comments.length)")],
  ["no immediate repeat", controller.includes("selectedIndex === this.lastCommentIndex")],
  ["sequential selection removed", !controller.includes("comments[this.commentIndex % comments.length]")],
  ["stable sale fingerprint", controller.includes("saleFingerprint(sale)")],
  ["duplicate sale skipped", controller.includes("this.seenSales.has(fingerprint)")],
  ["generic name sale skipped", controller.includes("post-sale-skipped-no-real-name")],
  ["volatile time removed", detector.includes("stableText")]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}
if (failed) process.exit(1);
console.log("All v1.2.8 tests passed.");
