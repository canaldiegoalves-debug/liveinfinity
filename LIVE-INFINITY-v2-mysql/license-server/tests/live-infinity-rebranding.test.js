const fs=require("fs");
const path=require("path");

const manifest=fs.readFileSync(path.join(__dirname,"../../extension/manifest.json"),"utf8");
const extension=fs.readFileSync(path.join(__dirname,"../../extension/src/sidepanel/app.js"),"utf8");
const admin=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"../public/index.html"),"utf8");
const server=fs.readFileSync(path.join(__dirname,"../server.js"),"utf8");

const checks=[
  ["extension renamed",/Live Infinity/.test(manifest)],
  ["extension uses branded logo",/live-infinity-icon/.test(extension)],
  ["admin dashboard exists",/Dashboard/.test(html)],
  ["finance page exists",/Faturamento/.test(html)&&/financePage/.test(admin)],
  ["users page exists",/Usuários/.test(html)&&/usersPage/.test(admin)],
  ["reports page exists",/Relatórios/.test(html)&&/reportsPage/.test(admin)],
  ["support page exists",/Suporte/.test(html)&&/supportPage/.test(admin)],
  ["support API exists",/\/api\/admin\/support/.test(server)],
  ["financial fields exist",/amountPaid/.test(server)&&/paymentMethod/.test(server)],
  ["new key prefix exists",/LIVEINF-PRO/.test(server)]
];

let failed=0;
for(const [name,passed] of checks){
  console.log(`${passed?"PASS":"FAIL"} ${name}`);
  if(!passed)failed+=1;
}
if(failed)process.exit(1);
console.log("All Live Infinity rebranding tests passed.");
