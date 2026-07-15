require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("../db");

(async () => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, "../schema.sql"), "utf8");
    const statements = schema
      .split(/;\s*(?:\r?\n|$)/)
      .map(item => item.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await pool.query(statement);
    }

    console.log("Banco Live Infinity criado/atualizado com sucesso.");
    process.exit(0);
  } catch (error) {
    console.error("Falha ao inicializar o banco:", error.message);
    process.exit(1);
  }
})();
