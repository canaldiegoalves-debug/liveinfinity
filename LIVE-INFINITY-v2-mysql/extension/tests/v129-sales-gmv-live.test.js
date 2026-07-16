const fs = require("fs");
const path = require("path");

const detector = fs.readFileSync(path.join(__dirname, "../src/content/detector.js"), "utf8");
const panel = fs.readFileSync(path.join(__dirname, "../src/sidepanel/app.js"), "utf8");

const checks = [
  ["DOM metric reader", detector.includes("readMetricFromDom(labels)")],
  ["sales labels expanded", detector.includes("Vendas realizadas")],
  ["GMV labels expanded", detector.includes("Valor vendido")],
  ["Brazilian currency parser", detector.includes('replace(",", ".")')],
  ["sales keep last valid value", detector.includes("Number(this.state.sales) || 0")],
  ["GMV updates only with valid reading", detector.includes("if (gmvMetric !== null && gmvMetric !== undefined)")],
  ["GMV formatted in pt-BR", panel.includes('toLocaleString("pt-BR"')]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}
if (failed) process.exit(1);
console.log("All v1.2.9 tests passed.");
