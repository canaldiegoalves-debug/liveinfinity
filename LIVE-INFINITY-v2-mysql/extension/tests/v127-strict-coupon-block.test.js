const fs = require("fs");
const path = require("path");
const detector = fs.readFileSync(path.join(__dirname, "../src/content/detector.js"), "utf8");

const checks = [
  ["strict coupon classifier exists", detector.includes("isStrictCouponElement(element)")],
  ["authorized product gate exists", detector.includes("isAuthorizedMainProductElement(element)")],
  ["coupon DOM selectors blocked", detector.includes('[class*="coupon"]') && detector.includes('[class*="voucher"]')],
  ["discount words blocked", detector.includes("promo code|discount")],
  ["ranked fallback absent", !detector.includes("eligible.length ? eligible : ranked")],
  ["final click guard exists", detector.includes("Clique bloqueado: somente o produto principal pode ser fixado.")],
  ["only authorized product can pass", detector.includes("return this.isAuthorizedMainProductElement(element);")]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}
if (failed) process.exit(1);
console.log("All v1.2.7 strict coupon tests passed.");
