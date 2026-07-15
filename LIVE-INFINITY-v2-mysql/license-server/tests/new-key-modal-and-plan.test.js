const fs=require("fs");
const path=require("path");

const server=fs.readFileSync(path.join(__dirname,"../server.js"),"utf8");
const admin=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");

const checks=[
  ["new key modal exists",/function newKeyModalHtml/.test(admin)],
  ["new key modal create action",/confirm-create-account-key/.test(admin)],
  ["new key no longer redirects",/pendingNewKeyAccount/.test(admin)],
  ["change plan button exists",/change-account-plan/.test(admin)],
  ["account plan endpoint exists",/\/api\/admin\/accounts\/\(\.\+\)\/plan/.test(server) || /accountPlanMatch/.test(server)],
  ["downgrade limit validation exists",/usedKeys > definition\.keyLimit/.test(server)],
  ["all account licenses update plan",/UPDATE licenses SET plan=\? WHERE account_email=\?/.test(server)]
];

let failed=0;
for(const [name,passed] of checks){
  console.log(`${passed?"PASS":"FAIL"} ${name}`);
  if(!passed)failed++;
}
if(failed)process.exit(1);
console.log("All new-key modal and plan tests passed.");
