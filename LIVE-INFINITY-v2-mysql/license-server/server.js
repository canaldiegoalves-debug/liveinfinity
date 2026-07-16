require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { pool, testConnection } = require("./db");

const PORT = Number(process.env.PORT || 8787);
const SERVER_VERSION = require("./package.json").version;
const HOST = process.env.HOST || "127.0.0.1";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const PUBLIC_DIR = path.join(__dirname, "public");
const UPDATES_DIR = path.join(__dirname, "updates");

const ADMIN_PANEL_PATH = (
  process.env.ADMIN_PANEL_PATH ||
  "/painel-seguro-liveinfinity"
).replace(/\/+$/, "");

const adminLoginAttempts = new Map();
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 8;

function requestIp(request) {
  return String(
    request.headers["x-forwarded-for"] ||
    request.socket?.remoteAddress ||
    "unknown"
  ).split(",")[0].trim();
}

function adminLoginBlocked(request) {
  const ip = requestIp(request);
  const now = Date.now();
  const entry = adminLoginAttempts.get(ip);

  if (!entry || now - entry.startedAt > ADMIN_LOGIN_WINDOW_MS) {
    adminLoginAttempts.set(ip, { count: 0, startedAt: now });
    return false;
  }

  return entry.count >= ADMIN_LOGIN_MAX_ATTEMPTS;
}

function registerAdminLoginFailure(request) {
  const ip = requestIp(request);
  const now = Date.now();
  const entry = adminLoginAttempts.get(ip);

  if (!entry || now - entry.startedAt > ADMIN_LOGIN_WINDOW_MS) {
    adminLoginAttempts.set(ip, { count: 1, startedAt: now });
    return;
  }

  entry.count += 1;
  adminLoginAttempts.set(ip, entry);
}

function clearAdminLoginFailures(request) {
  adminLoginAttempts.delete(requestIp(request));
}

fs.mkdirSync(UPDATES_DIR, { recursive: true });

const CAKTO_CAPTURE_ONLY =
  String(process.env.CAKTO_CAPTURE_ONLY || "true").toLowerCase() !== "false";

const CAKTO_WEBHOOK_SECRET = process.env.CAKTO_WEBHOOK_SECRET || "";

const CAKTO_CHECKOUT_MAP = Object.freeze({
  [process.env.CAKTO_CHECKOUT_BASIC || "3477jz3_976117"]: "basic",
  [process.env.CAKTO_CHECKOUT_PRO || "387ye5s_982831"]: "pro",
  [process.env.CAKTO_CHECKOUT_PREMIUM || "3b3y7bp_982839"]: "premium"
});

function nestedValue(object, paths) {
  for (const candidate of paths) {
    const parts = candidate.split(".");
    let value = object;

    for (const part of parts) {
      value = value?.[part];
    }

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function findPlanInPayload(body) {
  const serialized = JSON.stringify(body);

  for (const [code, plan] of Object.entries(CAKTO_CHECKOUT_MAP)) {
    if (code && serialized.includes(code)) return plan;
  }

  return null;
}

function caktoEventData(body) {
  const eventType = String(nestedValue(body, [
    "event",
    "event_type",
    "type",
    "custom_id",
    "data.event",
    "data.custom_id"
  ]) || "").toLowerCase();

  const offerId = String(nestedValue(body, [
    "offer.id",
    "offer_id",
    "data.offer.id",
    "data.offer_id",
    "order.offer.id",
    "data.order.offer.id"
  ]) || "");

  const orderId = String(nestedValue(body, [
    "order.id",
    "order_id",
    "data.order.id",
    "data.id",
    "id"
  ]) || "");

  const email = normalizeEmail(nestedValue(body, [
    "customer.email",
    "buyer.email",
    "order.customer.email",
    "data.customer.email",
    "data.buyer.email",
    "data.order.customer.email",
    "email"
  ]));

  const paymentStatus = String(nestedValue(body, [
    "order.status",
    "status",
    "data.order.status",
    "data.status"
  ]) || "").toLowerCase();

  const eventId = String(nestedValue(body, [
    "event_id",
    "event.id",
    "data.event_id",
    "data.event.id"
  ]) || `${orderId || "no-order"}:${eventType || paymentStatus || "unknown"}`);

  return { eventId, eventType, offerId, orderId, email, paymentStatus };
}

function caktoSecretFromRequest(request, url, body) {
  return String(
    request.headers["x-cakto-secret"] ||
    url.searchParams.get("secret") ||
    body?.secret ||
    ""
  );
}


const PLAN_CATALOG = Object.freeze({
  basic: {
    code: "basic",
    name: "Básico",
    monthlyPrice: 97,
    keyLimit: 1
  },
  pro: {
    code: "pro",
    name: "PRO",
    monthlyPrice: 147,
    keyLimit: 2
  },
  premium: {
    code: "premium",
    name: "Premium",
    monthlyPrice: 197,
    keyLimit: null
  }
});

function normalizePlan(value) {
  return Object.prototype.hasOwnProperty.call(PLAN_CATALOG, value)
    ? value
    : "basic";
}

function planDefinition(value) {
  return PLAN_CATALOG[normalizePlan(value)];
}

async function upsertCustomerAccount(email, plan) {
  const definition = planDefinition(plan);

  await pool.execute(
    `INSERT INTO customer_accounts
      (email,plan,monthly_price,key_limit)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE
       plan=VALUES(plan),
       monthly_price=VALUES(monthly_price),
       key_limit=VALUES(key_limit)`,
    [
      email,
      definition.code,
      definition.monthlyPrice,
      definition.keyLimit
    ]
  );

  return definition;
}

async function accountKeyUsage(email) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM licenses
     WHERE account_email=? AND active=1`,
    [email]
  );

  return Number(rows[0]?.total || 0);
}




function sanitizeVersion(value) {
  const version = String(value || "").trim().replace(/^v/i, "");
  return /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(version)
    ? version
    : null;
}

function compareVersions(left, right) {
  const a = String(left || "0.0.0").split("-")[0].split(".").map(Number);
  const b = String(right || "0.0.0").split("-")[0].split(".").map(Number);

  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

function safeUpdateFileName(version) {
  return `live-infinity-${String(version).replace(/[^a-z0-9.-]/gi, "-")}.zip`;
}

async function ensureUpdatesTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS extension_updates (
      id CHAR(36) PRIMARY KEY,
      version VARCHAR(40) NOT NULL UNIQUE,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      changelog TEXT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_size BIGINT NOT NULL DEFAULT 0,
      mandatory TINYINT(1) NOT NULL DEFAULT 1,
      published TINYINT(1) NOT NULL DEFAULT 0,
      published_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_extension_updates_published (published,published_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

function rowToUpdate(row, request = null) {
  if (!row) return null;

  const host = request?.headers?.host || "";
  const protocol = String(request?.headers?.["x-forwarded-proto"] || "https")
    .split(",")[0]
    .trim();

  return {
    id: row.id,
    version: row.version,
    title: row.title,
    description: row.description || "",
    changelog: row.changelog || "",
    mandatory: Boolean(row.mandatory),
    published: Boolean(row.published),
    fileSize: Number(row.file_size || 0),
    publishedAt: toIso(row.published_at),
    createdAt: toIso(row.created_at),
    downloadUrl: host
      ? `${protocol}://${host}/api/updates/download/${encodeURIComponent(row.id)}`
      : `/api/updates/download/${encodeURIComponent(row.id)}`
  };
}

