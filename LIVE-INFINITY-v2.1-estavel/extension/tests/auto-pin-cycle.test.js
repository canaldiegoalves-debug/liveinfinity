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
  ["interval is 20 seconds",/refreshProductCycle\("scheduled-20s"\)[\s\S]*}, 20000\)/.test(controller)],
  ["cycle calls refreshPinnedProduct",/OrionDetector\.refreshPinnedProduct/.test(controller)],
  ["detector finds Desafixar",/findUnpinButton\(\)/.test(detector)],
  ["detector clicks unpin before pin",/unpin\.element\.click\(\)[\s\S]*this\.pinMainProduct/s.test(detector)],
  ["overlap guard exists",/autoPinBusy/.test(controller)]
];

let failed=0;
for(const [name,passed] of checks){
  console.log(`${passed?"PASS":"FAIL"} ${name}`);
  if(!passed)failed+=1;
}

if(failed)process.exit(1);
console.log("All automatic pin cycle tests passed.");
