# CodeGuard — Motor de Validación de Códigos Únicos

## Middleware para OmniWallet · Gran Consumo

---

## 1. Visión General

CodeGuard es un microservicio middleware independiente que valida códigos únicos desechables impresos por fabricantes de productos de gran consumo. Los consumidores escanean estos códigos desde su entorno OmniWallet para obtener puntos de fidelización.

**Concepto clave:** No se pre-generan ni intercambian códigos entre fabricante y plataforma. Se define la **norma de generación** (estructura, longitud, algoritmo de dígito de control) y CodeGuard valida en tiempo real cualquier código que cumpla esa norma, registrándolo como usado para garantizar single-use.

### Flujo Principal

1. Fabricante imprime códigos únicos en productos (bajo tapas, etiquetas, etc.)
2. Consumidor escanea QR/código desde la app/webapp OmniWallet
3. OmniWallet envía `POST /api/v1/validate` a CodeGuard
4. CodeGuard valida estructura + dígito de control + unicidad → responde OK/KO
5. Si OK: invalida código, devuelve metadata producto/campaña a OmniWallet
6. OmniWallet asigna puntos, registra transacción CDP, notifica usuario, sincroniza sistemas

---

## 2. Stack Tecnológico

| Componente | Tecnología | Justificación |
|---|---|---|
| Runtime | Node.js + TypeScript | Consistencia ecosistema OW, tipado fuerte |
| Framework API | Fastify | Alto rendimiento, JSON Schema validation nativa |
| Base de datos | PostgreSQL 16+ | ACID, índices únicos, particionamiento |
| Caché/Locks | Redis 7+ | Redlock (bloqueos distribuidos), caché reglas, rate limiting |
| ORM | Prisma | Migraciones, typesafe queries |
| Auth API | API Keys + HMAC-SHA256 | Firma de peticiones, prevención replay attacks |
| Contenedores | Docker + Docker Compose | Despliegue aislado |
| Docs API | OpenAPI 3.1 / Swagger | Autogenerada |
| Admin UI | React + TypeScript + Tailwind + shadcn/ui | Consistencia con OW |

---

## 3. Modelo de Datos (Prisma Schema)

### 3.1 Tenant

Representa un cliente de OmniWallet.

```prisma
model Tenant {
  id            String    @id @default(uuid())
  owTenantId    String    @unique @map("ow_tenant_id")
  name          String
  apiKey        String    @unique @map("api_key")
  apiSecret     String    @map("api_secret")
  isActive      Boolean   @default(true) @map("is_active")
  webhookUrl    String?   @map("webhook_url")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  projects      Project[]

  @@map("tenants")
}
```

### 3.2 Project

Agrupa configuraciones de código bajo un contexto (campaña, acuerdo con fabricante).

```prisma
model Project {
  id          String     @id @default(uuid())
  tenantId    String     @map("tenant_id")
  tenant      Tenant     @relation(fields: [tenantId], references: [id])
  name        String
  description String?
  startsAt    DateTime?  @map("starts_at")
  endsAt      DateTime?  @map("ends_at")
  isActive    Boolean    @default(true) @map("is_active")
  metadata    Json?
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")
  codeRules   CodeRule[]

  @@map("projects")
}
```

### 3.3 CodeRule

Define la estructura y reglas de validación para un tipo de código.

