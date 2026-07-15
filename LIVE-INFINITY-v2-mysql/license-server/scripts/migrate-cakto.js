require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { pool } = require("../db");

(async () => {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, "../migrate-cakto.sql"),
      "utf8"
    );

    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map(item => item.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await pool.query(statement);
    }

    console.log("Estrutura de webhooks da Cakto criada com sucesso.");
    process.exit(0);
  } catch (error) {
    console.error("Falha ao criar estrutura Cakto:", error.message);
    process.exit(1);
  }
})();
