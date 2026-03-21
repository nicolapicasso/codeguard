# OmniCodex — Motor de Validación de Códigos Únicos

Middleware para OmniWallet que valida códigos únicos desechables impresos por fabricantes de productos de gran consumo.

## Quick Start

### Requisitos

- Node.js 20+
- Docker & Docker Compose (para PostgreSQL y Redis)

### 1. Levantar infraestructura

```bash
docker compose up -d postgres redis
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar entorno

```bash
cp .env.example .env
```

### 4. Ejecutar migraciones y seed

```bash
npx prisma migrate dev --name init
npm run db:seed
```

El seed creará un tenant demo con API Key/Secret, un proyecto y 3 reglas de código. Los datos se muestran en consola.

### 5. Arrancar el servidor

```bash
npm run dev
```

El servidor estará disponible en `http://localhost:3000`.

### 6. Documentación API

Swagger UI disponible en `http://localhost:3000/docs`.

## Testing

```bash
# Tests unitarios
npm test

# Con cobertura
npm run test:coverage

# Type check
npm run typecheck
```

## Endpoints principales

### Validation API (requiere API Key + HMAC)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v1/validate` | Valida y canjea un código |
| GET | `/api/v1/validate/check?code=X&project_id=Y` | Pre-validación sin canje |
| GET | `/api/v1/codes` | Lista canjes con filtros |
| GET | `/api/v1/codes/:id` | Detalle de un canje |
| GET | `/api/v1/stats/:project_id` | Estadísticas del proyecto |

### Admin API (requiere Bearer JWT)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST/GET | `/api/admin/tenants` | CRUD Tenants |
| POST/GET | `/api/admin/tenants/:id/projects` | CRUD Proyectos |
| POST/GET | `/api/admin/projects/:id/rules` | CRUD Reglas de código |
| POST | `/api/admin/rules/:id/test` | Probar código contra regla |

### Health Checks

| Ruta | Descripción |
|------|-------------|
| `/health` | Estado general |
| `/health/ready` | Readiness (PostgreSQL + Redis) |
| `/health/live` | Liveness |

## Autenticación

### Validation API

Cada petición debe incluir:

```
X-Api-Key: {apiKey}
X-Timestamp: {ISO8601}
X-Signature: HMAC-SHA256(body, apiSecret)
```

El timestamp se rechaza si tiene más de 5 minutos de diferencia (anti-replay).

### Admin API

```
Authorization: Bearer {jwt_token}
```

## Ejemplo de validación

```bash
# Generar firma
BODY='{"code":"12345678907","project_id":"<uuid>"}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "<api_secret>" | cut -d' ' -f2)

curl -X POST http://localhost:3000/api/v1/validate \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <api_key>" \
  -H "X-Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -H "X-Signature: $SIGNATURE" \
  -d "$BODY"
```

## Pipeline de validación

El motor ejecuta 6 fases secuenciales:

1. **Normalización** — Elimina separadores, aplica case, trim
2. **Estructura** — Verifica longitud, charset, prefijo
3. **Segmentos** — Valida cada segmento (fixed, numeric, alpha, enum, date)
4. **Dígito de control** — Luhn, MOD10, MOD11, MOD97, Verhoeff, Damm o Custom
5. **Vigencia** — Estado activo + rango temporal del proyecto
5b. **Geo-fencing** — Restricción geográfica en 3 niveles (ver sección siguiente)
6. **Unicidad** — SHA-256 + Redlock + INSERT atómico (garantiza single-use)

## Geo-fencing (Restricción geográfica)

OmniCodex incluye un sistema de geo-fencing de 3 niveles que permite controlar desde qué países se pueden escanear códigos.

### Cómo funciona

Cuando llega una petición de validación, OmniCodex determina el país del usuario de dos formas (por orden de prioridad):

1. **Detección automática por IP** — Utiliza la base de datos GeoIP (MaxMind GeoLite2) integrada en el servidor para geolocalizar la IP del request. No requiere llamadas a APIs externas.
2. **Campo `country` del body** — Fallback si la detección por IP no es posible (IPs privadas, localhost, etc.)

### 3 niveles de restricción

| Nivel | Ámbito | Tipo | Configuración |
|-------|--------|------|--------------|
| **Tier 1** | Global | Blacklist | Variable de entorno `GLOBAL_BANNED_COUNTRIES` |
| **Tier 2** | Por Tenant | Blacklist | Campo `banned_countries` en el tenant (Admin API/UI) |
| **Tier 3** | Por Regla de código | Whitelist | Campo `allowed_countries` en la regla (Admin API/UI) |

- **Tier 1 (Global):** Se evalúa primero. Bloquea países en todos los tenants y proyectos. Ideal para países sancionados o restricciones legales.
- **Tier 2 (Tenant):** Cada tenant puede banear países adicionales. Bloquea el escaneo en todos los proyectos del tenant.
- **Tier 3 (Regla):** Cada regla de código puede definir una **whitelist** de países permitidos. Solo los países de la lista pueden escanear códigos de esa regla.

### Integración con OmniWallet (IMPORTANTE para desarrolladores)

OmniCodex funciona como middleware — las peticiones de escaneo llegan desde OmniWallet, no directamente desde el usuario final. Para que la geolocalización funcione correctamente, **OmniWallet debe reenviar la IP real del usuario** en el header `X-Forwarded-For`.

#### Qué debe hacer OmniWallet

