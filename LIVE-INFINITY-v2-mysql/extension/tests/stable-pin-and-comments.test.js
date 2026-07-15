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
  ["no one-second overlay watcher", !/ensureProductVisible/.test(controller)],
  ["twenty-second pin cycle remains", /setInterval\(\(\) => \{\s*this\.refreshProductCycle\("scheduled-20s"\);\s*\}, 20000\)/s.test(controller)],
  ["unpin button is source of truth", /const unpin = this\.findUnpinButton\(\)/.test(detector)],
  ["unpin before pin", /unpin\.element\.click\(\)[\s\S]*this\.pinMainProduct/s.test(detector)],
  ["first comment sends immediately", /sendFirstCommentAndSchedule/.test(controller)],
  ["comments are sequential", /comments\[this\.commentIndex % comments\.length\]/.test(controller)],
  ["random interval remains", /Math\.floor\(Math\.random\(\) \* \(maximum - minimum \+ 1\)\) \+ minimum/.test(controller)],
  ["native textarea setter exists", /HTMLTextAreaElement\.prototype/.test(detector)],
  ["composition events exist", /CompositionEvent/.test(detector)]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed += 1;
}

if (failed) process.exit(1);
console.log("All stable pin and comment tests passed.");
