const fs=require("fs");
const path=require("path");

const panel=fs.readFileSync(
  path.join(__dirname,"../../extension/src/sidepanel/app.js"),
  "utf8"
);
const manifest=JSON.parse(fs.readFileSync(
  path.join(__dirname,"../../extension/manifest.json"),
  "utf8"
));
const server=fs.readFileSync(path.join(__dirname,"../server.js"),"utf8");
const adminHtml=fs.readFileSync(path.join(__dirname,"../public/index.html"),"utf8");
const adminApp=fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");

const adminPermissionCount=manifest.host_permissions.filter(
  item=>item==="https://admin.valoranegocios.com.br/*"
).length;

const checks=[
  ["new Telegram save",panel.includes('"save-telegram")?.addEventListener')],
  ["old Telegram removed",!panel.includes('"tg-save")?.addEventListener')],
  ["Telegram persistence",panel.includes("state.settings.telegramToken=token")&&panel.includes("state.settings.telegramChatId=chatId")],
  ["Telegram test",panel.includes("Live Infinity conectado com sucesso!")],
  ["single host permission",adminPermissionCount===1],
  ["secure panel path",server.includes("ADMIN_PANEL_PATH")&&server.includes("serveAdminStatic")],
  ["admin 403",server.includes("json(response, 403")],
  ["login rate limit",server.includes("adminLoginBlocked")&&server.includes("ADMIN_LOGIN_MAX_ATTEMPTS")],
  ["updates nav",adminHtml.includes('data-page="updates"')],
  ["updates page",adminApp.includes("function updatesPage()")&&adminApp.includes("updates: updatesPage")],
  ["version",manifest.version==="2.5.2"]
];

let failed=0;
for(const[name,passed]of checks){
  console.log(`${passed?"PASS":"FAIL"} ${name}`);
  if(!passed)failed++;
}
if(failed)process.exit(1);
console.log("All v2.5.2 tests passed.");
