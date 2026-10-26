#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C.UTF-8
[[ $(id -u) == 0 ]] || { echo 'Lancer ce script avec sudo.' >&2; exit 1; }
domain=eclaire.nriault.fr
target=/etc/nginx/sites-available/eclaire
link=/etc/nginx/sites-enabled/eclaire
backup=$(mktemp -d)
had_target=false
had_link=false
if [[ -e $target ]]; then cp -a "$target" "$backup/config"; had_target=true; fi
if [[ -e $link || -L $link ]]; then cp -a "$link" "$backup/link"; had_link=true; fi
rollback() {
  if [[ $had_target == true ]]; then cp -a "$backup/config" "$target"; else rm -f "$target"; fi
  rm -f "$link"
  if [[ $had_link == true ]]; then cp -a "$backup/link" "$link"; fi
  nginx -t && systemctl reload nginx
}
trap 'status=$?; if ((status)); then rollback; fi; rm -rf "$backup"' EXIT
curl -fsS --max-time 10 http://127.0.0.1:8788/api/health | python3 -c 'import json,sys; assert json.load(sys.stdin)["status"] == "ready"'
install -d -m 755 /var/www/letsencrypt
if [[ ! -s /etc/letsencrypt/live/$domain/fullchain.pem ]]; then
  cat > "$target" <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name eclaire.nriault.fr;
    location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; try_files $uri =404; }
    location / { return 503; }
}
NGINX
  ln -sfn "$target" "$link"
  nginx -t
  systemctl reload nginx
fi
certbot certonly --webroot -w /var/www/letsencrypt --non-interactive --keep-until-expiring --cert-name "$domain" -d "$domain"
cat > "$target" <<'NGINX'
limit_req_zone $binary_remote_addr zone=eclaire_routes:1m rate=2r/m;
server {
    listen 80;
    listen [::]:80;
    server_name eclaire.nriault.fr;
    location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; try_files $uri =404; }
    location / { return 301 https://eclaire.nriault.fr$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name eclaire.nriault.fr;
    ssl_certificate /etc/letsencrypt/live/eclaire.nriault.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/eclaire.nriault.fr/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    client_max_body_size 10k;
    limit_req_status 429;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_read_timeout 130s;
    gzip on;
    gzip_types application/x-ndjson application/json application/javascript text/css;
    location = /api/route {
        limit_req zone=eclaire_routes burst=1 nodelay;
        access_log off;
        proxy_pass http://127.0.0.1:8788;
    }
    location /api/ { access_log off; proxy_pass http://127.0.0.1:8788; }
    location / { proxy_pass http://127.0.0.1:8788; }
}
NGINX
ln -sfn "$target" "$link"
nginx -t
systemctl reload nginx
echo 'HTTPS active : https://eclaire.nriault.fr/'
