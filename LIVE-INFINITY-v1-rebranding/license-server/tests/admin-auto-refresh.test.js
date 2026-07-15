const fs=require("fs");
const path=require("path");

const app=fs.readFileSync(
  path.join(__dirname,"../public/app.js"),
  "utf8"
);

const checks=[
  ["automatic refresh function exists",/function startAutoRefresh/.test(app)],
  ["refresh interval is four seconds",/}, 4000\)/.test(app)],
  ["silent polling exists",/loadData\(\{ silent: true \}\)/.test(app)],
  ["refresh timer exists",/refreshTimer/.test(app)],
  ["overlap guard exists",/state\.loading/.test(app)]
];

let failed=0;
for(const [name,passed] of checks){
  console.log(`${passed?"PASS":"FAIL"} ${name}`);
  if(!passed)failed+=1;
}

if(failed)process.exit(1);
console.log("All admin auto-refresh tests passed.");