```prisma
model CodeRule {
  id                  String         @id @default(uuid())
  projectId           String         @map("project_id")
  project             Project        @relation(fields: [projectId], references: [id])
  name                String
  skuReference        String?        @map("sku_reference")
  totalLength         Int            @map("total_length")
  charset             Charset
  customCharset       String?        @map("custom_charset")
  hasCheckDigit       Boolean        @map("has_check_digit")
  checkAlgorithm      CheckAlgorithm? @map("check_algorithm")
  checkDigitPosition  CheckDigitPos?  @map("check_digit_position")
  structureDef        Json           @map("structure_def")
  separator           String?
  caseSensitive       Boolean        @default(false) @map("case_sensitive")
  prefix              String?
  maxRedemptions      Int            @default(1) @map("max_redemptions")
  productInfo         Json?          @map("product_info")
  campaignInfo        Json?          @map("campaign_info")
  pointsValue         Int?           @map("points_value")
  customCheckFunction String?        @map("custom_check_function")
  isActive            Boolean        @default(true) @map("is_active")
  createdAt           DateTime       @default(now()) @map("created_at")
  updatedAt           DateTime       @updatedAt @map("updated_at")
  redeemedCodes       RedeemedCode[]

  @@map("code_rules")
}

enum Charset {
  NUMERIC
  ALPHA_UPPER
  ALPHA_LOWER
  ALPHANUMERIC
  CUSTOM
}

enum CheckAlgorithm {
  LUHN
  MOD10
  MOD11
  MOD97
  VERHOEFF
  DAMM
  CUSTOM
}

enum CheckDigitPos {
  LAST
  FIRST
}
```

### 3.4 RedeemedCode

Almacena códigos consumidos. Tabla crítica para unicidad.

```prisma
model RedeemedCode {
  id                String    @id @default(uuid())
  codeRuleId        String    @map("code_rule_id")
  codeRule          CodeRule  @relation(fields: [codeRuleId], references: [id])
  codeHash          String    @map("code_hash") @db.VarChar(64)
  codePlain         String?   @map("code_plain")
  owUserId          String?   @map("ow_user_id")
  owTransactionId   String?   @map("ow_transaction_id")
  redemptionCount   Int       @default(1) @map("redemption_count")
  redeemedAt        DateTime  @default(now()) @map("redeemed_at")
  ipAddress         String?   @map("ip_address")
  metadata          Json?
  createdAt         DateTime  @default(now()) @map("created_at")

  @@unique([codeRuleId, codeHash])
  @@index([owUserId])
  @@index([redeemedAt])
  @@map("redeemed_codes")
}
```

**Índice único crítico:** `@@unique([codeRuleId, codeHash])` garantiza a nivel de BD que un código no puede registrarse dos veces para la misma regla, incluso bajo alta concurrencia.

---

## 4. Definición de Estructura por Segmentos (structure_def JSON)

El campo `structureDef` define los segmentos del código. TypeScript interface:

```typescript
interface StructureDefinition {
  segments: Segment[];
}

interface BaseSegment {
  name: string;         // Identificador del segmento
  length: number;       // Longitud en caracteres
  description?: string; // Descripción humana
}

interface FixedSegment extends BaseSegment {
  type: 'fixed';
  value: string;        // Valor esperado exacto
}

interface NumericSegment extends BaseSegment {
  type: 'numeric';
  min?: number;         // Valor mínimo (inclusive)
  max?: number;         // Valor máximo (inclusive)
}

interface AlphaSegment extends BaseSegment {
  type: 'alpha';
  case?: 'upper' | 'lower' | 'both';
}

interface AlphanumericSegment extends BaseSegment {
  type: 'alphanumeric';
}

interface CheckSegment extends BaseSegment {
  type: 'check';
  algorithm: string;        // Referencia al checkAlgorithm de la CodeRule
  appliesTo: string[];      // Nombres de segmentos sobre los que se calcula
}

interface DateSegment extends BaseSegment {
  type: 'date';
  format: string;           // 'YYYYMMDD' | 'YYDDD' | 'YYMMDD' | etc.
}

interface EnumSegment extends BaseSegment {
  type: 'enum';
  values: string[];         // Valores válidos permitidos
}

type Segment = FixedSegment | NumericSegment | AlphaSegment | AlphanumericSegment | CheckSegment | DateSegment | EnumSegment;
```

### Ejemplo: código `DN-2026-ABCD1234-7`

```json
{
  "segments": [
    { "name": "brand_prefix", "length": 2, "type": "fixed", "value": "DN" },
    { "name": "year", "length": 4, "type": "numeric", "min": 2024, "max": 2030 },
    { "name": "unique_code", "length": 8, "type": "alphanumeric" },
    { "name": "check_digit", "length": 1, "type": "check", "algorithm": "luhn", "appliesTo": ["unique_code"] }
  ]
}
```

