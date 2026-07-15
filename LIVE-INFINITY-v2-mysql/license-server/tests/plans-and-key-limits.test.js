const fs=require("fs");
const path=require("path");

const server=fs.readFileSync(path.join(__dirname,"../server.js"),"utf8");
const admin=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");
const schema=fs.readFileSync(path.join(__dirname,"../schema.sql"),"utf8");
const packageJson=fs.readFileSync(path.join(__dirname,"../package.json"),"utf8");

const checks=[
  ["basic plan is R$97",/monthlyPrice: 97/.test(server)],
  ["pro plan is R$147",/monthlyPrice: 147/.test(server)],
  ["premium plan is R$197",/monthlyPrice: 197/.test(server)],
  ["basic key limit is one",/keyLimit: 1/.test(server)],
  ["pro key limit is two",/keyLimit: 2/.test(server)],
  ["premium key limit is unlimited",/keyLimit: null/.test(server)],
  ["account table exists",/customer_accounts/.test(schema)],
  ["premium enum exists",/'premium'/.test(schema)],
  ["key usage is enforced",/usedKeys >= accountPlan\.keyLimit/.test(server)],
  ["admin shows premium",/Premium — R\$ 197/.test(admin)],
  ["admin loads accounts",/\/api\/admin\/accounts/.test(admin)],
  ["migration script registered",/db:migrate-plans/.test(packageJson)]
];

let failed=0;
for(const [name,passed] of checks){
  console.log(`${passed?"PASS":"FAIL"} ${name}`);
  if(!passed)failed+=1;
}
if(failed)process.exit(1);
console.log("All plans and key limit tests passed.");
