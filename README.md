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

### Validation API (requiere API Key + HMAC + Nonce)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/v1/validate` | Valida y canjea un código |
| GET | `/api/v1/codes` | Lista canjes con filtros (scoped al tenant) |
| GET | `/api/v1/codes/:id` | Detalle de un canje (scoped al tenant) |
| GET | `/api/v1/stats/:project_id` | Estadísticas del proyecto |

> **Nota:** El endpoint `GET /validate/check` ha sido eliminado de la API pública por seguridad (actúa como oráculo para atacantes). La pre-validación está disponible solo en la Admin API: `POST /api/admin/rules/:id/test`.

### Admin API (requiere Bearer JWT — login con usuario/contraseña)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/admin/auth/login` | Login con username + password |
| POST | `/api/admin/auth/setup` | Bootstrap: crear primer admin (solo primer uso) |
| POST/GET | `/api/admin/tenants` | CRUD Tenants |
| POST/GET | `/api/admin/tenants/:id/projects` | CRUD Proyectos |
| POST/GET | `/api/admin/projects/:id/rules` | CRUD Reglas de código |
| POST | `/api/admin/rules/:id/test` | Probar código contra regla (solo admin) |

### Health Checks

| Ruta | Descripción |
|------|-------------|
| `/health` | Estado general |
| `/health/ready` | Readiness |
| `/health/live` | Liveness |

> **Nota:** Swagger UI (`/docs`) está deshabilitado en producción.

## Autenticación

### Validation API

Cada petición debe incluir:

```
X-Api-Key: {apiKey}
X-Timestamp: {ISO8601}
X-Nonce: {uuid-unico-por-peticion}
X-Signature: HMAC-SHA256(payload, apiSecret)
```

El **payload firmado** se compone de:

```
{method}\n{path}\n{timestamp}\n{nonce}\n{body}
```

- El timestamp se rechaza si difiere más de 60 segundos (configurable via `HMAC_TOLERANCE_SECONDS`)
- El nonce se almacena en Redis; si se repite dentro de la ventana de tolerancia, se rechaza (anti-replay)
- La comparación de firmas usa constant-time para prevenir timing attacks

**Modo legacy:** Si no se envía `X-Nonce`, la firma se calcula solo sobre el body (compatible con clientes anteriores, pero sin protección anti-replay completa).

### Admin API

```bash
# 1. Setup inicial (solo la primera vez, requiere JWT_SECRET como setup_secret)
curl -X POST http://localhost:3000/api/admin/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "mi-password-segura", "setup_secret": "<JWT_SECRET>"}'

# 2. Login con credenciales
curl -X POST http://localhost:3000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "mi-password-segura"}'
# → {"token": "eyJ...", "expires_in": "2h", "user": {...}}

# 3. Usar el token
Authorization: Bearer {jwt_token}
```

> **Cambio importante:** Ya no se usa `JWT_SECRET` como credencial de login. El admin se autentica con usuario + contraseña. El `JWT_SECRET` solo se usa como signing key (nunca sale del servidor).

## Ejemplo de validación

```bash
# Generar firma con nonce anti-replay
BODY='{"code":"12345678907","project_id":"<uuid>"}'
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NONCE=$(uuidgen)
SIGN_PAYLOAD="POST\n/api/v1/validate\n${TIMESTAMP}\n${NONCE}\n${BODY}"
SIGNATURE=$(printf "$SIGN_PAYLOAD" | openssl dgst -sha256 -hmac "<api_secret>" | cut -d' ' -f2)

curl -X POST http://localhost:3000/api/v1/validate \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <api_key>" \
  -H "X-Timestamp: $TIMESTAMP" \
  -H "X-Nonce: $NONCE" \
  -H "X-Signature: $SIGNATURE" \
  -d "$BODY"
```

## Pipeline de validación

El motor ejecuta 7 fases secuenciales:

1. **Normalización** — Unicode NFKC + filtro ASCII + elimina separadores + case
2. **Estructura** — Verifica longitud, charset, prefijo
3. **Segmentos** — Valida cada segmento (fixed, numeric, alpha, enum, date, **hmac**)
4. **Dígito de control** — Luhn, MOD10, MOD11, MOD97, Verhoeff, Damm o Custom DSL
5. **Vigencia** — Estado activo + rango temporal del proyecto
5b. **Geo-fencing** — Restricción geográfica en 3 niveles
6. **Unicidad** — HMAC-keyed hash + Redlock + INSERT atómico (single-use)

## Segmento HMAC — Autenticidad criptográfica sin prealmacenamiento

OmniCodex **no almacena códigos previamente**. La responsabilidad de generar códigos seguros recae en el fabricante. Para garantizar que los códigos no puedan ser fabricados por atacantes, OmniCodex soporta un **segmento HMAC** (autenticador criptográfico):

### Cómo funciona

El fabricante y OmniCodex comparten un secreto (`fabricant_secret`) configurado en la regla de código. El fabricante genera cada código con una porción HMAC truncada que prueba la autenticidad:

