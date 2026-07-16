#!/usr/bin/env bash
set -euo pipefail

DOMAIN="api.valoranegocios.com.br"
TARGET="/etc/nginx/sites-available/${DOMAIN}"
LINK="/etc/nginx/sites-enabled/${DOMAIN}"

echo "Verificando DNS de ${DOMAIN}..."

if ! getent hosts "${DOMAIN}" >/dev/null 2>&1; then
  echo
  echo "ERRO: o DNS de ${DOMAIN} ainda não está resolvendo."
  echo "Crie no painel DNS:"
  echo "Tipo A | Nome api | IP 179.197.74.225"
  exit 1
fi

echo "Criando configuração Nginx..."

sudo rm -f "${LINK}"

sudo tee "${TARGET}" >/dev/null <<'NGINX'
server {
    listen 80;
    listen [::]:80;

    server_name api.valoranegocios.com.br;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

sudo ln -s "${TARGET}" "${LINK}"

sudo nginx -t
sudo systemctl reload nginx

echo
echo "Nginx configurado."
echo "Agora execute:"
echo "sudo certbot --nginx -d ${DOMAIN}"