```javascript
// En el backend de OmniWallet, al procesar un escaneo del usuario:
const userRealIp = req.headers['x-forwarded-for']
  || req.headers['x-real-ip']
  || req.socket.remoteAddress;

// Llamada a OmniCodex
const response = await fetch('https://omnicodex.example.com/api/v1/validate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Api-Key': API_KEY,
    'X-Timestamp': new Date().toISOString(),
    'X-Signature': hmacSignature,
    'X-Forwarded-For': userRealIp,  // <-- OBLIGATORIO para geo-fencing
  },
  body: JSON.stringify({
    code: scannedCode,
    project_id: projectId,
    ow_user_id: userId,
    // country: 'ES',  // Opcional: fallback si IP no geolocalizable
  }),
});
```

#### Flujo completo

```
Usuario (IP: 85.123.x.x, España)
    │
    ▼
OmniWallet (captura IP real del usuario)
    │  X-Forwarded-For: 85.123.x.x
    ▼
OmniCodex
    │  1. Lee X-Forwarded-For → 85.123.x.x
    │  2. GeoIP lookup → país: "ES"
    │  3. Valida contra Tier 1 (global bans) → OK
    │  4. Valida contra Tier 2 (tenant bans) → OK
    │  5. Valida contra Tier 3 (rule whitelist) → OK
    ▼
Respuesta: { status: "OK", detected_country: "ES", ... }
```

#### Respuesta de geo-fencing

Si la validación geográfica falla, la respuesta incluye detalles del bloqueo:

```json
{
  "status": "KO",
  "error_code": "GEO_BLOCKED",
  "error_message": "This code cannot be scanned from your country",
  "details": {
    "tier": "tenant",
    "country": "KP"
  }
}
```

Si la validación es exitosa, la respuesta incluye el país detectado:

```json
{
  "status": "OK",
  "detected_country": "ES",
  "code": "ABC12345",
  ...
}
```

### Configuración

#### Variables de entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `GLOBAL_BANNED_COUNTRIES` | Países baneados globalmente (ISO alpha-2, separados por coma) | `KP,IR,CU,SY` |
| `GEO_REQUIRE_COUNTRY` | Si `true`, rechaza peticiones donde no se pueda determinar el país | `false` |

#### API Admin — Tenant banned countries

```bash
# Crear tenant con países baneados
curl -X POST /api/admin/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"ow_tenant_id": "ow-001", "name": "Mi Tenant", "banned_countries": ["KP", "IR"]}'

# Actualizar países baneados de un tenant
curl -X PUT /api/admin/tenants/:id \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"banned_countries": ["KP", "IR", "CU"]}'
```

#### API Admin — Rule allowed countries

```bash
# Crear regla con whitelist de países
curl -X POST /api/admin/projects/:id/rules \
  -H "Authorization: Bearer $TOKEN" \
  -d '{..., "allowed_countries": ["ES", "MX", "AR", "CO"]}'
```

### Panel de Administración

- **Tenants** — Al crear o editar un tenant, se pueden configurar los países baneados
- **Code Rules (Rule Builder)** — Al crear una regla, se pueden especificar los países permitidos (whitelist)

## Admin Panel

Panel de administración web para gestionar tenants, proyectos, reglas y probar códigos.

### Desarrollo local

```bash
cd admin-ui
npm install
npm run dev
```

Abre `http://localhost:5173`. El proxy de Vite redirige las peticiones API a `localhost:3000`.

### Autenticación

El panel requiere un JWT token. Usa el endpoint:

```bash
curl -X POST http://localhost:3000/api/admin/auth/token \
  -H "Content-Type: application/json" \
  -d '{"secret":"<JWT_SECRET>"}'
```

O introduce el JWT_SECRET directamente en la pantalla de login del panel.

### Funcionalidades

- **Dashboard** — Estado de salud, conteo de tenants
- **Tenants** — CRUD completo, rotar API Keys
- **Projects** — Crear/editar proyectos por tenant
- **Code Rules** — Gestión de reglas + Rule Builder visual
- **Code Tester** — Probar códigos con resultado debug
- **Stats** — Gráficas de canjes por día, por regla

## Docker (producción)

```bash
docker compose up -d
```

Levanta PostgreSQL 16, Redis 7, la API (puerto 3000) y el Admin Panel (puerto 8080).

## Estructura del proyecto

```
codeguard/
├── src/
│   ├── server.ts                     # Entry point Fastify + Swagger
│   ├── config/                       # Variables de entorno
│   ├── modules/
│   │   ├── auth/                     # API Key, HMAC, JWT
│   │   ├── tenants/                  # CRUD tenants
│   │   ├── projects/                 # CRUD proyectos
│   │   ├── code-rules/               # CRUD reglas de código
│   │   ├── validation/               # Pipeline de validación
│   │   │   ├── check-digit/          # 7 algoritmos de dígito de control
│   │   │   ├── pipeline.ts           # Orquestador
│   │   │   ├── normalizer.ts         # Fase 1
│   │   │   ├── structure.ts          # Fase 2
│   │   │   ├── segments.ts           # Fase 3
│   │   │   ├── vigency.ts            # Fase 5
│   │   │   ├── geo-fencing.ts        # Fase 5b (3-tier geo-fencing)
│   │   │   └── uniqueness.ts         # Fase 6
│   │   └── stats/                    # Estadísticas
│   ├── middleware/                    # Rate limiting, logging, errors
│   └── utils/                        # Crypto, Redis, Prisma, Cache, GeoIP
├── prisma/                           # Schema + migraciones + seed
├── tests/                            # Unit + integration + load
├── admin-ui/                        # React admin panel (Vite + Tailwind)
│   ├── src/
│   │   ├── pages/                   # Dashboard, Tenants, Projects, etc.
│   │   ├── components/              # Layout, Login, Card, Badge
│   │   ├── lib/                     # API client, utils
│   │   └── hooks/                   # useApi hook
│   ├── Dockerfile                   # Multi-stage (Node build + Nginx)
│   └── nginx.conf                   # SPA + API proxy
├── docker-compose.yml
└── Dockerfile
```
