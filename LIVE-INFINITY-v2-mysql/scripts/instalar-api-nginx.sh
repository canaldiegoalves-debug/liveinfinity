#!/usr/bin/env bash
set -euo pipefail

DOMAIN="api.valoranegocios.com.br"
TARGET="/etc/nginx/sites-available/${DOMAIN}"
LINK="/etc/nginx/sites-enabled/${DOMAIN}"

echo "Criando configuração do Nginx para ${DOMAIN}..."

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

        add_header Access-Control-Allow-Origin "chrome-extension://*" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        add_header Access-Control-Allow-Methods "GET, POST, PATCH, DELETE, OPTIONS" always;

        if ($request_method = OPTIONS) {
            return 204;
        }
    }
}
NGINX

sudo ln -s "${TARGET}" "${LINK}"

sudo nginx -t
sudo systemctl reload nginx

echo
echo "Nginx configurado."
echo "Antes do SSL, confirme que o DNS A 'api' aponta para este VPS."
echo
echo "Depois execute:"
echo "sudo certbot --nginx -d ${DOMAIN}"