---

## 5. Motor de Validación — Pipeline

El pipeline ejecuta fases secuenciales. Si una falla, se detiene y retorna el error específico.

### Fase 1 — Normalización (`src/modules/validation/normalizer.ts`)
- Eliminar separadores definidos en la regla
- Aplicar transformación case según `caseSensitive`
- Trim whitespace
- Output: código normalizado para todas las fases posteriores

### Fase 2 — Validación de Estructura (`src/modules/validation/structure.ts`)
- Verificar longitud total vs `totalLength`
- Verificar charset global (solo caracteres permitidos)
- Verificar `prefix` si está definido

### Fase 3 — Validación de Segmentos (`src/modules/validation/segments.ts`)
- Descomponer código según `structureDef`
- Validar cada segmento según su tipo:
  - `fixed`: coincidencia exacta con `value`
  - `numeric`: rango `min`/`max`
  - `alpha`: case correcto
  - `enum`: pertenencia al conjunto `values`
  - `date`: formato válido y fecha existente

### Fase 4 — Dígito de Control (`src/modules/validation/check-digit.ts`)
- Si `hasCheckDigit` = true:
  - Extraer dígito según `checkDigitPosition`
  - Calcular con algoritmo configurado sobre segmentos `appliesTo`
  - Comparar calculado vs extraído

**Algoritmos a implementar:**

| Algoritmo | Archivo | Descripción |
|---|---|---|
| LUHN | `check-digit/luhn.ts` | Detecta errores 1 dígito y transposiciones adyacentes |
| MOD10 | `check-digit/mod10.ts` | Módulo 10 simple (suma de dígitos) |
| MOD11 | `check-digit/mod11.ts` | Módulo 11 con pesos ponderados |
| MOD97 | `check-digit/mod97.ts` | ISO 7064, para alfanuméricos largos |
| VERHOEFF | `check-digit/verhoeff.ts` | Detecta todos los errores de 1 dígito |
| DAMM | `check-digit/damm.ts` | Anti-transposición total (quasigrupo) |
| CUSTOM | `check-digit/custom.ts` | Función JS sandboxed (vm2, timeout 100ms) |

### Fase 5 — Vigencia (`src/modules/validation/vigency.ts`)
- Verificar `project.isActive` y `codeRule.isActive`
- Verificar `project.startsAt` / `project.endsAt`

### Fase 6 — Unicidad (Operación Atómica) (`src/modules/validation/uniqueness.ts`)
1. Calcular SHA-256 del código normalizado
2. Adquirir lock Redis (Redlock): `codeguard:lock:{codeRuleId}:{codeHash}`
3. `INSERT INTO redeemed_codes ... ON CONFLICT (code_rule_id, code_hash) DO NOTHING`
4. Si INSERT no afecta filas → `ALREADY_REDEEMED`
5. Si INSERT exitoso → código invalidado
6. Liberar lock Redis

---

## 6. API REST — Validation API (Para OmniWallet)

### Autenticación

Headers requeridos en cada petición:
```
X-Api-Key: {tenant.apiKey}
X-Signature: HMAC-SHA256(requestBody, tenant.apiSecret)
X-Timestamp: ISO8601 datetime (rechazar si >5 min diferencia → previene replay)
Content-Type: application/json
```

### POST /api/v1/validate

**Endpoint principal.** Valida y consume un código en operación atómica.

**Request:**
```json
{
  "code": "DN-2026-ABCD1234-7",
  "project_id": "uuid-proyecto",
  "ow_user_id": "uuid-usuario-ow",
  "ow_transaction_id": "uuid-transaccion",
  "metadata": {
    "scan_source": "mobile_app",
    "geo": { "lat": 41.3851, "lng": 2.1734 }
  }
}
```

