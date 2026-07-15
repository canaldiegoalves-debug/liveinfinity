const fs=require("fs"),path=require("path");
const server=fs.readFileSync(path.join(__dirname,"../server.js"),"utf8");
const admin=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");
const schema=fs.readFileSync(path.join(__dirname,"../schema.sql"),"utf8");
const checks=[
["account_email",/account_email/.test(schema)],
["access_email",/access_email/.test(schema)],
["unique access",/uq_licenses_access_email/.test(schema)],
["suggestion server",/suggestedAccessEmail/.test(server)],
["purchase field",/new-account-email/.test(admin)],
["access field",/new-access-email/.test(admin)],
["new key button",/create-key-for-account/.test(admin)]
];
let failed=0;
for(const [n,p] of checks){console.log(`${p?"PASS":"FAIL"} ${n}`);if(!p)failed++;}
if(failed)process.exit(1);
console.log("All account/access tests passed.");
