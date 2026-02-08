# CodeGuard — Guía de Deploy en DigitalOcean

## Opción recomendada: Droplet con Docker Compose

Es la más directa porque ya tenemos `docker-compose.yml` listo.

---

## Paso 1 — Crear el Droplet

1. Ir a [cloud.digitalocean.com](https://cloud.digitalocean.com)
2. **Create → Droplets**
3. Configuración recomendada:
   - **Region**: Frankfurt (FRA1) o el más cercano a tus usuarios
   - **Image**: Ubuntu 24.04 LTS
   - **Size**: Basic → Regular → **$12/mes** (2 GB RAM, 1 vCPU) para MVP
     - Para producción real: $24/mes (4 GB RAM, 2 vCPU)
   - **Authentication**: SSH Key (recomendado) o Password
   - **Hostname**: `codeguard`

4. Clic en **Create Droplet** y apuntar la IP pública (ej: `164.90.xxx.xxx`)

---

## Paso 2 — Configurar el servidor

Conectarse al Droplet:

```bash
ssh root@TU_IP_DEL_DROPLET
```

### 2.1 — Instalar Docker y Docker Compose

```bash
# Actualizar sistema
apt update && apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com | sh

# Verificar
docker --version
docker compose version
```

### 2.2 — Instalar Nginx (reverse proxy + SSL)

```bash
apt install -y nginx certbot python3-certbot-nginx
```

### 2.3 — Crear usuario de aplicación (buena práctica)

```bash
adduser --disabled-password codeguard
usermod -aG docker codeguard
```

---

## Paso 3 — Subir el código

### Opción A: Clonar desde GitHub (recomendado)

```bash
su - codeguard
git clone https://github.com/nicolapicasso/codeguard.git
cd codeguard
```

### Opción B: Subir con rsync desde tu máquina local

```bash
# Desde tu máquina local:
rsync -avz --exclude node_modules --exclude .git --exclude admin-ui/node_modules \
  /home/user/codeguard/ root@TU_IP:/home/codeguard/codeguard/
```

---

## Paso 4 — Configurar variables de entorno para producción

```bash
cd /home/codeguard/codeguard

# Crear archivo .env de producción
cat > .env.production << 'EOF'
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Base de datos (dentro de Docker)
DATABASE_URL=postgresql://codeguard:TU_PASSWORD_SEGURO_AQUI@postgres:5432/codeguard

# Redis (dentro de Docker)
REDIS_URL=redis://redis:6379

# Auth — CAMBIAR ESTOS VALORES
JWT_SECRET=genera-un-secreto-largo-y-aleatorio-aqui
HMAC_TOLERANCE_SECONDS=300

# Rate limiting
RATE_LIMIT_PER_USER_PER_MINUTE=30
RATE_LIMIT_PER_IP_PER_MINUTE=100

# Security
STORE_PLAIN_CODES=false
CUSTOM_FUNCTION_TIMEOUT_MS=100
EOF
```

**Generar secretos seguros:**

```bash
# Generar un JWT_SECRET aleatorio
openssl rand -hex 32

# Generar password de PostgreSQL
openssl rand -hex 16
```

Reemplazar los valores en `.env.production` con los generados.

---

## Paso 5 — Actualizar docker-compose para producción

Crear un `docker-compose.prod.yml`:

```bash
cat > docker-compose.prod.yml << 'YAML'
services:
  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: codeguard
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: codeguard
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U codeguard"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build: .
    restart: always
    ports:
      - "127.0.0.1:3000:3000"
    env_file: .env.production
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  admin-ui:
    build: ./admin-ui
    restart: always
    ports:
      - "127.0.0.1:8080:80"
    depends_on:
      - app

volumes:
  postgres_data:
  redis_data:
YAML
```

---

## Paso 6 — Build y arranque

```bash
cd /home/codeguard/codeguard

# Exportar password de PostgreSQL (el mismo que pusiste en .env.production)
export POSTGRES_PASSWORD=tu-password-seguro

# Build y arrancar
docker compose -f docker-compose.prod.yml up -d --build

# Verificar que todo está running
docker compose -f docker-compose.prod.yml ps

# Ver logs
docker compose -f docker-compose.prod.yml logs -f app

# Ejecutar migraciones de Prisma
docker compose -f docker-compose.prod.yml exec app npx prisma migrate deploy

# (Opcional) Cargar datos de demo
docker compose -f docker-compose.prod.yml exec app npx prisma db seed
```

### Verificar que funciona:

```bash
curl http://localhost:3000/health
# → {"status":"ok","timestamp":"..."}

curl http://localhost:3000/health/ready
# → {"status":"ready","postgres":"ok","redis":"ok"}

curl http://localhost:8080
# → HTML del admin panel
```

---

## Paso 7 — Configurar Nginx como reverse proxy

### 7.1 — Sin dominio (acceso por IP)

```bash
cat > /etc/nginx/sites-available/codeguard << 'NGINX'
server {
    listen 80;
    server_name _;

    # Admin Panel (ruta principal)
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health + Docs + Metrics
    location ~ ^/(health|docs|metrics) {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}
NGINX

# Activar el site
ln -sf /etc/nginx/sites-available/codeguard /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Verificar config y reiniciar
nginx -t && systemctl reload nginx
```

Ya puedes acceder:
- **Admin Panel**: `http://TU_IP/`
- **API**: `http://TU_IP/api/v1/validate`
- **Swagger**: `http://TU_IP/docs`
- **Health**: `http://TU_IP/health`

### 7.2 — Con dominio + HTTPS (recomendado para producción)

Si tienes un dominio (ej: `codeguard.tudominio.com`):

**a) Configurar DNS**: Crear un registro A apuntando a la IP del Droplet

