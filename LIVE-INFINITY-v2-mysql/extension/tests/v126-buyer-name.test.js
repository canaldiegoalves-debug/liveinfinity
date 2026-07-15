const fs = require("fs");
const path = require("path");

const detector = fs.readFileSync(path.join(__dirname, "../src/content/detector.js"), "utf8");
const controller = fs.readFileSync(path.join(__dirname, "../src/content/controller.js"), "utf8");

const checks = [
  ["sale event stores buyerName", detector.includes("buyerName,")],
  ["buyer selectors are searched", detector.includes('[class*="buyer"]') && detector.includes('[class*="username"]')],
  ["generic Cliente 1 is rejected", detector.includes("cliente\\s*\\d+") && controller.includes("cliente\\s*\\d+")],
  ["controller prioritizes structured buyerName", controller.includes("sale.buyerName")],
  ["neutral fallback removes placeholder", controller.includes('.replace(/\\{nome\\}/gi, "")')],
  ["old cliente fallback removed", !controller.includes('||\\n          "cliente";')]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}
if (failed) process.exit(1);
console.log("All v1.2.6 buyer name tests passed.");
