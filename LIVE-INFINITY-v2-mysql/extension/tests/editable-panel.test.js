const fs=require("fs");
const path=require("path");

const app=fs.readFileSync(
  path.join(__dirname,"../src/sidepanel/app.js"),
  "utf8"
);

const checks=[
  ["editing detector exists",/function isEditingPanel/.test(app)],
  ["safe render exists",/function renderWhenSafe/.test(app)],
  ["partial field update exists",/function updateLiveFields/.test(app)],
  ["state update uses partial update",/state\.live=message\.payload;[\s\S]*updateLiveFields\(\)/.test(app)],
  ["focusout applies pending render",/app\.addEventListener\("focusout"/.test(app)],
  ["sales field is dynamic",/data-live-value="sales"/.test(app)],
  ["elapsed field is dynamic",/data-live-value="elapsed"/.test(app)]
];

let failed=0;
for(const [name,passed] of checks){
  console.log(`${passed?"PASS":"FAIL"} ${name}`);
  if(!passed)failed+=1;
}
if(failed)process.exit(1);
console.log("All editable panel tests passed.");
