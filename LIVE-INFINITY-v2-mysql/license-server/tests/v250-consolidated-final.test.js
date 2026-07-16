const fs=require("fs"),path=require("path");
const panel=fs.readFileSync(path.join(__dirname,"../../extension/src/sidepanel/app.js"),"utf8");
const css=fs.readFileSync(path.join(__dirname,"../../extension/src/sidepanel/styles.css"),"utf8");
const controller=fs.readFileSync(path.join(__dirname,"../../extension/src/content/controller.js"),"utf8");
const detector=fs.readFileSync(path.join(__dirname,"../../extension/src/content/detector.js"),"utf8");
const admin=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");
const adminHtml=fs.readFileSync(path.join(__dirname,"../public/index.html"),"utf8");
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,"../../extension/manifest.json"),"utf8"));
const count=(t,s)=>(t.match(new RegExp(s,"g"))||[]).length;
const checks=[
["one comments",count(panel,'\\$\\{section\\("comments"')===1],
["one telegram",count(panel,'\\$\\{section\\("telegram"')===1],
["one protection",count(panel,'\\$\\{section\\("protection"')===1],
["timer red",panel.includes("timerRemaining<=599")&&css.includes(".timer-clock.timer-critical")],
["authoritative sales",detector.includes("metricSales !== null")&&!detector.includes("events.length,")],
["social proof",controller.includes("{salesCount}")&&controller.includes("postSaleTimer")],
["power icon",detector.includes("toolbarHasTimer")&&detector.includes("botão de energia")],
["native click",detector.includes('new MouseEvent("mousedown"')],
["admin updates",admin.includes("function updatesPage()")&&adminHtml.includes('data-page="updates"')],
["version",manifest.version==="2.5.0"]
];
let failed=0;for(const[n,p]of checks){console.log(`${p?"PASS":"FAIL"} ${n}`);if(!p)failed++}
if(failed)process.exit(1);console.log("All v2.5.0 tests passed.");