| Tipo | Host | Valor |
|------|------|-------|
| A | codeguard | 164.90.xxx.xxx |

**b) Actualizar Nginx** con el dominio:

```bash
# Editar /etc/nginx/sites-available/codeguard
# Cambiar la línea: server_name _; → server_name codeguard.tudominio.com;
sed -i 's/server_name _;/server_name codeguard.tudominio.com;/' /etc/nginx/sites-available/codeguard
nginx -t && systemctl reload nginx
```

**c) Obtener certificado SSL con Let's Encrypt (gratis)**:

```bash
certbot --nginx -d codeguard.tudominio.com
```

Certbot configura HTTPS automáticamente y renueva el certificado cada 90 días.

Resultado:
- `https://codeguard.tudominio.com/` → Admin Panel
- `https://codeguard.tudominio.com/api/v1/validate` → API
- `https://codeguard.tudominio.com/docs` → Swagger

---

## Paso 8 — Firewall

```bash
# Habilitar UFW
ufw allow ssh
ufw allow http
ufw allow https
ufw enable

# Verificar
ufw status
```

---

## Paso 9 — Mantenimiento

### Ver logs
```bash
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f admin-ui
```

### Actualizar código
```bash
cd /home/codeguard/codeguard
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec app npx prisma migrate deploy
```

### Backup de base de datos
```bash
# Backup
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U codeguard codeguard > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20250115.sql | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U codeguard codeguard
```

### Monitorizar
```bash
# Métricas Prometheus
curl http://localhost:3000/metrics

# Estado de contenedores
docker compose -f docker-compose.prod.yml ps

# Uso de recursos
docker stats
```

---

## Resumen de costes DigitalOcean

| Recurso | Coste/mes |
|---------|:---------:|
| Droplet 2 GB | $12 |
| (Opcional) Dominio | ~$12/año |
| SSL Let's Encrypt | Gratis |
| **Total MVP** | **~$12/mes** |

---

## Alternativa: DigitalOcean App Platform

Si prefieres no gestionar servidor, puedes usar App Platform (PaaS):

1. Conectar repositorio GitHub
2. Crear 3 componentes:
   - **Web Service**: `codeguard` (Dockerfile en raíz)
   - **Static Site**: `admin-ui` (build command: `npm run build`, output: `dist`)
   - **Database**: PostgreSQL (managed, $12/mes extra)
3. Añadir Redis como add-on ($15/mes)
4. Configurar variables de entorno

**Coste**: ~$30-40/mes pero sin gestión de servidor.

---

## Checklist de deploy

- [ ] Crear Droplet en DigitalOcean
- [ ] Instalar Docker + Nginx
- [ ] Subir código (git clone o rsync)
- [ ] Configurar .env.production con secretos seguros
- [ ] docker compose up --build
- [ ] Ejecutar migraciones Prisma
- [ ] Configurar Nginx reverse proxy
- [ ] (Opcional) Configurar dominio + SSL
- [ ] Configurar firewall (UFW)
- [ ] Verificar health checks
- [ ] Acceder al Admin Panel y crear primer tenant