```
[prefijo][lote][serial_aleatorio][hmac_truncado][check_digit]
```

**Ejemplo conceptual:**

```
PRO-26-A7K9M2-F8C1B3-7
 │    │    │       │    └─ check digit (Luhn)
 │    │    │       └────── HMAC truncado (6 chars, verifica autenticidad)
 │    │    └────────────── serial aleatorio (6 chars, ~31 bits entropía)
 │    └─────────────────── lote/fecha (2 chars)
 └──────────────────────── prefijo fijo
```

El HMAC se calcula como: `HMAC-SHA256(lote + serial, fabricant_secret)` truncado a los primeros N caracteres hex.

### Configuración en el Rule Builder

```json
{
  "segments": [
    { "name": "prefix", "type": "fixed", "length": 3, "value": "PRO" },
    { "name": "batch", "type": "numeric", "length": 2 },
    { "name": "serial", "type": "alphanumeric", "length": 6 },
    { "name": "auth", "type": "hmac", "length": 6, "appliesTo": ["batch", "serial"] },
    { "name": "check", "type": "check", "length": 1, "algorithm": "luhn", "appliesTo": ["batch", "serial", "auth"] }
  ]
}
```

Con `fabricant_secret` configurado en la regla. Sin conocer este secreto, un atacante no puede generar códigos válidos aunque conozca la estructura completa.

### Security Linter

Al crear una regla, OmniCodex ejecuta un linter de seguridad que:
- Rechaza reglas con menos de 20 bits de entropía efectiva
- Rechaza reglas con segmento HMAC pero sin `fabricant_secret`
- Advierte si no hay segmento HMAC (códigos sin autenticidad criptográfica)
- Advierte si el segmento HMAC es demasiado corto (menos de 6 chars)

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

El panel usa login con usuario y contraseña. En el primer uso, crea un admin:

```bash
curl -X POST http://localhost:3000/api/admin/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "mi-password", "setup_secret": "<JWT_SECRET>"}'
```

Luego inicia sesión en el panel con usuario y contraseña. Los tokens JWT expiran en 2 horas.

### Funcionalidades

- **Dashboard** — Estado de salud, conteo de tenants
- **Tenants** — CRUD completo, rotar API Keys, países baneados
- **Projects** — Crear/editar proyectos por tenant
- **Code Rules** — Gestión de reglas + Rule Builder visual con security linter
- **Code Tester** — Probar códigos con resultado debug (solo admin)
- **Stats** — Gráficas de canjes por día, por regla

## Docker (producción)

```bash
docker compose up -d
```

Levanta PostgreSQL 16, Redis 7, la API (puerto 3000) y el Admin Panel (puerto 8080).

## Seguridad

### Variables de entorno de seguridad

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `JWT_SECRET` | Clave de firma JWT (solo servidor, nunca en cliente) | `dev-jwt-secret` |
| `CODE_HASH_PEPPER` | Pepper para HMAC-keyed hash de códigos almacenados | `dev-pepper-change-in-production` |
| `HMAC_TOLERANCE_SECONDS` | Ventana de tolerancia anti-replay | `60` |
| `STORE_PLAIN_CODES` | Almacenar código en texto plano (solo debug, nunca en prod) | `false` |
| `CORS_ORIGIN` | Origen CORS permitido en producción | `https://admin.omnicodex.com` |
| `GLOBAL_BANNED_COUNTRIES` | Países baneados globalmente | _(vacío)_ |

### Medidas de seguridad implementadas

- **Anti-replay con nonce**: Cada petición incluye un nonce único almacenado en Redis; no se acepta dos veces
- **Constant-time comparison**: Las firmas HMAC se comparan en tiempo constante (previene timing attacks)
- **HMAC-keyed code storage**: Los códigos se almacenan como HMAC(code, pepper), no como SHA-256 plano
- **Unicode NFKC + ASCII filter**: Previene ataques de homóglifos (caracteres visualmente idénticos pero distintos)
- **Tenant scoping (anti-BOLA)**: Todas las queries de validación y listado están scoped al tenant autenticado
- **Security linter**: Bloquea reglas con configuración insegura (baja entropía, HMAC sin secreto, etc.)
- **Custom DSL (no vm/vm2)**: Las funciones custom usan un DSL declarativo JSON, no ejecución de código
- **Admin auth con usuarios**: Login real con usuario/contraseña, tokens de 2h, setup inicial protegido
- **Swagger disabled in prod**: La documentación API no se expone en producción
- **CORS restringido en prod**: Solo orígenes configurados
- **Respuestas mínimas**: La API pública no devuelve detalles internos en errores

### Recomendaciones para producción

1. Reverse proxy (Nginx/HAProxy) delante de la API con TLS termination
2. `JWT_SECRET` y `CODE_HASH_PEPPER` con valores criptográficamente fuertes
3. `STORE_PLAIN_CODES=false` siempre
4. Rate limiting adicional a nivel de edge/WAF
5. IP allowlist para endpoints admin
6. Monitorización de patrones anómalos: alta tasa de códigos inválidos, exploración secuencial

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
