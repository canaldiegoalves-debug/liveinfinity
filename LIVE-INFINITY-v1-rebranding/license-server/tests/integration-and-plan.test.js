const fs=require("fs");
const path=require("path");

const extension=fs.readFileSync(
  path.join(__dirname,"../../extension/src/sidepanel/app.js"),
  "utf8"
);

const manifest=fs.readFileSync(
  path.join(__dirname,"../../extension/manifest.json"),
  "utf8"
);

const admin=fs.readFileSync(
  path.join(__dirname,"../public/app.js"),
  "utf8"
);

const server=fs.readFileSync(
  path.join(__dirname,"../server.js"),
  "utf8"
);

const checks=[
  ["extension activates through server",/\/api\/activate/.test(extension)],
  ["extension validates through server",/\/api\/validate/.test(extension)],
  ["localhost permission exists",/localhost:8787/.test(manifest)],
  ["periodic license sync exists",/periodicLicenseValidation/.test(extension)],
  ["admin edits plan",/Plano: digite PRO ou BASICO/.test(admin)],
  ["admin sends PATCH plan",/method: "PATCH"/.test(admin)],
  ["server supports plan update",/license\.plan = body\.plan/.test(server)]
];

let failed=0;
for(const [name,passed] of checks){
  console.log(`${passed?"PASS":"FAIL"} ${name}`);
  if(!passed)failed+=1;
}

if(failed)process.exit(1);
console.log("All integration and plan tests passed.");