async function latestPublishedUpdate(request = null) {
  const [rows] = await pool.execute(
    `SELECT *
     FROM extension_updates
     WHERE published=1
     ORDER BY published_at DESC,created_at DESC
     LIMIT 1`
  );

  return rowToUpdate(rows[0] || null, request);
}


function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function text(response, status, content, type = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(content);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";

    request.on("data", chunk => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Payload muito grande."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("JSON inválido."));
      }
    });

    request.on("error", reject);
  });
}

function splitEmail(value) {
  const email = normalizeEmail(value);
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;
  return { local: email.slice(0, at), domain: email.slice(at + 1) };
}

function suggestedAccessEmail(accountEmail, position) {
  const parts = splitEmail(accountEmail);
  if (!parts) return "";
  if (position <= 1) return accountEmail;
  return `${parts.local}+acesso${position}@${parts.domain}`;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function adminToken() {
  return Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString("base64");
}

function adminAuthorized(request) {
  const authorization = String(request.headers.authorization || "");
  if (!authorization.startsWith("Bearer ")) return false;
  return safeEqual(authorization.slice(7).trim(), adminToken());
}

function generateKey(plan) {
  const random = crypto.randomBytes(10).toString("hex").toUpperCase();
  const prefix =
    plan === "premium"
      ? "LIVEINF-PREMIUM"
      : plan === "pro"
        ? "LIVEINF-PRO"
        : "LIVEINF-BASIC";
  return `${prefix}-${random.slice(0,5)}-${random.slice(5,10)}-${random.slice(10,15)}-${random.slice(15,20)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function rowToLicense(row) {
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const remainingDays = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000))
    : Number(row.duration_days);

  let status = row.status;
  if (!row.active || status === "revoked") status = "revoked";
  else if (expiresAt && expiresAt.getTime() <= Date.now()) status = "expired";
  else if (row.activated_at) status = "active";
  else status = "pending";

  return {
    id: row.id,
    email: row.access_email || row.email,
    accountEmail: row.account_email || row.email,
    accessEmail: row.access_email || row.email,
    key: row.license_key,
    plan: row.plan,
    durationDays: Number(row.duration_days),
    active: Boolean(row.active),
    status,
    createdAt: toIso(row.created_at),
    activatedAt: toIso(row.activated_at),
    expiresAt: toIso(row.expires_at),
    remainingDays,
    deviceId: row.device_id || null,
    note: row.note || "",
    amountPaid: Number(row.amount_paid || 0),
    paymentMethod: row.payment_method || "",
    lastValidationAt: toIso(row.last_validation_at),
    planName: planDefinition(row.plan).name,
    monthlyPrice: planDefinition(row.plan).monthlyPrice,
    keyLimit: planDefinition(row.plan).keyLimit
  };
}

async function findLicenseByKey(key) {
  const [rows] = await pool.execute(
    `SELECT
       l.*,
       COALESCE(a.plan,l.plan) AS resolved_plan
     FROM licenses l
     LEFT JOIN customer_accounts a
       ON a.email=COALESCE(l.account_email,l.email)
     WHERE l.license_key=?
     LIMIT 1`,
    [key]
  );

  const row = rows[0] || null;

  if (row?.resolved_plan) {
    row.plan = normalizePlan(row.resolved_plan);
  }

  return row;
}

function validateLicenseRecord(row, email, key, deviceId, deviceFingerprint) {
  if (!row) return { ok: false, error: "Chave não encontrada." };
  if (!row.active || row.status === "revoked") {
    return { ok: false, error: "Esta licença foi bloqueada." };
  }
  if (normalizeEmail(row.access_email || row.email) !== normalizeEmail(email)) {
    return { ok: false, error: "O e-mail não corresponde à chave." };
  }
  if (row.license_key !== String(key || "").trim().toUpperCase()) {
    return { ok: false, error: "Chave inválida." };
  }
  if (row.device_id && deviceId && row.device_id !== deviceId) {
    const sameComputer =
      row.device_fingerprint &&
      deviceFingerprint &&
      safeEqual(row.device_fingerprint, deviceFingerprint);

    if (!sameComputer) {
      return {
        ok: false,
        error: row.device_fingerprint
          ? "Esta chave já está vinculada a outro computador."
          : "Ativação antiga detectada. Libere o PC uma única vez no painel administrativo e tente novamente.",
        legacyDeviceBinding: !row.device_fingerprint
      };
    }
  }
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: "A licença expirou.", expired: true };
  }
  return { ok: true };
}

async function logEvent(request, eventType, licenseId = null, email = null, details = null) {
  try {
    const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const ip = forwarded || request.socket.remoteAddress || null;
    await pool.execute(
      `INSERT INTO audit_logs (event_type,license_id,email,details,ip_address)
       VALUES (?,?,?,?,?)`,
      [eventType, licenseId, email, details ? JSON.stringify(details) : null, ip]
    );
  } catch (error) {
    console.error("Falha ao registrar log:", error.message);
  }
}

function serveAdminStatic(requestPath, response) {
  if (requestPath === ADMIN_PANEL_PATH) {
    response.writeHead(302, {
      Location: `${ADMIN_PANEL_PATH}/`,
      "Cache-Control": "no-store"
    });
    response.end();
    return;
  }

  if (!requestPath.startsWith(`${ADMIN_PANEL_PATH}/`)) {
    text(response, 404, "Página não encontrada.");
    return;
  }

  const relativePath =
    requestPath === `${ADMIN_PANEL_PATH}/`
      ? "/index.html"
      : requestPath.slice(ADMIN_PANEL_PATH.length);

  const safe = path
    .normalize(relativePath)
    .replace(/^(\.\.[/\\])+/, "");

  const filePath = path.join(PUBLIC_DIR, safe);

  if (
    !filePath.startsWith(PUBLIC_DIR) ||
    !fs.existsSync(filePath) ||
    fs.statSync(filePath).isDirectory()
  ) {
    text(response, 404, "Arquivo não encontrado.");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png"
  };

  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none';"
  );
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cache-Control", "no-store");

  text(
    response,
    200,
    fs.readFileSync(filePath),
    types[extension] || "application/octet-stream"
  );
}

async function ensureDeviceFingerprintColumn() {
  const [columns] = await pool.query(
    "SHOW COLUMNS FROM licenses LIKE 'device_fingerprint'"
  );

  if (!columns.length) {
    await pool.query(
      "ALTER TABLE licenses ADD COLUMN device_fingerprint VARCHAR(64) NULL AFTER device_id"
    );
  }

  const [indexes] = await pool.query(
    "SHOW INDEX FROM licenses WHERE Key_name='idx_licenses_device_fingerprint'"
  );

  if (!indexes.length) {
    await pool.query(
      "CREATE INDEX idx_licenses_device_fingerprint ON licenses(device_fingerprint)"
    );
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);

  try {

    if (url.pathname === "/api/webhooks/cakto" && request.method === "POST") {
      const body = await readBody(request);
      const suppliedSecret = caktoSecretFromRequest(request, url, body);

      if (
        !CAKTO_WEBHOOK_SECRET ||
        !suppliedSecret ||
        !safeEqual(suppliedSecret, CAKTO_WEBHOOK_SECRET)
      ) {
        json(response, 401, {
          ok: false,
          error: "Webhook Cakto não autorizado."
        });
        return;
      }

      const event = caktoEventData(body);
      const plan = findPlanInPayload(body);

      try {
        await pool.execute(
          `INSERT INTO cakto_webhook_events (
             event_id,event_type,offer_id,order_id,customer_email,
             payment_status,mapped_plan,payload
           ) VALUES (?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE event_id=event_id`,
          [
            event.eventId,
            event.eventType || null,
            event.offerId || null,
            event.orderId || null,
            event.email || null,
            event.paymentStatus || null,
            plan || null,
            JSON.stringify(body)
          ]
        );
      } catch (error) {
        if (error.code === "ER_NO_SUCH_TABLE") {
          json(response, 503, {
            ok: false,
            error: "Execute npm run db:migrate-cakto antes de receber webhooks."
          });
          return;
        }
        throw error;
      }

      if (CAKTO_CAPTURE_ONLY) {
        await pool.execute(
          `UPDATE cakto_webhook_events
           SET processed=0,
               processing_error='CAPTURE_ONLY: aguardando validação do payload real'
           WHERE event_id=?`,
          [event.eventId]
        );

        json(response, 200, {
          ok: true,
          received: true,
          captureOnly: true,
          mappedPlan: plan || null,
          message: "Evento salvo. Nenhuma licença foi criada automaticamente."
        });
        return;
      }

      json(response, 200, {
        ok: true,
        received: true,
        mappedPlan: plan || null
      });
      return;
    }


    if (url.pathname === "/api/updates/latest" && request.method === "GET") {
      const currentVersion = sanitizeVersion(
        url.searchParams.get("currentVersion")
      ) || "0.0.0";

      const update = await latestPublishedUpdate(request);

      json(response, 200, {
        ok: true,
        currentVersion,
        update,
        updateRequired: Boolean(
          update && compareVersions(update.version, currentVersion) > 0
        ),
        mandatory: Boolean(
          update &&
          update.mandatory &&
          compareVersions(update.version, currentVersion) > 0
        )
      });
      return;
    }

    const updateDownloadMatch = url.pathname.match(
      /^\/api\/updates\/download\/([^/]+)$/
    );

    if (updateDownloadMatch && request.method === "GET") {
      const id = decodeURIComponent(updateDownloadMatch[1]);
      const [rows] = await pool.execute(
        `SELECT *
         FROM extension_updates
         WHERE id=? AND published=1
         LIMIT 1`,
        [id]
      );

      const update = rows[0];

      if (!update) {
        json(response, 404, {
          ok: false,
          error: "Atualização não encontrada."
        });
        return;
      }

      const filePath = path.join(UPDATES_DIR, update.file_name);

      if (!fs.existsSync(filePath)) {
        json(response, 404, {
          ok: false,
          error: "Arquivo da atualização não encontrado."
        });
        return;
      }

      response.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition":
          `attachment; filename="${safeUpdateFileName(update.version)}"`,
        "Content-Length": fs.statSync(filePath).size,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      });

      fs.createReadStream(filePath).pipe(response);
      return;
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      json(response, 200, {
        ok: true,
        service: "live-infinity",
        version: SERVER_VERSION,
        build: "v3",
        database: "mysql",
        now: new Date().toISOString()
      });
      return;
    }

    if (url.pathname === "/api/admin/login" && request.method === "POST") {
      if (adminLoginBlocked(request)) {
        json(response, 429, {
          ok: false,
          error: "Muitas tentativas. Aguarde 15 minutos."
        });
        return;
      }

      const body = await readBody(request);

      if (!safeEqual(body.username || "", ADMIN_USER) ||
          !safeEqual(body.password || "", ADMIN_PASSWORD)) {
        registerAdminLoginFailure(request);
        await logEvent(request, "admin_login_failed");
        json(response, 401, {
          ok: false,
          error: "Usuário ou senha administrativa incorretos."
        });
        return;
      }

      clearAdminLoginFailures(request);
      await logEvent(request, "admin_login_success");
      json(response, 200, {
        ok: true,
        token: adminToken(),
        role: "admin"
      });
      return;
    }

    if (url.pathname === "/api/activate" && request.method === "POST") {
      const body = await readBody(request);
      const email = normalizeEmail(body.email);
      const key = String(body.key || "").trim().toUpperCase();
      const deviceId = String(body.deviceId || "").trim();
      const deviceFingerprint = String(body.deviceFingerprint || "").trim().toLowerCase();

      if (
        !email ||
        !email.includes("@") ||
        !key ||
        !deviceId ||
        !/^[a-f0-9]{64}$/.test(deviceFingerprint)
      ) {
        json(response, 400, {
          ok: false,
          error: "E-mail, chave e identificação segura do computador são obrigatórios."
        });
        return;
      }

      const row = await findLicenseByKey(key);
      const validation = validateLicenseRecord(row, email, key, deviceId, deviceFingerprint);

      if (!validation.ok && row?.activated_at) {
        await logEvent(request, "license_activation_failed", row?.id, email, { error: validation.error });
        json(response, validation.expired ? 403 : 400, validation);
        return;
      }

      if (!row) {
        json(response, 400, { ok: false, error: "Chave não encontrada." });
        return;
      }

      if (!row.activated_at) {
        const expiresAt = new Date(Date.now() + Number(row.duration_days) * 86_400_000);
        await pool.execute(
          `UPDATE licenses
           SET activated_at=NOW(),
               expires_at=?,
               status='active',
               device_id=?,
               device_fingerprint=?,
               last_validation_at=NOW()
           WHERE id=?`,
          [expiresAt, deviceId, deviceFingerprint, row.id]
        );
        await logEvent(request, "license_activated", row.id, email, { deviceId });
      } else {
        const sameComputerReinstall =
          row.device_id &&
          row.device_id !== deviceId &&
          row.device_fingerprint &&
          safeEqual(row.device_fingerprint, deviceFingerprint);

        await pool.execute(
          `UPDATE licenses
           SET device_id=?,
               device_fingerprint=COALESCE(device_fingerprint,?),
               last_validation_at=NOW()
           WHERE id=?`,
          [
            sameComputerReinstall ? deviceId : row.device_id || deviceId,
            deviceFingerprint,
            row.id
          ]
        );

        if (sameComputerReinstall) {
          await logEvent(
            request,
            "license_reinstalled_same_computer",
            row.id,
            email,
            { previousDeviceId: row.device_id, newDeviceId: deviceId }
          );
        }
      }

      const updated = await findLicenseByKey(key);
      const finalValidation = validateLicenseRecord(updated, email, key, deviceId, deviceFingerprint);

      if (!finalValidation.ok) {
        json(response, 403, finalValidation);
        return;
      }

      json(response, 200, {
        ok: true,
        plan: normalizePlan(updated.plan),
        accountPlan: normalizePlan(updated.plan),
        license: rowToLicense(updated)
      });
      return;
    }

    if (url.pathname === "/api/validate" && request.method === "POST") {
      const body = await readBody(request);
      const email = normalizeEmail(body.email);
      const key = String(body.key || "").trim().toUpperCase();
      const deviceId = String(body.deviceId || "").trim();
      const deviceFingerprint = String(body.deviceFingerprint || "").trim().toLowerCase();

      if (!/^[a-f0-9]{64}$/.test(deviceFingerprint)) {
        json(response, 400, {
          ok: false,
          error: "Identificação segura do computador ausente."
        });
        return;
      }

      const row = await findLicenseByKey(key);
      const validation = validateLicenseRecord(
        row,
        email,
        key,
        deviceId,
        deviceFingerprint
      );

      if (!validation.ok) {
        await logEvent(request, "license_validation_failed", row?.id, email, { error: validation.error });
        json(response, validation.expired ? 403 : 400, validation);
        return;
      }

      const sameComputerReinstall =
        row.device_id &&
        row.device_id !== deviceId &&
        row.device_fingerprint &&
        safeEqual(row.device_fingerprint, deviceFingerprint);

      await pool.execute(
        `UPDATE licenses
         SET device_id=?,
             device_fingerprint=COALESCE(device_fingerprint,?),
             last_validation_at=NOW()
         WHERE id=?`,
        [
          sameComputerReinstall ? deviceId : row.device_id || deviceId,
          deviceFingerprint,
          row.id
        ]
      );

      if (sameComputerReinstall) {
        await logEvent(
          request,
          "license_reinstalled_same_computer",
          row.id,
          email,
          { previousDeviceId: row.device_id, newDeviceId: deviceId }
        );
      }

      const updated = await findLicenseByKey(key);
      json(response, 200, {
        ok: true,
        plan: normalizePlan(updated.plan),
        accountPlan: normalizePlan(updated.plan),
        license: rowToLicense(updated)
      });
      return;
    }


    if (url.pathname === "/api/plans" && request.method === "GET") {
      json(response, 200, {
        ok: true,
        plans: Object.values(PLAN_CATALOG)
      });
      return;
    }

    if (url.pathname.startsWith("/api/admin/")) {
      if (!adminAuthorized(request)) {
        json(response, 403, {
          ok: false,
          error: "Acesso administrativo negado."
        });
        return;
      }



      const accountPlanMatch = url.pathname.match(
        /^\/api\/admin\/accounts\/(.+)\/plan$/
      );

      if (accountPlanMatch && request.method === "PATCH") {
        const accountEmail = normalizeEmail(
          decodeURIComponent(accountPlanMatch[1])
        );
        const body = await readBody(request);
        const plan = normalizePlan(body.plan);
        const definition = planDefinition(plan);

        const [accountRows] = await pool.execute(
          "SELECT * FROM customer_accounts WHERE email=? LIMIT 1",
          [accountEmail]
        );

        if (!accountRows.length) {
          json(response, 404, {
            ok: false,
            error: "Conta do cliente não encontrada."
          });
          return;
        }

        const usedKeys = await accountKeyUsage(accountEmail);

        if (
          definition.keyLimit !== null &&
          usedKeys > definition.keyLimit
        ) {
          json(response, 409, {
            ok: false,
            error:
              `O cliente possui ${usedKeys} chaves ativas. ` +
              `O plano ${definition.name} permite apenas ${definition.keyLimit}.`
          });
          return;
        }

        await upsertCustomerAccount(accountEmail, plan);

        await pool.execute(
          "UPDATE licenses SET plan=? WHERE account_email=?",
          [plan, accountEmail]
        );

        await logEvent(request, "account_plan_changed", null, accountEmail, {
          plan,
          monthlyPrice: definition.monthlyPrice,
          keyLimit: definition.keyLimit
        });

        json(response, 200, {
          ok: true,
          account: {
            email: accountEmail,
            plan,
            planName: definition.name,
            monthlyPrice: definition.monthlyPrice,
            keyLimit: definition.keyLimit
          }
        });
        return;
      }

      if (url.pathname === "/api/admin/accounts" && request.method === "GET") {
        const [accountRows] = await pool.query(
          `SELECT
             a.email,
             a.plan,
             a.monthly_price,
             a.key_limit,
             a.subscription_status,
             a.cakto_customer_id,
             a.cakto_subscription_id,
             a.current_period_end,
             a.created_at,
             a.updated_at
           FROM customer_accounts a
           ORDER BY a.created_at DESC`
        );

        const [licenseRows] = await pool.query(
          `SELECT *
           FROM licenses
           ORDER BY created_at DESC`
        );

        const licensesByAccount = new Map();

        for (const row of licenseRows) {
          const owner = row.account_email || row.email;

          if (!licensesByAccount.has(owner)) {
            licensesByAccount.set(owner, []);
          }

          licensesByAccount.get(owner).push(rowToLicense(row));
        }

        json(response, 200, {
          ok: true,
          accounts: accountRows.map(row => {
            const keys = licensesByAccount.get(row.email) || [];
            const keysActive = keys.filter(item => item.active).length;

            return {
              email: row.email,
              plan: row.plan,
              planName: planDefinition(row.plan).name,
              monthlyPrice: Number(row.monthly_price),
              keyLimit: row.key_limit === null ? null : Number(row.key_limit),
              subscriptionStatus: row.subscription_status,
              caktoCustomerId: row.cakto_customer_id,
              caktoSubscriptionId: row.cakto_subscription_id,
              currentPeriodEnd: toIso(row.current_period_end),
              keysCreated: keys.length,
              keysActive,
              keys,
              createdAt: toIso(row.created_at),
              updatedAt: toIso(row.updated_at)
            };
          })
        });
        return;
      }


      if (url.pathname === "/api/admin/cakto-events" && request.method === "GET") {
        const [rows] = await pool.query(
          `SELECT event_id,event_type,offer_id,order_id,customer_email,
                  payment_status,mapped_plan,processed,processing_error,
                  received_at,processed_at,payload
           FROM cakto_webhook_events
           ORDER BY received_at DESC
           LIMIT 100`
        );

        json(response, 200, {
          ok: true,
          events: rows.map(row => ({
            eventId: row.event_id,
            eventType: row.event_type,
            offerId: row.offer_id,
            orderId: row.order_id,
            customerEmail: row.customer_email,
            paymentStatus: row.payment_status,
            mappedPlan: row.mapped_plan,
            processed: Boolean(row.processed),
            processingError: row.processing_error,
            receivedAt: toIso(row.received_at),
            processedAt: toIso(row.processed_at),
            payload: typeof row.payload === "string"
              ? JSON.parse(row.payload)
              : row.payload
          }))
        });
        return;
      }


      if (url.pathname === "/api/admin/updates" && request.method === "GET") {
        const [rows] = await pool.execute(
          `SELECT *
           FROM extension_updates
           ORDER BY created_at DESC`
        );

        json(response, 200, {
          ok: true,
          updates: rows.map(row => rowToUpdate(row, request))
        });
        return;
      }

      if (url.pathname === "/api/admin/updates" && request.method === "POST") {
        const body = await readBody(request);
        const version = sanitizeVersion(body.version);

        if (!version) {
          json(response, 400, {
            ok: false,
            error: "Versão inválida. Use o formato 1.4.0."
          });
          return;
        }

        const encodedFile = String(body.fileBase64 || "");
        const zipBuffer = Buffer.from(encodedFile, "base64");

        if (
          !encodedFile ||
          zipBuffer.length < 4 ||
          zipBuffer[0] !== 0x50 ||
          zipBuffer[1] !== 0x4b
        ) {
          json(response, 400, {
            ok: false,
            error: "Selecione um arquivo ZIP válido."
          });
          return;
        }

        if (zipBuffer.length > 25 * 1024 * 1024) {
          json(response, 413, {
            ok: false,
            error: "O ZIP deve ter no máximo 25 MB."
          });
          return;
        }

        const id = crypto.randomUUID();
        const fileName = `${id}.zip`;
        const filePath = path.join(UPDATES_DIR, fileName);

        fs.writeFileSync(filePath, zipBuffer);

        try {
          await pool.execute(
            `INSERT INTO extension_updates (
              id,version,title,description,changelog,file_name,file_size,
              mandatory,published,published_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [
              id,
              version,
              String(body.title || `Live Infinity ${version}`).trim(),
              String(body.description || "").trim(),
              String(body.changelog || "").trim(),
              fileName,
              zipBuffer.length,
              1,
              body.published === false ? 0 : 1,
              body.published === false ? null : new Date()
            ]
          );
        } catch (error) {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

          if (error.code === "ER_DUP_ENTRY") {
            json(response, 409, {
              ok: false,
              error: "Já existe uma atualização com esta versão."
            });
            return;
          }

          throw error;
        }

        json(response, 201, {
          ok: true,
          update: rowToUpdate({
            id,
            version,
            title: String(body.title || `Live Infinity ${version}`).trim(),
            description: String(body.description || "").trim(),
            changelog: String(body.changelog || "").trim(),
            file_name: fileName,
            file_size: zipBuffer.length,
            mandatory: 1,
            published: body.published === false ? 0 : 1,
            published_at: body.published === false ? null : new Date(),
            created_at: new Date()
          }, request)
        });
        return;
      }

      const adminUpdateMatch = url.pathname.match(
        /^\/api\/admin\/updates\/([^/]+)(?:\/(publish|unpublish))?$/
      );

      if (adminUpdateMatch) {
        const id = decodeURIComponent(adminUpdateMatch[1]);
        const action = adminUpdateMatch[2];

        const [rows] = await pool.execute(
          "SELECT * FROM extension_updates WHERE id=? LIMIT 1",
          [id]
        );

        const update = rows[0];

        if (!update) {
          json(response, 404, {
            ok: false,
            error: "Atualização não encontrada."
          });
          return;
        }

        if (!action && request.method === "DELETE") {
          await pool.execute(
            "DELETE FROM extension_updates WHERE id=?",
            [id]
          );

          const filePath = path.join(UPDATES_DIR, update.file_name);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

          json(response, 200, { ok: true });
          return;
        }

        if (
          (action === "publish" || action === "unpublish") &&
          request.method === "POST"
        ) {
          const published = action === "publish" ? 1 : 0;

          await pool.execute(
            `UPDATE extension_updates
             SET published=?,published_at=?
             WHERE id=?`,
            [published, published ? new Date() : null, id]
          );

          json(response, 200, { ok: true });
          return;
        }
      }

      if (url.pathname === "/api/admin/licenses" && request.method === "GET") {
        const [rows] = await pool.query(
          "SELECT * FROM licenses ORDER BY created_at DESC"
        );
        json(response, 200, {
          ok: true,
          licenses: rows.map(rowToLicense)
        });
        return;
      }

      if (url.pathname === "/api/admin/licenses" && request.method === "POST") {
        const body = await readBody(request);
        const accountEmail = normalizeEmail(body.accountEmail || body.email);
        const requestedAccessEmail = normalizeEmail(body.accessEmail);
        const durationDays = Number(body.durationDays);
        const plan = normalizePlan(body.plan);
        const note = String(body.note || "").trim();
        const amountPaid = Math.max(0, Number(body.amountPaid || 0));
        const paymentMethod = String(body.paymentMethod || "").trim();

        if (!accountEmail || !accountEmail.includes("@")) {
          json(response, 400, { ok: false, error: "Digite um e-mail de compra válido." });
          return;
        }
        if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 36500) {
          json(response, 400, {
            ok: false,
            error: "Os dias devem estar entre 1 e 36500."
          });
          return;
        }

        const accountPlan = await upsertCustomerAccount(accountEmail, plan);
        const usedKeys = await accountKeyUsage(accountEmail);
        const accessEmail = requestedAccessEmail || suggestedAccessEmail(accountEmail, usedKeys + 1);

        if (!accessEmail || !accessEmail.includes("@")) {
          json(response, 400, { ok: false, error: "Digite um e-mail de acesso válido." });
          return;
        }

        const [existingAccess] = await pool.execute(
          "SELECT id FROM licenses WHERE access_email=? LIMIT 1",
          [accessEmail]
        );

        if (existingAccess.length) {
          json(response, 409, { ok: false, error: "Este e-mail de acesso já está em uso." });
          return;
        }

        if (
          accountPlan.keyLimit !== null &&
          usedKeys >= accountPlan.keyLimit
        ) {
          json(response, 409, {
            ok: false,
            error:
              `O plano ${accountPlan.name} permite ${accountPlan.keyLimit} ` +
              `${accountPlan.keyLimit === 1 ? "chave" : "chaves"} por conta.`
          });
          return;
        }

        const id = crypto.randomUUID();
        let key;

        for (let attempt = 0; attempt < 10; attempt += 1) {
          key = generateKey(plan);
          try {
            await pool.execute(
              `INSERT INTO licenses
               (id,account_email,access_email,email,license_key,plan,duration_days,note,amount_paid,payment_method)
               VALUES (?,?,?,?,?,?,?,?,?,?)`,
              [id,accountEmail,accessEmail,accessEmail,key,plan,durationDays,note || null,amountPaid,paymentMethod || null]
            );
            break;
          } catch (error) {
            if (error.code !== "ER_DUP_ENTRY" || attempt === 9) throw error;
          }
        }

        const row = await findLicenseByKey(key);
        await logEvent(request, "license_created", id, accessEmail, { accountEmail, accessEmail, plan, durationDays });
        json(response, 201, { ok: true, license: rowToLicense(row) });
        return;
      }

      if (url.pathname === "/api/admin/support" && request.method === "GET") {
        const [rows] = await pool.query(
          "SELECT * FROM support_tickets ORDER BY created_at DESC"
        );
        json(response, 200, {
          ok: true,
          tickets: rows.map(row => ({
            id: row.id,
            subject: row.subject,
            customerEmail: row.customer_email,
            message: row.message,
            priority: row.priority,
            status: row.status,
            createdAt: toIso(row.created_at),
            updatedAt: toIso(row.updated_at)
          }))
        });
        return;
      }

      if (url.pathname === "/api/admin/support" && request.method === "POST") {
        const body = await readBody(request);
        const subject = String(body.subject || "").trim();
        const customerEmail = normalizeEmail(body.customerEmail);
        const message = String(body.message || "").trim();
        const priority = ["low","normal","high"].includes(body.priority)
          ? body.priority
          : "normal";

        if (!subject || !message) {
          json(response, 400, {
            ok: false,
            error: "Assunto e mensagem são obrigatórios."
          });
          return;
        }

        const id = crypto.randomUUID();
        await pool.execute(
          `INSERT INTO support_tickets
           (id,subject,customer_email,message,priority)
           VALUES (?,?,?,?,?)`,
          [id,subject,customerEmail || null,message,priority]
        );

        json(response, 201, { ok: true, ticket: { id } });
        return;
      }

      const supportMatch = url.pathname.match(/^\/api\/admin\/support\/([^/]+)$/);

      if (supportMatch && request.method === "PATCH") {
        const body = await readBody(request);
        const status = ["open","in_progress","resolved"].includes(body.status)
          ? body.status
          : null;
        const priority = ["low","normal","high"].includes(body.priority)
          ? body.priority
          : null;

        if (!status && !priority) {
          json(response, 400, { ok: false, error: "Nada para atualizar." });
          return;
        }

        await pool.execute(
          `UPDATE support_tickets
           SET status=COALESCE(?,status),priority=COALESCE(?,priority)
           WHERE id=?`,
          [status,priority,decodeURIComponent(supportMatch[1])]
        );

        json(response, 200, { ok: true });
        return;
      }

            const releaseDeviceMatch = url.pathname.match(
        /^\/api\/admin\/licenses\/([^/]+)\/release-device$/
      );

      if (releaseDeviceMatch && request.method === "POST") {
        const id = releaseDeviceMatch[1];

        const [rows] = await pool.execute(
          "SELECT * FROM licenses WHERE id=? LIMIT 1",
          [id]
        );

        if (!rows.length) {
          json(response, 404, {
            ok: false,
            error: "Licença não encontrada."
          });
          return;
        }

        await pool.execute(
          `UPDATE licenses
           SET device_id=NULL,device_name=NULL,device_fingerprint=NULL,last_validation_at=NULL
           WHERE id=?`,
          [id]
        );

        await logEvent(
          request,
          "device_released",
          id,
          rows[0].access_email || rows[0].email
        );

        json(response, 200, { ok: true });
        return;
      }