**Response OK (200):**
```json
{
  "status": "OK",
  "code": "DN-2026-ABCD1234-7",
  "code_normalized": "DN2026ABCD12347",
  "project": {
    "id": "uuid-proyecto",
    "name": "Campaña Danone Verano 2026"
  },
  "code_rule": {
    "id": "uuid-regla",
    "name": "Yogur Natural 500g"
  },
  "product_info": {
    "sku": "DN-YN-500",
    "name": "Yogur Natural Danone 500g",
    "category": "Lácteos",
    "brand": "Danone"
  },
  "campaign_info": {
    "name": "Verano Saludable 2026",
    "suggested_points": 50
  },
  "redeemed_at": "2026-02-08T10:30:15.123Z",
  "redemption_id": "uuid-canje"
}
```

**Response KO:**
```json
{
  "status": "KO",
  "error_code": "ALREADY_REDEEMED",
  "error_message": "Este código ya ha sido utilizado",
  "details": {
    "redeemed_at": "2026-02-08T09:15:00Z"
  }
}
```

**Error codes:**

| error_code | HTTP | Descripción |
|---|---|---|
| `INVALID_STRUCTURE` | 400 | Longitud o charset incorrectos |
| `INVALID_SEGMENT` | 400 | Segmento específico no válido |
| `INVALID_CHECK_DIGIT` | 400 | Dígito de control incorrecto |
| `NO_MATCHING_RULE` | 404 | No hay regla que coincida |
| `ALREADY_REDEEMED` | 409 | Código ya canjeado |
| `PROJECT_INACTIVE` | 403 | Proyecto inactivo |
| `PROJECT_EXPIRED` | 403 | Proyecto fuera de vigencia |
| `RULE_INACTIVE` | 403 | Regla desactivada |
| `RATE_LIMITED` | 429 | Demasiadas peticiones |
| `AUTH_FAILED` | 401 | API Key/firma HMAC inválida |

### GET /api/v1/validate/check

Pre-validación sin consumir. Misma lógica sin Fase 6.

```
GET /api/v1/validate/check?code=DN-2026-ABCD1234-7&project_id=uuid
```

### GET /api/v1/codes/{redemption_id}

Consulta un canje específico.

### GET /api/v1/codes

Lista canjes con filtros y paginación.

```
GET /api/v1/codes?project_id=X&from=2026-01-01&to=2026-02-08&page=1&limit=50
```

### GET /api/v1/stats/{project_id}

Estadísticas agregadas del proyecto.

```json
{
  "project_id": "uuid",
  "total_redemptions": 45230,
  "unique_users": 12450,
  "by_rule": [
    { "rule_id": "...", "rule_name": "Yogur Natural", "count": 28100 }
  ],
  "by_day": [{ "date": "2026-02-07", "count": 1523 }],
  "error_rate": 0.034,
  "top_errors": [
    { "error_code": "ALREADY_REDEEMED", "count": 890 }
  ]
}
```

---

## 7. API REST — Admin API (Configuración)

Autenticación: Bearer JWT con roles admin. Solo para equipo OmniWallet.

### Tenants
- `POST /api/admin/tenants` — Crear tenant (vincula ow_tenant_id)
- `GET /api/admin/tenants` — Listar
- `GET /api/admin/tenants/{id}` — Detalle
- `PUT /api/admin/tenants/{id}` — Actualizar
- `POST /api/admin/tenants/{id}/rotate-keys` — Rotar API Key/Secret

### Projects
- `POST /api/admin/tenants/{tenant_id}/projects` — Crear
- `GET /api/admin/tenants/{tenant_id}/projects` — Listar
- `GET /api/admin/projects/{id}` — Detalle
- `PUT /api/admin/projects/{id}` — Actualizar
- `DELETE /api/admin/projects/{id}` — Soft delete

### Code Rules
- `POST /api/admin/projects/{project_id}/rules` — Crear
- `GET /api/admin/projects/{project_id}/rules` — Listar
- `GET /api/admin/rules/{id}` — Detalle
- `PUT /api/admin/rules/{id}` — Actualizar
- `POST /api/admin/rules/{id}/test` — Probar código contra regla (sin registrar)

