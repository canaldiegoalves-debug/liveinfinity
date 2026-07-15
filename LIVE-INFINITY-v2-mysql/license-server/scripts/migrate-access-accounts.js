require("dotenv").config();
const fs=require("fs");
const path=require("path");
const {pool}=require("../db");

(async()=>{
  try{
    const sql=fs.readFileSync(path.join(__dirname,"../migrate-access-accounts.sql"),"utf8");
    const statements=sql.split(/;\s*(?:\r?\n|$)/).map(s=>s.trim()).filter(Boolean);
    for(const statement of statements){
      try{ await pool.query(statement); }
      catch(error){
        if(!["ER_DUP_FIELDNAME","ER_DUP_KEYNAME"].includes(error.code)) throw error;
      }
    }
    console.log("Contas de compra e e-mails de acesso configurados com sucesso.");
    process.exit(0);
  }catch(error){
    console.error("Falha ao migrar contas e acessos:",error.message);
    process.exit(1);
  }
})();
