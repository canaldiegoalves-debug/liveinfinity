require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("../db");

const source = path.join(__dirname, "../data/licenses.json");

function mysqlDate(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

(async () => {
  try {
    if (!fs.existsSync(source)) {
      console.log("Nenhum arquivo JSON antigo encontrado. Nada para migrar.");
      process.exit(0);
    }

    const database = JSON.parse(fs.readFileSync(source, "utf8"));
    const licenses = Array.isArray(database.licenses) ? database.licenses : [];
    const tickets = Array.isArray(database.supportTickets) ? database.supportTickets : [];

    for (const license of licenses) {
      await pool.execute(
        `INSERT INTO licenses (
          id,email,license_key,plan,duration_days,active,status,device_id,note,
          amount_paid,payment_method,activated_at,expires_at,last_validation_at,
          created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          email=VALUES(email),
          plan=VALUES(plan),
          duration_days=VALUES(duration_days),
          active=VALUES(active),
          status=VALUES(status),
          device_id=VALUES(device_id),
          note=VALUES(note),
          amount_paid=VALUES(amount_paid),
          payment_method=VALUES(payment_method),
          activated_at=VALUES(activated_at),
          expires_at=VALUES(expires_at),
          last_validation_at=VALUES(last_validation_at),
          updated_at=VALUES(updated_at)`,
        [
          license.id,
          String(license.email || "").toLowerCase(),
          license.key,
          license.plan === "pro" ? "pro" : "basic",
          Number(license.durationDays || 30),
          license.active === false ? 0 : 1,
          license.status || "pending",
          license.deviceId || null,
          license.note || null,
          Number(license.amountPaid || 0),
          license.paymentMethod || null,
          mysqlDate(license.activatedAt),
          mysqlDate(license.expiresAt),
          mysqlDate(license.lastValidationAt),
          mysqlDate(license.createdAt) || mysqlDate(new Date()),
          mysqlDate(license.updatedAt) || mysqlDate(new Date())
        ]
      );
    }

    for (const ticket of tickets) {
      await pool.execute(
        `INSERT INTO support_tickets (
          id,subject,customer_email,message,priority,status,created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          subject=VALUES(subject),
          customer_email=VALUES(customer_email),
          message=VALUES(message),
          priority=VALUES(priority),
          status=VALUES(status),
          updated_at=VALUES(updated_at)`,
        [
          ticket.id,
          ticket.subject,
          ticket.customerEmail || null,
          ticket.message,
          ticket.priority || "normal",
          ticket.status || "open",
          mysqlDate(ticket.createdAt) || mysqlDate(new Date()),
          mysqlDate(ticket.updatedAt) || mysqlDate(new Date())
        ]
      );
    }

    console.log(`Migração concluída: ${licenses.length} licenças e ${tickets.length} chamados.`);
    process.exit(0);
  } catch (error) {
    console.error("Falha na migração:", error.message);
    process.exit(1);
  }
})();
