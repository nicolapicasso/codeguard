# CodeGuard — Motor de Validación de Códigos Únicos

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
6. **Unicidad** — SHA-256 + Redlock + INSERT atómico (garantiza single-use)

## Docker (producción)

```bash
docker compose up -d
```

Levanta PostgreSQL 16, Redis 7 y la aplicación.

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
│   │   │   └── uniqueness.ts         # Fase 6
│   │   └── stats/                    # Estadísticas
│   ├── middleware/                    # Rate limiting, logging, errors
│   └── utils/                        # Crypto, Redis, Prisma, Cache
├── prisma/                           # Schema + migraciones + seed
├── tests/                            # Unit + integration + load
├── docker-compose.yml
└── Dockerfile
```