### Tools
- `POST /api/admin/tools/generate-sample` — Genera códigos ejemplo válidos
- `GET /api/admin/audit-log` — Log de auditoría

---

## 8. Seguridad y Anti-Fraude

### Seguridad
- **Hashing códigos:** SHA-256 en `redeemed_codes` (texto plano configurable por tenant)
- **HMAC peticiones:** Firma del body previene manipulación
- **Timestamp validation:** Rechazo si >5 min diferencia (anti-replay)
- **TLS obligatorio:** Solo HTTPS
- **Sandbox CUSTOM:** vm2 con timeout 100ms, sin I/O

### Anti-Fraude
- **Rate limiting por usuario:** Max N validaciones/min configurable por proyecto
- **Rate limiting por IP:** Complementario
- **Detección patrones:** Muchos códigos inválidos consecutivos → bloqueo temporal + alerta
- **Geo-fencing (opcional):** Restringir validación a regiones si se envía geolocalización
- **Campo metadata:** Reservado para device fingerprinting futuro

---

## 9. Rendimiento

### Objetivos
| Métrica | Objetivo |
|---|---|
| Latencia validación p95 | < 100ms |
| Throughput | > 1.000 validaciones/seg (1 instancia) |
| Disponibilidad | 99.9% |

### Estrategias
- Particionamiento `redeemed_codes` por `code_rule_id` o rango temporal
- Caché CodeRules en Redis (TTL 5 min)
- Connection pooling PostgreSQL
- Escalabilidad horizontal (múltiples instancias + Redlock)

---

## 10. Health Checks

- `GET /health` — Estado general
- `GET /health/ready` — Readiness (PostgreSQL + Redis OK)
- `GET /health/live` — Liveness (proceso activo)

---

## 11. Estructura del Proyecto

