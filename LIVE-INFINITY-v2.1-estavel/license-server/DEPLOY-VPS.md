# Live Infinity v2 — Implantação no VPS

1. Copie `.env.example` para `.env`.
2. Preencha `DB_PASSWORD` e `ADMIN_PASSWORD`.
3. Instale dependências: `npm install`.
4. Crie as tabelas: `npm run db:init`.
5. Migre o JSON antigo, caso exista: `npm run db:migrate-json`.
6. Reinicie: `pm2 restart liveinfinity --update-env`.
7. Salve: `pm2 save`.

Nunca envie o arquivo `.env` ao GitHub.
