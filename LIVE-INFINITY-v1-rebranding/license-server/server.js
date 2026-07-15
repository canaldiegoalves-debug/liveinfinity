const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";
const DATA_FILE = path.join(__dirname, "data", "licenses.json");
const PUBLIC_DIR = path.join(__dirname, "public");

function ensureDatabase() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ licenses: [], supportTickets: [] }, null, 2));
  }
}

function readDatabase() {
  ensureDatabase();
  try {
    const database = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    database.licenses = Array.isArray(database.licenses) ? database.licenses : [];
    database.supportTickets = Array.isArray(database.supportTickets) ? database.supportTickets : [];
    return database;
  } catch {
    return { licenses: [], supportTickets: [] };
  }
}

function writeDatabase(database) {
  ensureDatabase();
  const temporary = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(database, null, 2));
  fs.renameSync(temporary, DATA_FILE);
}

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function text(response, status, content, type = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
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

function adminToken() {
  return Buffer.from(
    `${ADMIN_USER}:${ADMIN_PASSWORD}`
  ).toString("base64");
}

function adminAuthorized(request) {
  const authorization = String(
    request.headers.authorization || ""
  );

  if (!authorization.startsWith("Bearer ")) {
    return false;
  }

  return authorization.slice(7).trim() === adminToken();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function generateKey(plan) {
  const random = crypto.randomBytes(10).toString("hex").toUpperCase();
  const prefix = plan === "pro" ? "LIVEINF-PRO" : "LIVEINF-BASIC";
  return `${prefix}-${random.slice(0, 5)}-${random.slice(5, 10)}-${random.slice(10, 15)}-${random.slice(15, 20)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function remainingDays(license) {
  if (!license.activatedAt || !license.expiresAt) {
    return license.durationDays;
  }

  const difference = new Date(license.expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(difference / 86_400_000));
}

function publicLicense(license) {
  return {
    id: license.id,
    email: license.email,
    key: license.key,
    plan: license.plan,
    durationDays: license.durationDays,
    active: license.active,
    status: license.status,
    createdAt: license.createdAt,
    activatedAt: license.activatedAt,
    expiresAt: license.expiresAt,
    remainingDays: remainingDays(license),
    deviceId: license.deviceId || null,
    note: license.note || "",
    amountPaid: Number(license.amountPaid || 0),
    paymentMethod: license.paymentMethod || "",
    lastValidationAt: license.lastValidationAt || null
  };
}

function validateLicenseRecord(license, email, key, deviceId) {
  if (!license) {
    return { ok: false, error: "Chave não encontrada." };
  }

  if (!license.active || license.status === "revoked") {
    return { ok: false, error: "Esta licença foi bloqueada." };
  }

  if (normalizeEmail(license.email) !== normalizeEmail(email)) {
    return { ok: false, error: "O e-mail não corresponde à chave." };
  }

  if (license.key !== String(key || "").trim().toUpperCase()) {
    return { ok: false, error: "Chave inválida." };
  }

  if (license.deviceId && deviceId && license.deviceId !== deviceId) {
    return { ok: false, error: "Esta chave já está vinculada a outro dispositivo." };
  }

  if (license.expiresAt && new Date(license.expiresAt).getTime() <= Date.now()) {
    return { ok: false, error: "A licença expirou.", expired: true };
  }

  return { ok: true };
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
    ".json": "application/json; charset=utf-8"
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
      json(response, 200, { ok: true, serverTime: nowIso() });
      return;
    }

    if (url.pathname === "/api/admin/login" && request.method === "POST") {
      const body = await readBody(request);

      if (
        String(body.username || "") !== ADMIN_USER ||
        String(body.password || "") !== ADMIN_PASSWORD
      ) {
        json(response, 401, {
          ok: false,
          error: "Usuário ou senha administrativa incorretos."
        });
        return;
      }

      json(response, 200, {
        ok: true,
        token: adminToken()
      });
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

      const database = readDatabase();
      const license = database.licenses.find(item => item.key === key);
      const validation = validateLicenseRecord(license, email, key, deviceId);

      if (!validation.ok && !(!license?.activatedAt && validation.error === "Esta chave já está vinculada a outro dispositivo.")) {
        json(response, validation.expired ? 403 : 400, validation);
        return;
      }

      if (!license.activatedAt) {
        const activatedAt = new Date();
        const expiresAt = new Date(
          activatedAt.getTime() + Number(license.durationDays) * 86_400_000
        );

        license.activatedAt = activatedAt.toISOString();
        license.expiresAt = expiresAt.toISOString();
        license.status = "active";
        license.deviceId = deviceId;
        license.updatedAt = nowIso();

        writeDatabase(database);
      }

      const finalValidation = validateLicenseRecord(license, email, key, deviceId);

      if (!finalValidation.ok) {
        json(response, 403, finalValidation);
        return;
      }

      license.lastValidationAt = nowIso();
      license.updatedAt = nowIso();
      writeDatabase(database);

      json(response, 200, {
        ok: true,
        license: publicLicense(license)
      });
      return;
    }

    if (url.pathname === "/api/validate" && request.method === "POST") {
      const body = await readBody(request);
      const email = normalizeEmail(body.email);
      const key = String(body.key || "").trim().toUpperCase();
      const deviceId = String(body.deviceId || "").trim();

      const database = readDatabase();
      const license = database.licenses.find(item => item.key === key);
      const validation = validateLicenseRecord(license, email, key, deviceId);

      if (!validation.ok) {
        json(response, validation.expired ? 403 : 400, validation);
        return;
      }

      license.lastValidationAt = nowIso();
      license.updatedAt = nowIso();
      writeDatabase(database);

      json(response, 200, {
        ok: true,
        license: publicLicense(license)
      });
      return;
    }

    if (url.pathname.startsWith("/api/admin/")) {
      if (!adminAuthorized(request)) {
        json(response, 401, { ok: false, error: "Senha administrativa incorreta." });
        return;
      }

      if (url.pathname === "/api/admin/licenses" && request.method === "GET") {
        const database = readDatabase();
        const licenses = database.licenses
          .map(publicLicense)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        json(response, 200, { ok: true, licenses });
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
            error: "Os dias devem ser um número inteiro entre 1 e 36500."
          });
          return;
        }

        const database = readDatabase();
        let key;

        do {
          key = generateKey(plan);
        } while (database.licenses.some(item => item.key === key));

        const license = {
          id: crypto.randomUUID(),
          email,
          key,
          plan,
          durationDays,
          active: true,
          status: "pending",
          createdAt: nowIso(),
          activatedAt: null,
          expiresAt: null,
          deviceId: null,
          note,
          amountPaid,
          paymentMethod,
          lastValidationAt: null,
          updatedAt: nowIso()
        };

        database.licenses.push(license);
        writeDatabase(database);

        json(response, 201, {
          ok: true,
          license: publicLicense(license)
        });
        return;
      }

      const licenseMatch = url.pathname.match(/^\/api\/admin\/licenses\/([^/]+)(?:\/(renew|revoke|restore|reset-device))?$/);

      if (licenseMatch) {
        const id = decodeURIComponent(licenseMatch[1]);
        const action = licenseMatch[2];
        const database = readDatabase();
        const license = database.licenses.find(item => item.id === id);

        if (!license) {
          json(response, 404, { ok: false, error: "Licença não encontrada." });
          return;
        }

        if (!action && request.method === "DELETE") {
          database.licenses = database.licenses.filter(item => item.id !== id);
          writeDatabase(database);
          json(response, 200, { ok: true });
          return;
        }

        if (action === "renew" && request.method === "POST") {
          const body = await readBody(request);
          const additionalDays = Number(body.days);

          if (!Number.isInteger(additionalDays) || additionalDays < 1 || additionalDays > 36500) {
            json(response, 400, { ok: false, error: "Quantidade de dias inválida." });
            return;
          }

          if (!license.activatedAt) {
            license.durationDays += additionalDays;
          } else {
            const currentExpiry = Math.max(
              Date.now(),
              new Date(license.expiresAt).getTime()
            );

            license.expiresAt = new Date(
              currentExpiry + additionalDays * 86_400_000
            ).toISOString();

            license.active = true;
            license.status = "active";
          }

          license.updatedAt = nowIso();
          writeDatabase(database);

          json(response, 200, {
            ok: true,
            license: publicLicense(license)
          });
          return;
        }

        if (action === "revoke" && request.method === "POST") {
          license.active = false;
          license.status = "revoked";
          license.updatedAt = nowIso();
          writeDatabase(database);

          json(response, 200, {
            ok: true,
            license: publicLicense(license)
          });
          return;
        }

        if (action === "restore" && request.method === "POST") {
          license.active = true;
          license.status = license.activatedAt ? "active" : "pending";
          license.updatedAt = nowIso();
          writeDatabase(database);

          json(response, 200, {
            ok: true,
            license: publicLicense(license)
          });
          return;
        }

        if (action === "reset-device" && request.method === "POST") {
          license.deviceId = null;
          license.updatedAt = nowIso();
          writeDatabase(database);

          json(response, 200, {
            ok: true,
            license: publicLicense(license)
          });
          return;
        }

        if (!action && request.method === "PATCH") {
          const body = await readBody(request);

          if (body.email) {
            const email = normalizeEmail(body.email);
            if (!email.includes("@")) {
              json(response, 400, { ok: false, error: "E-mail inválido." });
              return;
            }
            license.email = email;
          }

          if (body.plan) {
            license.plan = body.plan === "pro" ? "pro" : "basic";
          }

          if (body.note !== undefined) {
            license.note = String(body.note || "").trim();
          }

          if (body.amountPaid !== undefined) {
            license.amountPaid = Math.max(0, Number(body.amountPaid || 0));
          }

          if (body.paymentMethod !== undefined) {
            license.paymentMethod = String(body.paymentMethod || "").trim();
          }

          license.updatedAt = nowIso();
          writeDatabase(database);

          json(response, 200, {
            ok: true,
            license: publicLicense(license)
          });
          return;
        }
      }


      if (url.pathname === "/api/admin/support" && request.method === "GET") {
        const database = readDatabase();
        const tickets = database.supportTickets
          .slice()
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        json(response, 200, { ok: true, tickets });
        return;
      }

      if (url.pathname === "/api/admin/support" && request.method === "POST") {
        const body = await readBody(request);
        const subject = String(body.subject || "").trim();
        const customerEmail = normalizeEmail(body.customerEmail);
        const message = String(body.message || "").trim();
        const priority = ["low", "normal", "high"].includes(body.priority)
          ? body.priority
          : "normal";

        if (!subject || !message) {
          json(response, 400, {
            ok: false,
            error: "Assunto e mensagem são obrigatórios."
          });
          return;
        }

        const database = readDatabase();
        const ticket = {
          id: crypto.randomUUID(),
          subject,
          customerEmail,
          message,
          priority,
          status: "open",
          createdAt: nowIso(),
          updatedAt: nowIso()
        };

        database.supportTickets.push(ticket);
        writeDatabase(database);

        json(response, 201, { ok: true, ticket });
        return;
      }

      const supportMatch = url.pathname.match(
        /^\/api\/admin\/support\/([^/]+)$/
      );

      if (supportMatch && request.method === "PATCH") {
        const database = readDatabase();
        const ticket = database.supportTickets.find(
          item => item.id === decodeURIComponent(supportMatch[1])
        );

        if (!ticket) {
          json(response, 404, {
            ok: false,
            error: "Chamado não encontrado."
          });
          return;
        }

        const body = await readBody(request);

        if (body.status) {
          ticket.status = ["open", "in_progress", "resolved"].includes(body.status)
            ? body.status
            : ticket.status;
        }

        if (body.priority) {
          ticket.priority = ["low", "normal", "high"].includes(body.priority)
            ? body.priority
            : ticket.priority;
        }

        ticket.updatedAt = nowIso();
        writeDatabase(database);

        json(response, 200, { ok: true, ticket });
        return;
      }

      json(response, 404, { ok: false, error: "Rota administrativa não encontrada." });
      return;
    }

    serveStatic(url.pathname, response);
  } catch (error) {
    console.error(error);
    json(response, 500, {
      ok: false,
      error: error.message || "Erro interno."
    });
  }
});

ensureDatabase();

server.listen(PORT, HOST, () => {
  console.log(`Live Infinity License Server: http://localhost:${PORT}`);
  console.log(`Painel Admin: http://localhost:${PORT}`);
  console.log(`Usuário admin: ${ADMIN_USER}`);
});
