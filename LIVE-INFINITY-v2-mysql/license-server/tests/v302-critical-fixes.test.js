const fs=require("fs"),path=require("path");
const detector=fs.readFileSync(path.join(__dirname,"../../extension/src/content/detector.js"),"utf8");
const controller=fs.readFileSync(path.join(__dirname,"../../extension/src/content/controller.js"),"utf8");
const background=fs.readFileSync(path.join(__dirname,"../../extension/src/background/service-worker.js"),"utf8");
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,"../../extension/manifest.json"),"utf8"));

const checks=[
["telegram token raw",background.includes("bot${cleanToken}/sendMessage")&&!background.includes("encodeURIComponent(token)")],
["telegram validation",background.includes("Token do Bot inválido")],
["send button",detector.includes("findSendButton")],
["rpc detection",detector.includes("RPC call error")],
["3 retries",controller.includes("attempt<=3")],
["same comment remains",controller.includes("o mesmo comentário permanece na fila")],
["timer emergency",controller.includes("startEmergencyEndLoop")],
["warning retries",detector.includes("warningRetry")],
["version",manifest.version==="3.0.2"]
];

let failed=0;
for(const[n,p]of checks){console.log(`${p?"PASS":"FAIL"} ${n}`);if(!p)failed++}
if(failed)process.exit(1);
console.log("All v3.0.2 tests passed.");
