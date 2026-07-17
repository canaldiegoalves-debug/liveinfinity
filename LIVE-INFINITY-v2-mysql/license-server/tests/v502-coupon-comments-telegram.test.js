const fs = require("fs");
const path = require("path");

const core = fs.readFileSync(
  path.join(
    __dirname,
    "../../extension/src/content/liveflow-core.js"
  ),
  "utf8"
);

const app = fs.readFileSync(
  path.join(
    __dirname,
    "../../extension/src/sidepanel/app.js"
  ),
  "utf8"
);

const background = fs.readFileSync(
  path.join(
    __dirname,
    "../../extension/src/background/service-worker.js"
  ),
  "utf8"
);

const manifest = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "../../extension/manifest.json"
    ),
    "utf8"
  )
);

const checks = [
  [
    "coupon rule is mandatory",
    app.includes(
      "Proteção obrigatória"
    ) &&
    app.includes(
      'id="skip-coupons"'
    ) &&
    app.includes("disabled")
  ],
  [
    "coupon classifier is strict",
    core.includes(
      "frete grátis"
    ) &&
    core.includes(
      "shipping voucher"
    )
  ],
  [
    "main product requires score",
    core.includes(
      "productScore"
    ) &&
    core.includes(
      "item.score >= 5"
    )
  ],
  [
    "progress starts on click",
    app.includes(
      "A barra começa imediatamente no clique"
    ) &&
    app.includes(
      'kind:"comment-progress"'
    )
  ],
  [
    "LiveFlow Telegram layout",
    app.includes(
      "Telegram configurado!"
    ) &&
    app.includes(
      "Notificar novas vendas"
    ) &&
    app.includes(
      "Notificar violações"
    ) &&
    app.includes(
      "Notificar início/fim de live"
    )
  ],
  [
    "Telegram edit and test",
    app.includes(
      '"edit-telegram"'
    ) &&
    app.includes(
      "Testar notificação agora"
    )
  ],
  [
    "Telegram categories saved",
    background.includes(
      "telegramSalesEnabled"
    ) &&
    background.includes(
      "telegramViolationEnabled"
    ) &&
    background.includes(
      "telegramStatusEnabled"
    )
  ],
  [
    "timer and ending preserved",
    core.includes(
      ".arco-icon-im_close_chat"
    )
  ],
  [
    "version 5.0.2",
    manifest.version === "5.0.2"
  ]
];

let failed = 0;

for (
  const [name, passed]
  of checks
) {
  console.log(
    `${passed ? "PASS" : "FAIL"} ${name}`
  );

  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log(
  "All v5.0.2 tests passed."
);
