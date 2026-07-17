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

const css = fs.readFileSync(
  path.join(
    __dirname,
    "../../extension/src/sidepanel/styles.css"
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

const successBlock =
  core.slice(
    core.indexOf("if (result.ok)"),
    core.indexOf('notifyCommentEvent(\n      "comment-failed"')
  );

const checks = [
  [
    "comments use fixed sequence",
    core.includes("commentList[selectedIndex]") &&
    core.includes("(selectedIndex + 1)")
  ],
  [
    "index advances inside success block",
    successBlock.includes("commentIndex =")
  ],
  [
    "minimum and maximum are respected",
    core.includes("selectNextDelay") &&
    core.includes("random(minimum, maximum)")
  ],
  [
    "progress interval exists",
    core.includes('"comment-progress"') &&
    core.includes("commentProgressInterval")
  ],
  [
    "failed comment retries same position",
    core.includes("retryDelaySeconds: 3")
  ],
  [
    "unrelated settings do not restart comments",
    core.includes("commentConfigurationSignature")
  ],
  [
    "sidepanel progress bar exists",
    app.includes("comment-progress-bar") &&
    css.includes(".comment-progress-bar")
  ],
  [
    "timer and ending module remain present",
    core.includes(".arco-icon-im_close_chat")
  ],
  [
    "version 5.0.1",
    manifest.version === "5.0.1"
  ]
];

let failed = 0;

for (const [name, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) failed++;
}

if (failed) process.exit(1);

console.log("All v5.0.1 sequential comment tests passed.");
