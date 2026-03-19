# Despliegue en Digital Ocean

## Opción A: App Platform (recomendado)

App Platform detecta automáticamente los Dockerfiles y gestiona la infraestructura.

### Requisitos previos

```bash
# Instalar doctl (CLI de Digital Ocean)
brew install doctl          # macOS
snap install doctl          # Linux

# Autenticarse
doctl auth init
```

### 1. Crear la app

```bash
doctl apps create --spec .do/app.yaml
```

Esto provisiona automáticamente:
- **API backend** (contenedor Docker)
- **Admin UI** (contenedor Docker)
- **PostgreSQL 16** (managed database)
- **Redis 7** (managed database)

### 2. Configurar secretos

En el panel de Digital Ocean → Apps → codeguard → Settings → Environment Variables:

1. Genera un JWT secret seguro:
   ```bash
   openssl rand -base64 48
   ```
2. Reemplaza `JWT_SECRET` con el valor generado

### 3. Primera migración y seed

El `docker-entrypoint.sh` ejecuta `prisma migrate deploy` automáticamente en cada despliegue.

Para el seed inicial (datos demo), activa temporalmente:
- Pon `SEED_ON_DEPLOY=true` en las variables de entorno
- Haz un re-deploy
- Vuelve a poner `SEED_ON_DEPLOY=false`

### 4. Deploys automáticos

Cada push a `main` dispara un re-deploy automático (configurado en `app.yaml`).

---

## Opción B: Droplet con Docker Compose

Para más control, usa un Droplet ($6/mo) con Docker.

### 1. Crear un Droplet

- **Imagen:** Ubuntu 24.04
- **Plan:** Basic $6/mo (1 vCPU, 1 GB RAM) mínimo
- **Región:** Cerca de tus usuarios
- **Auth:** SSH key

### 2. Setup inicial

```bash
ssh root@TU_IP

# Instalar Docker
curl -fsSL https://get.docker.com | sh

# Clonar el repo
git clone https://github.com/nicolapicasso/codeguard.git
cd codeguard

# Configurar variables de entorno
cp .env.production .env.production.local
nano .env.production.local
# → Edita DATABASE_URL, REDIS_URL, JWT_SECRET
```

### 3. Levantar los servicios

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 4. Configurar Nginx como reverse proxy (SSL con Let's Encrypt)

```bash
apt install -y nginx certbot python3-certbot-nginx

cat > /etc/nginx/sites-available/codeguard << 'EOF'
server {
    server_name tu-dominio.com;

    # Admin UI
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API directo (opcional, si quieres exponer /api en el mismo dominio)
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -s /etc/nginx/sites-available/codeguard /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# SSL
certbot --nginx -d tu-dominio.com
```

### 5. Actualizar en producción

```bash
cd /root/codeguard
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Estimación de costos

| Recurso | App Platform | Droplet |
|---------|-------------|---------|
| Compute (API + UI) | $10/mo | $6/mo |
| PostgreSQL | $7/mo | Incluido |
| Redis | $7/mo | Incluido |
| **Total** | **~$24/mo** | **~$6/mo** |

---

## Health Checks

- `GET /health` — Estado general
- `GET /health/ready` — Base de datos + Redis listos
- `GET /health/live` — Proceso vivo

## Monitoreo

- **App Platform:** Métricas integradas en el panel de DO
- **Droplet:** Usa `docker compose logs -f` o integra con Grafana
- **Métricas Prometheus:** `GET /metrics`
