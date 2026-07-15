const fs = require("fs");
const path = require("path");

const controller = fs.readFileSync(
  path.join(__dirname, "../src/content/controller.js"),
  "utf8"
);
const detector = fs.readFileSync(
  path.join(__dirname, "../src/content/detector.js"),
  "utf8"
);

const checks = [
  [
    "first comment waits for configured interval",
    /configureComments\(\)[\s\S]*this\.commentIndex = 0;[\s\S]*this\.scheduleNextComment\(\)/.test(controller)
  ],
  [
    "immediate first comment function removed",
    !/sendFirstCommentAndSchedule/.test(controller)
  ],
  [
    "configured minimum and maximum are used",
    /configuredMinimum[\s\S]*configuredMaximum[\s\S]*seconds \*/.test(controller)
  ],
  [
    "coupon fallback removed",
    !/\(eligible\.length \? eligible : ranked\)/.test(detector)
  ],
  [
    "only coupon result returns failure",
    /Cupons foram ignorados/.test(detector)
  ],
  [
    "coupon promotional code detection exists",
    /código promocional\|codigo promocional/.test(detector)
  ]
];

let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);
console.log("All v1.2.4 regression tests passed.");
