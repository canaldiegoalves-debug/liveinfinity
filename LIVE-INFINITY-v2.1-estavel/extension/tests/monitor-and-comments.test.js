const fs=require("fs");
const path=require("path");

const controller=fs.readFileSync(
  path.join(__dirname,"../src/content/controller.js"),
  "utf8"
);

const detector=fs.readFileSync(
  path.join(__dirname,"../src/content/detector.js"),
  "utf8"
);

const checks=[
  ["overlay watcher intentionally removed",!/ensureProductVisible/.test(controller)],
  ["forced refresh remains 20 seconds",/refreshProductCycle\("scheduled-20s"\)[\s\S]*}, 20000\)/.test(controller)],
  ["unpin button is the pin-state source",/findUnpinButton/.test(detector)],
  ["chat input checks data-placeholder",/data-placeholder/.test(detector)],
  ["chat sending uses native textarea setter",/HTMLTextAreaElement\.prototype/.test(detector)],
  ["random comment delay is retained",/Math\.floor\(Math\.random\(\)\s*\*\s*\(maximum - minimum \+ 1\)\)\s*\+\s*minimum/.test(controller)],
  ["failed comments retry",/await OrionDetector\.wait\(900\)/.test(controller)]
];

let failed=0;
for(const [name,passed] of checks){
  console.log(`${passed?"PASS":"FAIL"} ${name}`);
  if(!passed)failed+=1;
}

if(failed)process.exit(1);
console.log("All stable monitor and comment tests passed.");
