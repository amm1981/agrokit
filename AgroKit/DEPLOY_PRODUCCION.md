# Despliegue produccion AgroKit

Objetivo:

- `https://agrocalera.app` sirve el frontend React/Vite.
- `https://agrocalera.app/api` publica el backend Node/Express.
- `wss://agrocalera.app/ws` publica WebSocket.
- MySQL corre local en el VPS.
- Evidencias/fotos se guardan en Contabo Object Storage S3 compatible.

## 1) Preparar VPS

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx mysql-server git curl unzip certbot python3-certbot-nginx ufw

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

sudo mkdir -p /var/www/agrokit/frontend/current
sudo mkdir -p /var/www/agrokit/backend
sudo mkdir -p /var/www/agrokit/logs
```

Firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## 2) MySQL seguro

Crear base y usuario de aplicacion. No usar root para el backend en produccion.

```bash
sudo mysql
```

```sql
CREATE DATABASE IF NOT EXISTS agrokit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'agrokit_app'@'localhost' IDENTIFIED BY 'CAMBIAR_PASSWORD_APP';
GRANT ALL PRIVILEGES ON agrokit.* TO 'agrokit_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Ejecutar schema solo en instalacion inicial. El archivo actual hace `DROP TABLE`, por eso no debe correrse sobre datos reales sin backup.

```bash
mysql -u root -p < /var/www/agrokit/backend/sql/schema.sql
```

## 3) Backend

Subir el contenido de `AgroKit/backend` a:

```bash
/var/www/agrokit/backend
```

Instalar dependencias:

```bash
cd /var/www/agrokit/backend
npm ci --omit=dev
```

Crear `.env`:

```bash
sudo nano /var/www/agrokit/backend/.env
sudo chmod 600 /var/www/agrokit/backend/.env
```

Ejemplo:

```env
PORT=3001
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DB=agrokit
MYSQL_USER=agrokit_app
MYSQL_PASSWORD=CAMBIAR_PASSWORD_APP
MYSQL_CONNECTION_LIMIT=10

CORS_ORIGINS=https://agrocalera.app,https://www.agrocalera.app

EVIDENCE_MAX_BYTES=8388608
EVIDENCE_STORAGE_DRIVER=s3
S3_ENDPOINT=https://usc1.contabostorage.com
S3_BUCKET=agrokit-files
S3_REGION=us-east-1
S3_ACCESS_KEY=CAMBIAR_ACCESS_KEY
S3_SECRET_KEY=CAMBIAR_SECRET_KEY
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_BASE_URL=https://usc1.contabostorage.com/7ecce4cb5fc94b34b15a07a50c637c55:agrokit-files
```

Probar:

```bash
cd /var/www/agrokit/backend
node src/server.js
```

Si responde correctamente, detener con `Ctrl+C`.

## 4) PM2

```bash
cd /var/www/agrokit/backend
pm2 start src/server.js --name agrokit-api --cwd /var/www/agrokit/backend
pm2 save
pm2 startup systemd
```

El comando `pm2 startup` imprime un comando con `sudo`; ejecutarlo tal como lo muestra.

Comandos utiles:

```bash
pm2 status
pm2 logs agrokit-api
pm2 restart agrokit-api
pm2 monit
```

## 5) Frontend

En local, crear build de produccion desde `C:\Users\JMartinez\Documents\Proyectos\AndroidStudioProjects\web`:

```powershell
Copy-Item .env.production.example .env.production
$env:VITE_BACKEND_BASE_URL="https://agrocalera.app"
$env:VITE_BACKEND_WS_URL="wss://agrocalera.app/ws"
npm install
npm run build
```

Subir `dist` al VPS:

```powershell
scp -r .\dist\* root@207.244.235.198:/var/www/agrokit/frontend/current/
```

En VPS:

```bash
sudo chown -R www-data:www-data /var/www/agrokit/frontend
```

## 6) Nginx

Antes de activar la configuracion final, asegurar certificados. Si ya existen, estos comandos no son necesarios.

```bash
sudo certbot certonly --nginx -d agrocalera.app -d www.agrocalera.app
```

Crear config:

```bash
sudo nano /etc/nginx/sites-available/agrokit
```

Contenido:

```nginx
server {
    listen 80;
    server_name agrocalera.app www.agrocalera.app;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name agrocalera.app www.agrocalera.app;

    root /var/www/agrokit/frontend/current;
    index index.html;

    client_max_body_size 12m;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /ws {
        proxy_pass http://127.0.0.1:3001/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|webp|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    ssl_certificate /etc/letsencrypt/live/agrocalera.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/agrocalera.app/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
```

Activar:

```bash
sudo ln -s /etc/nginx/sites-available/agrokit /etc/nginx/sites-enabled/agrokit
sudo nginx -t
sudo systemctl reload nginx
```

Si prefieres dejar todos los dominios en un solo certificado:

```bash
sudo certbot --nginx -d agrocalera.app -d www.agrocalera.app
```

## 7) Validaciones

```bash
curl -I https://agrocalera.app
curl https://agrocalera.app/api/health
pm2 logs agrokit-api --lines 80
sudo tail -n 80 /var/log/nginx/error.log
```

Verificar WebSocket desde navegador:

```js
const ws = new WebSocket('wss://agrocalera.app/ws')
ws.onmessage = console.log
```

## 8) Errores comunes

- `502 Bad Gateway`: backend detenido, puerto incorrecto o PM2 no inicio.
- `CORS`: revisar `CORS_ORIGINS` y reiniciar PM2.
- `403` en evidencia S3: bucket no publico o `S3_PUBLIC_BASE_URL` no coincide con el formato publico de Contabo.
- `SignatureDoesNotMatch`: revisar access key, secret, endpoint, bucket y `S3_FORCE_PATH_STYLE=true`.
- App/web apuntan a local: reconstruir frontend con `VITE_BACKEND_BASE_URL=https://agrocalera.app`.
- Schema borra datos: `schema.sql` actual contiene `DROP TABLE`; usar solo en instalacion inicial.
