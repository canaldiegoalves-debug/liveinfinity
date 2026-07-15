require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { pool } = require("../db");

(async () => {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, "../migrate-plans.sql"),
      "utf8"
    );

    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map(item => item.trim())
      .filter(item => item && !item.startsWith("--"));

    for (const statement of statements) {
      await pool.query(statement);
    }

    console.log("Planos Básico, PRO e Premium configurados com sucesso.");
    process.exit(0);
  } catch (error) {
    console.error("Falha ao migrar os planos:", error.message);
    process.exit(1);
  }
})();