const licenseMatch = url.pathname.match(
        /^\/api\/admin\/licenses\/([^/]+)(?:\/(renew|revoke|restore|reset-device))?$/
      );

      if (licenseMatch) {
        const id = decodeURIComponent(licenseMatch[1]);
        const action = licenseMatch[2];

        const [rows] = await pool.execute(
          "SELECT * FROM licenses WHERE id=? LIMIT 1",
          [id]
        );
        const row = rows[0];

        if (!row) {
          json(response, 404, { ok: false, error: "Licença não encontrada." });
          return;
        }

        if (!action && request.method === "DELETE") {
          await pool.execute("DELETE FROM licenses WHERE id=?", [id]);
          await logEvent(request, "license_deleted", id, row.email);
          json(response, 200, { ok: true });
          return;
        }

        if (!action && request.method === "PATCH") {
          const body = await readBody(request);
          const plan =
            body.plan !== undefined
              ? normalizePlan(body.plan)
              : null;

          await pool.execute(
            `UPDATE licenses SET
               plan=COALESCE(?,plan),
               note=COALESCE(?,note),
               amount_paid=COALESCE(?,amount_paid),
               payment_method=COALESCE(?,payment_method)
             WHERE id=?`,
            [
              plan,
              body.note !== undefined ? String(body.note || "") : null,
              body.amountPaid !== undefined ? Math.max(0, Number(body.amountPaid || 0)) : null,
              body.paymentMethod !== undefined ? String(body.paymentMethod || "") : null,
              id
            ]
          );

          if (plan) {
            const ownerEmail = row.account_email || row.email;
            await upsertCustomerAccount(ownerEmail, plan);
            await pool.execute(
              "UPDATE licenses SET plan=? WHERE account_email=?",
              [plan, ownerEmail]
            );
          }

          const [updatedRows] = await pool.execute(
            "SELECT * FROM licenses WHERE id=? LIMIT 1",
            [id]
          );
          json(response, 200, {
            ok: true,
            license: rowToLicense(updatedRows[0])
          });
          return;
        }

        if (action === "renew" && request.method === "POST") {
          const body = await readBody(request);
          const days = Number(body.days);

          if (!Number.isInteger(days) || days < 1 || days > 36500) {
            json(response, 400, { ok: false, error: "Quantidade de dias inválida." });
            return;
          }

          if (!row.activated_at) {
            await pool.execute(
              "UPDATE licenses SET duration_days=duration_days+?,active=1,status='pending' WHERE id=?",
              [days,id]
            );
          } else {
            const base = row.expires_at && new Date(row.expires_at) > new Date()
              ? new Date(row.expires_at)
              : new Date();
            base.setDate(base.getDate() + days);

            await pool.execute(
              "UPDATE licenses SET expires_at=?,active=1,status='active' WHERE id=?",
              [base,id]
            );
          }

          json(response, 200, { ok: true });
          return;
        }

        if (action === "revoke" && request.method === "POST") {
          await pool.execute(
            "UPDATE licenses SET active=0,status='revoked' WHERE id=?",
            [id]
          );
          json(response, 200, { ok: true });
          return;
        }

        if (action === "restore" && request.method === "POST") {
          const status = row.activated_at ? "active" : "pending";
          await pool.execute(
            "UPDATE licenses SET active=1,status=? WHERE id=?",
            [status,id]
          );
          json(response, 200, { ok: true });
          return;
        }

        if (action === "reset-device" && request.method === "POST") {
          await pool.execute(
            "UPDATE licenses SET device_id=NULL,device_fingerprint=NULL WHERE id=?",
            [id]
          );
          json(response, 200, { ok: true });
          return;
        }
      }

      json(response, 404, {
        ok: false,
        error: "Rota administrativa não encontrada."
      });
      return;
    }

    serveAdminStatic(url.pathname, response);
  } catch (error) {
    console.error(error);
    json(response, 500, {
      ok: false,
      error: "Erro interno do servidor."
    });
  }
});

(async () => {
  if (!ADMIN_PASSWORD) {
    console.error("ADMIN_PASSWORD não foi configurada no arquivo .env.");
    process.exit(1);
  }

  await testConnection();
  await ensureDeviceFingerprintColumn();
  await ensureUpdatesTable();

  server.listen(PORT, HOST, () => {
    console.log(`Live Infinity ${SERVER_VERSION}: http://${HOST}:${PORT}`);
    console.log("Banco de dados: MySQL conectado");
    console.log(`Painel Admin: ${ADMIN_PANEL_PATH}`);
  });
})().catch(error => {
  console.error("Falha ao iniciar:", error.message);
  process.exit(1);
});
