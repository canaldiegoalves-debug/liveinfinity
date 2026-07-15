require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { pool, testConnection } = require("./db");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const PUBLIC_DIR = path.join(__dirname, "public");

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
  const prefix = plan === "pro" ? "LIVEINF-PRO" : "LIVEINF-BASIC";
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
    email: row.email,
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
    lastValidationAt: toIso(row.last_validation_at)
  };
}

async function findLicenseByKey(key) {
  const [rows] = await pool.execute(
    "SELECT * FROM licenses WHERE license_key = ? LIMIT 1",
    [key]
  );
  return rows[0] || null;
}

function validateLicenseRecord(row, email, key, deviceId) {
  if (!row) return { ok: false, error: "Chave não encontrada." };
  if (!row.active || row.status === "revoked") {
    return { ok: false, error: "Esta licença foi bloqueada." };
  }
  if (normalizeEmail(row.email) !== normalizeEmail(email)) {
    return { ok: false, error: "O e-mail não corresponde à chave." };
  }
  if (row.license_key !== String(key || "").trim().toUpperCase()) {
    return { ok: false, error: "Chave inválida." };
  }
  if (row.device_id && deviceId && row.device_id !== deviceId) {
    return { ok: false, error: "Esta chave já está vinculada a outro dispositivo." };
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

function serveStatic(requestPath, response) {
  const normalized = requestPath === "/" ? "/index.html" : requestPath;
  const safe = path.normalize(normalized).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safe);

  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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

  text(response, 200, fs.readFileSync(filePath), types[extension] || "application/octet-stream");
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
    if (url.pathname === "/api/health" && request.method === "GET") {
      await pool.query("SELECT 1");
      json(response, 200, {
        ok: true,
        database: "mysql",
        serverTime: nowIso()
      });
      return;
    }

    if (url.pathname === "/api/admin/login" && request.method === "POST") {
      const body = await readBody(request);

      if (!safeEqual(body.username || "", ADMIN_USER) ||
          !safeEqual(body.password || "", ADMIN_PASSWORD)) {
        await logEvent(request, "admin_login_failed");
        json(response, 401, {
          ok: false,
          error: "Usuário ou senha administrativa incorretos."
        });
        return;
      }

      await logEvent(request, "admin_login_success");
      json(response, 200, { ok: true, token: adminToken() });
      return;
    }

    if (url.pathname === "/api/activate" && request.method === "POST") {
      const body = await readBody(request);
      const email = normalizeEmail(body.email);
      const key = String(body.key || "").trim().toUpperCase();
      const deviceId = String(body.deviceId || "").trim();

      if (!email || !email.includes("@") || !key || !deviceId) {
        json(response, 400, {
          ok: false,
          error: "E-mail, chave e identificação do dispositivo são obrigatórios."
        });
        return;
      }

      const row = await findLicenseByKey(key);
      const validation = validateLicenseRecord(row, email, key, deviceId);

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
           SET activated_at=NOW(),expires_at=?,status='active',device_id=?,last_validation_at=NOW()
           WHERE id=?`,
          [expiresAt, deviceId, row.id]
        );
        await logEvent(request, "license_activated", row.id, email, { deviceId });
      } else {
        await pool.execute(
          "UPDATE licenses SET last_validation_at=NOW() WHERE id=?",
          [row.id]
        );
      }

      const updated = await findLicenseByKey(key);
      const finalValidation = validateLicenseRecord(updated, email, key, deviceId);

      if (!finalValidation.ok) {
        json(response, 403, finalValidation);
        return;
      }

      json(response, 200, { ok: true, license: rowToLicense(updated) });
      return;
    }

    if (url.pathname === "/api/validate" && request.method === "POST") {
      const body = await readBody(request);
      const email = normalizeEmail(body.email);
      const key = String(body.key || "").trim().toUpperCase();
      const deviceId = String(body.deviceId || "").trim();

      const row = await findLicenseByKey(key);
      const validation = validateLicenseRecord(row, email, key, deviceId);

      if (!validation.ok) {
        await logEvent(request, "license_validation_failed", row?.id, email, { error: validation.error });
        json(response, validation.expired ? 403 : 400, validation);
        return;
      }

      await pool.execute(
        "UPDATE licenses SET last_validation_at=NOW() WHERE id=?",
        [row.id]
      );

      const updated = await findLicenseByKey(key);
      json(response, 200, { ok: true, license: rowToLicense(updated) });
      return;
    }

    if (url.pathname.startsWith("/api/admin/")) {
      if (!adminAuthorized(request)) {
        json(response, 401, {
          ok: false,
          error: "Acesso administrativo negado."
        });
        return;
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
        const email = normalizeEmail(body.email);
        const durationDays = Number(body.durationDays);
        const plan = body.plan === "pro" ? "pro" : "basic";
        const note = String(body.note || "").trim();
        const amountPaid = Math.max(0, Number(body.amountPaid || 0));
        const paymentMethod = String(body.paymentMethod || "").trim();

        if (!email || !email.includes("@")) {
          json(response, 400, { ok: false, error: "Digite um e-mail válido." });
          return;
        }
        if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 36500) {
          json(response, 400, {
            ok: false,
            error: "Os dias devem estar entre 1 e 36500."
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
               (id,email,license_key,plan,duration_days,note,amount_paid,payment_method)
               VALUES (?,?,?,?,?,?,?,?)`,
              [id,email,key,plan,durationDays,note || null,amountPaid,paymentMethod || null]
            );
            break;
          } catch (error) {
            if (error.code !== "ER_DUP_ENTRY" || attempt === 9) throw error;
          }
        }

        const row = await findLicenseByKey(key);
        await logEvent(request, "license_created", id, email, { plan, durationDays });
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
          const plan = body.plan === "pro" ? "pro" :
            body.plan === "basic" ? "basic" : null;

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
            "UPDATE licenses SET device_id=NULL WHERE id=?",
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

    serveStatic(url.pathname, response);
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

  server.listen(PORT, HOST, () => {
    console.log(`Live Infinity v2: http://${HOST}:${PORT}`);
    console.log("Banco de dados: MySQL conectado");
  });
})().catch(error => {
  console.error("Falha ao iniciar:", error.message);
  process.exit(1);
});