```
codeguard/
├── src/
│   ├── server.ts                      # Entry point Fastify
│   ├── config/
│   │   └── index.ts                   # Environment config
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── api-key.ts             # Verificación API Key
│   │   │   ├── hmac.ts                # Verificación HMAC-SHA256
│   │   │   └── jwt.ts                 # JWT para Admin API
│   │   ├── tenants/
│   │   │   ├── routes.ts
│   │   │   ├── service.ts
│   │   │   └── schemas.ts
│   │   ├── projects/
│   │   │   ├── routes.ts
│   │   │   ├── service.ts
│   │   │   └── schemas.ts
│   │   ├── code-rules/
│   │   │   ├── routes.ts
│   │   │   ├── service.ts
│   │   │   └── schemas.ts
│   │   ├── validation/
│   │   │   ├── pipeline.ts            # Orquestador del pipeline
│   │   │   ├── normalizer.ts          # Fase 1
│   │   │   ├── structure.ts           # Fase 2
│   │   │   ├── segments.ts            # Fase 3
│   │   │   ├── check-digit/           # Fase 4
│   │   │   │   ├── index.ts           # Factory/dispatcher
│   │   │   │   ├── luhn.ts
│   │   │   │   ├── mod10.ts
│   │   │   │   ├── mod11.ts
│   │   │   │   ├── mod97.ts
│   │   │   │   ├── verhoeff.ts
│   │   │   │   ├── damm.ts
│   │   │   │   └── custom.ts          # Sandbox vm2
│   │   │   ├── vigency.ts             # Fase 5
│   │   │   ├── uniqueness.ts          # Fase 6 (atómica)
│   │   │   ├── routes.ts              # POST /validate, GET /validate/check
│   │   │   └── schemas.ts             # JSON Schema validación request/response
│   │   ├── stats/
│   │   │   ├── routes.ts
│   │   │   └── service.ts
│   │   └── audit/
│   │       ├── routes.ts
│   │       └── service.ts
│   ├── middleware/
│   │   ├── rate-limiter.ts
│   │   ├── request-logger.ts
│   │   └── error-handler.ts
│   ├── utils/
│   │   ├── crypto.ts                  # SHA-256, HMAC helpers
│   │   ├── redis.ts                   # Redis client + Redlock
│   │   └── logger.ts                  # Structured JSON logging
│   └── types/
│       ├── validation.ts              # Tipos del pipeline
│       ├── api.ts                     # Request/Response types
│       └── structure-def.ts           # Interfaces de segmentos
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── admin-ui/                          # Panel React (Fase 3)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Tenants.tsx
│   │   │   ├── Projects.tsx
│   │   │   ├── CodeRules.tsx
│   │   │   ├── RuleBuilder.tsx        # Constructor visual de reglas
│   │   │   ├── CodeTester.tsx         # Probador modo debug
│   │   │   └── Stats.tsx
│   │   └── components/
│   ├── package.json
│   └── tsconfig.json
├── tests/
│   ├── unit/
│   │   ├── validation/                # Tests motor validación
│   │   │   ├── normalizer.test.ts
│   │   │   ├── structure.test.ts
│   │   │   ├── segments.test.ts
│   │   │   ├── check-digit.test.ts    # Tests todos los algoritmos
│   │   │   └── pipeline.test.ts       # Tests integración pipeline
│   │   └── auth/
│   ├── integration/
│   │   ├── validate.test.ts           # E2E validation flow
│   │   ├── admin.test.ts              # CRUD operations
│   │   └── concurrency.test.ts        # Race condition tests
│   └── load/
│       └── k6-validate.js             # Load testing
├── docs/
│   ├── openapi.yaml                   # Spec OpenAPI completa
│   └── integration-guide.md           # Guía para equipo OW
├── docker-compose.yml                 # PostgreSQL + Redis + App
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## 12. Plan de Desarrollo por Fases

### Fase 1 — MVP (Semanas 1-3)
- Setup: Fastify + TypeScript + Prisma + PostgreSQL + Docker
- Modelo de datos completo
- Motor de validación: Pipeline con Luhn y Mod10
- Validation API: POST /validate y GET /validate/check
- Auth: API Key + HMAC
- Admin API básica: CRUD tenants, proyectos, reglas
- OpenAPI básica
- Tests unitarios motor validación

### Fase 2 — Robustez (Semanas 4-5)
- Redis: Redlock + caché CodeRules
- Rate limiting (usuario + IP)
- Todos los algoritmos check digit
- Estadísticas endpoint
- Health checks
- Tests integración y carga

### Fase 3 — Panel Admin (Semanas 6-7)
- Panel React: Dashboard, CRUD
- Constructor visual CodeRules
- Probador de códigos (modo debug)
- Estadísticas y gráficas

### Fase 4 — Integración y Producción (Semana 8+)
- Documentación integración completa para equipo OW
- Sandbox/entorno pruebas
- Algoritmo CUSTOM (sandbox)
- Geo-fencing
- Deploy producción
- Monitorización y alertas

---

## 13. Responsabilidades CodeGuard vs OmniWallet

| CodeGuard | OmniWallet |
|---|---|
| Validar estructura del código | UI de escaneo al usuario |
| Validar dígito de control | Definir reglas de puntos |
| Garantizar unicidad (single-use) | Asignar puntos al usuario |
| Almacenar códigos consumidos | Almacenar transacción CDP |
| Devolver info producto/campaña | Notificar al usuario |
| Rate limiting y anti-fraude | Sincronizar sistemas externos |
| Estadísticas de canjes | Reportes de negocio |
| Gestionar reglas de código | Gestionar programas fidelización |

---

## 14. Variables de Entorno

```env
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://codeguard:secret@localhost:5432/codeguard

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=your-jwt-secret-for-admin
HMAC_TOLERANCE_SECONDS=300

# Rate Limiting
RATE_LIMIT_PER_USER_PER_MINUTE=30
RATE_LIMIT_PER_IP_PER_MINUTE=100

# Security
STORE_PLAIN_CODES=false
CUSTOM_FUNCTION_TIMEOUT_MS=100
```
