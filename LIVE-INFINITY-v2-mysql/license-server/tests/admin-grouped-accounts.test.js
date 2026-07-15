const fs=require("fs");
const path=require("path");

const server=fs.readFileSync(path.join(__dirname,"../server.js"),"utf8");
const admin=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");

const checks=[
  ["accounts include grouped keys",/keys,\s*createdAt/.test(server)],
  ["admin account cards exist",/customer-account-card/.test(admin)],
  ["new key button exists",/create-key-for-account/.test(admin)],
  ["limit button exists",/Limite atingido/.test(admin)],
  ["copy key action exists",/copy-account-key/.test(admin)],
  ["release device action exists",/release-account-device/.test(admin)],
  ["release route exists",/release-device/.test(server)],
  ["admin-only routes remain protected",/url\.pathname\.startsWith\("\/api\/admin\/"\)/.test(server)]
];

let failed=0;
for(const [name,passed] of checks){
  console.log(`${passed?"PASS":"FAIL"} ${name}`);
  if(!passed)failed++;
}
if(failed)process.exit(1);
console.log("All grouped account tests passed.");
