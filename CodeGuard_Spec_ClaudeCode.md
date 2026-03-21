# OmniCodex — Especificación Técnica

## Motor de Validación de Códigos Únicos · Middleware para OmniWallet

> **Versión del documento:** 2.0  
> **Rama de referencia:** `main`  
> **Archivo anterior:** `CodeGuard_Spec_ClaudeCode.md` (obsoleto, no usar)

---

## Índice

1. [Visión General](#1-visión-general)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Modelo de Datos](#3-modelo-de-datos)
4. [Definición de Estructura por Segmentos](#4-definición-de-estructura-por-segmentos)
5. [Motor de Validación — Pipeline (7 fases)](#5-motor-de-validación--pipeline-7-fases)
6. [Segmento HMAC — Autenticidad Criptográfica](#6-segmento-hmac--autenticidad-criptográfica)
7. [Geo-fencing — Control Geográfico](#7-geo-fencing--control-geográfico)
8. [API REST — Validation API](#8-api-rest--validation-api)
9. [API REST — Admin API](#9-api-rest--admin-api)
10. [Autenticación](#10-autenticación)
11. [Seguridad y Anti-Fraude](#11-seguridad-y-anti-fraude)
12. [Panel de Administración](#12-panel-de-administración)
13. [Despliegue](#13-despliegue)
14. [Variables de Entorno](#14-variables-de-entorno)
15. [Testing](#15-testing)
16. [Estructura del Proyecto](#16-estructura-del-proyecto)
17. [Responsabilidades OmniCodex vs OmniWallet](#17-responsabilidades-omnicodex-vs-omniwallet)

---

## 1. Visión General

OmniCodex es un microservicio middleware independiente que valida códigos únicos desechables impresos por fabricantes de productos de gran consumo. Los consumidores escanean estos códigos desde OmniWallet para obtener puntos de fidelización u otras recompensas.

### Concepto fundamental

OmniCodex **no pre-almacena los códigos**. En lugar de ello, el fabricante acuerda con OmniCodex la **norma de generación** del código (estructura, segmentos, algoritmo de dígito de control, y opcionalmente un secreto HMAC). OmniCodex valida en tiempo real cualquier código que cumpla esa norma, registrándolo como canjeado para garantizar single-use.

Esto elimina la necesidad de intercambiar catálogos de millones de códigos entre fabricante y plataforma, y reduce la superficie de ataque ante posibles filtraciones.

### Flujo principal

```
Fabricante                 OmniWallet                   OmniCodex
    │                          │                             │
    │── imprime código ──────► producto físico              │
    │                          │                             │
    │                  usuario escanea desde app/web         │
    │                          │                             │
    │                          │── POST /api/v1/validate ───►│
    │                          │   (API Key + HMAC + Nonce)  │
    │                          │                             │── pipeline 7 fases
    │                          │                             │── registra canje (atómico)
    │                          │◄── { status: OK/KO } ───────│
    │                          │                             │
    │                  asigna puntos, notifica usuario        │
```

---

## 2. Stack Tecnológico

| Componente | Tecnología | Versión | Notas |
|---|---|---|---|
| Runtime | Node.js | ≥ 20.0.0 | Requerido en `engines` |
| Lenguaje | TypeScript | ^5.6 | `strict` mode |
| Framework API | Fastify | ^5.0.0 | JSON Schema validation nativa |
| ORM | Prisma | ^6.0.0 | Migraciones + typesafe queries |
| Base de datos | PostgreSQL | 16 | ACID, índices únicos |
| Caché / Locks | Redis | 7 | Redlock (locks distribuidos), caché reglas, nonces |
| Locks distribuidos | Redlock | ^5.0.0-beta.2 | Previene doble canje bajo concurrencia |
| Auth (JWT) | jsonwebtoken | ^9.0.0 | Solo Admin API |
| Logging | Pino | ^9.0.0 | JSON estructurado |
| Validación schemas | Zod | ^3.23.0 | Complementario a Fastify schemas |
| GeoIP | geoip-lite | ^1.4.10 | Base de datos MaxMind GeoLite2 local |
| Contenedores | Docker + Compose | — | Dev + producción |
| Docs API | Swagger UI | @fastify/swagger-ui ^5 | Deshabilitado en `NODE_ENV=production` |
| Admin UI | React + Vite + Tailwind + shadcn/ui | — | Ver sección 12 |
| Testing | Vitest | ^2.0.0 | Unit + integration |

---

## 3. Modelo de Datos

### 3.1 Tenant

Representa un cliente/fabricante conectado a OmniWallet.

```prisma
model Tenant {
  id             String    @id @default(uuid())
  owTenantId     String    @unique  @map("ow_tenant_id")
  name           String
  apiKey         String    @unique  @map("api_key")
  apiSecret      String             @map("api_secret")
  isActive       Boolean   @default(true) @map("is_active")
  webhookUrl     String?            @map("webhook_url")
  bannedCountries String[]          @map("banned_countries")   // Tier 2 geo-fencing
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt     @map("updated_at")
  projects       Project[]

  @@map("tenants")
}
```

### 3.2 Project

Agrupa reglas de código bajo un contexto de campaña o acuerdo con fabricante.

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
  updatedAt   DateTime   @updatedAt     @map("updated_at")
  codeRules   CodeRule[]

  @@map("projects")
}
```

### 3.3 CodeRule

Define la estructura y las reglas de validación para un tipo de código.

```prisma
model CodeRule {
  id               String          @id @default(uuid())
  projectId        String          @map("project_id")
  project          Project         @relation(fields: [projectId], references: [id])
  name             String
  skuReference     String?         @map("sku_reference")
  totalLength      Int             @map("total_length")
  charset          Charset
  customCharset    String?         @map("custom_charset")
  hasCheckDigit    Boolean         @map("has_check_digit")
  checkAlgorithm   CheckAlgorithm? @map("check_algorithm")
  checkDigitPosition CheckDigitPos? @map("check_digit_position")
  structureDef     Json            @map("structure_def")
  separator        String?
  caseSensitive    Boolean         @default(false) @map("case_sensitive")
  prefix           String?
  maxRedemptions   Int             @default(1) @map("max_redemptions")
  fabricantSecret  String?         @map("fabricant_secret")   // Secreto compartido para segmento HMAC
  allowedCountries String[]        @map("allowed_countries")  // Tier 3 geo-fencing (whitelist)
  productInfo      Json?           @map("product_info")
  campaignInfo     Json?           @map("campaign_info")
  pointsValue      Int?            @map("points_value")
  isActive         Boolean         @default(true) @map("is_active")
  createdAt        DateTime        @default(now()) @map("created_at")
  updatedAt        DateTime        @updatedAt     @map("updated_at")
  redeemedCodes    RedeemedCode[]

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

> **Nota sobre CUSTOM DSL:** El algoritmo `CUSTOM` usa un DSL declarativo JSON, **no** ejecución de código arbitrario (ni `vm`, ni `vm2`). Esto elimina el vector de ataque de sandbox escape.

### 3.4 RedeemedCode

Almacena los códigos ya consumidos. Tabla crítica para garantizar single-use.

```prisma
model RedeemedCode {
  id              String    @id @default(uuid())
  codeRuleId      String    @map("code_rule_id")
  codeRule        CodeRule  @relation(fields: [codeRuleId], references: [id])
  codeHash        String    @map("code_hash") @db.VarChar(64)  // HMAC-keyed hash, nunca SHA-256 plano
  codePlain       String?   @map("code_plain")                  // Solo si STORE_PLAIN_CODES=true (solo dev)
  owUserId        String?   @map("ow_user_id")
  owTransactionId String?   @map("ow_transaction_id")
  redemptionCount Int       @default(1) @map("redemption_count")
  redeemedAt      DateTime  @default(now()) @map("redeemed_at")
  ipAddress       String?   @map("ip_address")
  detectedCountry String?   @map("detected_country")
  metadata        Json?
  createdAt       DateTime  @default(now()) @map("created_at")

  @@unique([codeRuleId, codeHash])
  @@index([owUserId])
  @@index([redeemedAt])
  @@map("redeemed_codes")
}
```

**Índice único crítico:** `@@unique([codeRuleId, codeHash])` garantiza a nivel de base de datos que un código no puede registrarse dos veces para la misma regla, incluso bajo alta concurrencia.

**Almacenamiento seguro:** Los códigos se almacenan como `HMAC(code, CODE_HASH_PEPPER)`, no como SHA-256 plano. Esto protege los códigos ante filtraciones de la base de datos.

### 3.5 AdminUser

Usuario del panel de administración. Autenticación real con credenciales, no con `JWT_SECRET`.

```prisma
model AdminUser {
  id           String   @id @default(uuid())
  username     String   @unique
  passwordHash String   @map("password_hash")
  isActive     Boolean  @default(true) @map("is_active")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt     @map("updated_at")

  @@map("admin_users")
}
```

---

## 4. Definición de Estructura por Segmentos

El campo `structureDef` de `CodeRule` define los segmentos que componen el código. Es un objeto JSON con la siguiente forma:

```typescript
interface StructureDefinition {
  segments: Segment[];
}

// Tipos de segmento disponibles:

interface FixedSegment {
  name: string; type: 'fixed'; length: number; value: string;
}

interface NumericSegment {
  name: string; type: 'numeric'; length: number; min?: number; max?: number;
}

interface AlphaSegment {
  name: string; type: 'alpha'; length: number; case?: 'upper' | 'lower' | 'both';
}

interface AlphanumericSegment {
  name: string; type: 'alphanumeric'; length: number;
}

interface EnumSegment {
  name: string; type: 'enum'; length: number; values: string[];
}

interface DateSegment {
  name: string; type: 'date'; length: number;
  format: 'YYYYMMDD' | 'YYMMDD' | 'YYDDD' | string;
}

interface HmacSegment {
  name: string; type: 'hmac'; length: number;
  appliesTo: string[];  // Nombres de segmentos sobre los que se calcula el HMAC
}

interface CheckSegment {
  name: string; type: 'check'; length: number;
  algorithm: string;    // Referencia al checkAlgorithm de la CodeRule
  appliesTo: string[];  // Nombres de segmentos incluidos en el cálculo
}

type Segment =
  | FixedSegment | NumericSegment | AlphaSegment | AlphanumericSegment
  | EnumSegment | DateSegment | HmacSegment | CheckSegment;
```

### Ejemplo completo: `PRO-26-A7K9M2-F8C1B3-7`

```json
{
  "segments": [
    { "name": "prefix",  "type": "fixed",         "length": 3, "value": "PRO" },
    { "name": "batch",   "type": "numeric",        "length": 2 },
    { "name": "serial",  "type": "alphanumeric",   "length": 6 },
    { "name": "auth",    "type": "hmac",           "length": 6, "appliesTo": ["batch", "serial"] },
    { "name": "check",   "type": "check",          "length": 1, "algorithm": "luhn",
      "appliesTo": ["batch", "serial", "auth"] }
  ]
}
```

Los separadores (guiones, puntos, espacios) se eliminan en la fase de normalización y no forman parte de ningún segmento.

---

## 5. Motor de Validación — Pipeline (7 fases)

El pipeline ejecuta las fases de forma secuencial. Si alguna falla, se detiene y devuelve el error específico.

```
código recibido
     │
     ▼
┌─────────────────────────────────────────────┐
│  Fase 1 · Normalización                     │  normalizer.ts
│  Unicode NFKC + filtro ASCII + separadores  │
│  + case según regla                         │
└─────────────┬───────────────────────────────┘
              ▼
┌─────────────────────────────────────────────┐
│  Fase 2 · Estructura                        │  structure.ts
│  Longitud total + charset + prefijo         │
└─────────────┬───────────────────────────────┘
              ▼
┌─────────────────────────────────────────────┐
│  Fase 3 · Segmentos                         │  segments.ts
│  Descomposición + validación por tipo       │
│  (fixed, numeric, alpha, enum, date, hmac)  │
└─────────────┬───────────────────────────────┘
              ▼
┌─────────────────────────────────────────────┐
│  Fase 4 · Dígito de control                 │  check-digit/
│  Luhn / MOD10 / MOD11 / MOD97 /             │
│  Verhoeff / Damm / Custom DSL               │
└─────────────┬───────────────────────────────┘
              ▼
┌─────────────────────────────────────────────┐
│  Fase 5 · Vigencia                          │  vigency.ts
│  project.isActive + codeRule.isActive       │
│  + rango temporal startsAt / endsAt         │
└─────────────┬───────────────────────────────┘
              ▼
┌─────────────────────────────────────────────┐
│  Fase 5b · Geo-fencing                      │  geo-fencing.ts
│  Tier 1 (global) → Tier 2 (tenant) →        │
│  Tier 3 (rule whitelist)                    │
└─────────────┬───────────────────────────────┘
              ▼
┌─────────────────────────────────────────────┐
│  Fase 6 · Unicidad (atómica)                │  uniqueness.ts
│  HMAC-hash + Redlock + INSERT atómico        │
└─────────────┬───────────────────────────────┘
              ▼
           OK / KO
```

### Detalle de cada fase

**Fase 1 — Normalización** (`normalizer.ts`)
- Aplica Unicode NFKC para prevenir ataques de homóglifos (caracteres visualmente idénticos pero distintos en Unicode)
- Filtra a ASCII puro
- Elimina separadores definidos en la regla (guion, punto, espacio)
- Aplica transformación de case según `caseSensitive`
- Trim de whitespace

**Fase 2 — Estructura** (`structure.ts`)
- Verifica longitud total vs `totalLength`
- Verifica que todos los caracteres pertenecen al `charset` configurado
- Verifica `prefix` si está definido en la regla

**Fase 3 — Segmentos** (`segments.ts`)
- Descompone el código según `structureDef`
- Valida cada segmento según su tipo:
  - `fixed`: coincidencia exacta con `value`
  - `numeric`: dentro del rango `min` / `max`
  - `alpha`: case correcto
  - `enum`: pertenencia al conjunto `values`
  - `date`: formato válido y fecha existente en el calendario
  - `hmac`: delegado a Fase 3 del segmento (cálculo HMAC contra `fabricant_secret`)

**Fase 4 — Dígito de control** (`check-digit/`)
- Solo activa si `hasCheckDigit = true`
- Extrae el dígito según `checkDigitPosition`
- Calcula con el algoritmo configurado sobre los segmentos indicados en `appliesTo`
- Compara calculado vs extraído

| Algoritmo | Archivo | Descripción |
|---|---|---|
| LUHN | `luhn.ts` | Estándar industria. Detecta errores de 1 dígito y transposiciones adyacentes |
| MOD10 | `mod10.ts` | Módulo 10 simple. Compatible con muchos sistemas industriales |
| MOD11 | `mod11.ts` | Módulo 11 con pesos ponderados. Usado en ISBN-10 |
| MOD97 | `mod97.ts` | ISO 7064. Recomendado para códigos alfanuméricos largos (ej: IBAN) |
| VERHOEFF | `verhoeff.ts` | Detecta todos los errores de 1 dígito, incluidas transposiciones |
| DAMM | `damm.ts` | Anti-transposición total (quasigrupo). Sin falsos positivos en 1 error |
| CUSTOM | `custom.ts` | DSL declarativo JSON. **No ejecuta código arbitrario** (sin vm/vm2) |

**Fase 5 — Vigencia** (`vigency.ts`)
- Verifica `project.isActive` y `codeRule.isActive`
- Verifica que `now()` está dentro de `project.startsAt` / `project.endsAt`

**Fase 5b — Geo-fencing** (`geo-fencing.ts`)
- Ver sección 7 para la descripción completa

**Fase 6 — Unicidad** (`uniqueness.ts`) — Operación atómica
1. Calcular `HMAC(codeNormalized, CODE_HASH_PEPPER)` → `codeHash`
2. Adquirir lock Redis (Redlock): `omnicodex:lock:{codeRuleId}:{codeHash}`
3. `INSERT INTO redeemed_codes ... ON CONFLICT (code_rule_id, code_hash) DO NOTHING`
4. Si INSERT no afecta filas → `ALREADY_REDEEMED`
5. Si INSERT exitoso → código marcado como canjeado
6. Liberar lock Redis

---

## 6. Segmento HMAC — Autenticidad Criptográfica

El segmento HMAC permite verificar que un código fue generado por el fabricante legítimo, sin necesidad de prealmacenar ningún código.

### Principio

El fabricante y OmniCodex comparten un `fabricant_secret` configurado en la `CodeRule`. El fabricante genera cada código incluyendo una porción HMAC-SHA256 truncada que prueba su origen:

```
[prefijo][lote][serial_aleatorio][hmac_truncado][check_digit]
```

El HMAC se calcula como:

```
HMAC-SHA256(concat(segmentos_de_appliesTo), fabricant_secret)
→ tomar primeros N caracteres hexadecimales
```

### Por qué es importante

Sin segmento HMAC, cualquier persona que conozca la estructura del código puede fabricar códigos fraudulentos que pasen las fases 1–5. Con el segmento HMAC, solo quien posea el `fabricant_secret` puede generar códigos que OmniCodex acepte.

### Security Linter

Al crear o actualizar una `CodeRule`, OmniCodex ejecuta automáticamente un linter de seguridad que:

| Condición | Acción |
|---|---|
| Menos de 20 bits de entropía efectiva | **Rechaza** la regla |
| Segmento `hmac` sin `fabricant_secret` | **Rechaza** la regla |
| Sin segmento `hmac` | **Aviso** (la regla se acepta) |
| Segmento `hmac` de menos de 6 caracteres | **Aviso** |

---

## 7. Geo-fencing — Control Geográfico

OmniCodex incluye un sistema de geo-fencing en 3 niveles que controla desde qué países pueden canjearse los códigos.

### Detección del país

El país se determina por orden de prioridad:

1. **Detección automática por IP:** Geolocalización mediante la base de datos GeoIP (MaxMind GeoLite2) integrada en el servidor. No requiere llamadas a APIs externas.
2. **Campo `country` del body:** Fallback si la IP no es geolocalizable (IPs privadas, localhost, etc.).

### Los 3 niveles

| Nivel | Ámbito | Tipo | Configuración |
|---|---|---|---|
| **Tier 1** | Global | Blacklist | Variable de entorno `GLOBAL_BANNED_COUNTRIES` |
| **Tier 2** | Por Tenant | Blacklist | Campo `banned_countries` en el tenant |
| **Tier 3** | Por CodeRule | Whitelist | Campo `allowed_countries` en la regla |

- La evaluación es secuencial: Tier 1 → Tier 2 → Tier 3
- Si el país no supera cualquiera de los niveles, la validación devuelve `GEO_BLOCKED`

### Integración con OmniWallet

OmniCodex actúa como middleware — las peticiones llegan desde OmniWallet, no directamente del usuario final. Para que la geolocalización funcione, **OmniWallet debe reenviar la IP real del usuario** en el header `X-Forwarded-For`:

```http
X-Forwarded-For: <ip-real-del-usuario-final>
```

### Respuesta en caso de bloqueo

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

### Variables de entorno relacionadas

| Variable | Descripción | Ejemplo |
|---|---|---|
| `GLOBAL_BANNED_COUNTRIES` | Países bloqueados globalmente (ISO alpha-2, separados por coma) | `KP,IR,CU,SY` |
| `GEO_REQUIRE_COUNTRY` | Si `true`, rechaza peticiones donde no se pueda determinar el país | `false` |

---

## 8. API REST — Validation API

Destinada a ser consumida exclusivamente por OmniWallet. Requiere autenticación con **API Key + firma HMAC + Nonce** en cada petición (ver sección 10).

### POST /api/v1/validate

Endpoint principal. Valida y consume un código en operación atómica.

**Request:**
```json
{
  "code": "PRO-26-A7K9M2-F8C1B3-7",
  "project_id": "<uuid>",
  "ow_user_id": "<uuid-usuario>",
  "ow_transaction_id": "<uuid-transaccion>",
  "country": "ES",
  "metadata": {
    "scan_source": "mobile_app"
  }
}
```

**Response OK (200):**
```json
{
  "status": "OK",
  "code": "PRO-26-A7K9M2-F8C1B3-7",
  "code_normalized": "PRO26A7K9M2F8C1B37",
  "detected_country": "ES",
  "project": { "id": "<uuid>", "name": "Campaña Verano 2026" },
  "code_rule": { "id": "<uuid>", "name": "Yogur Natural 500g" },
  "product_info": { "sku": "YN-500", "name": "Yogur Natural 500g", "brand": "Ejemplo" },
  "campaign_info": { "name": "Verano Saludable 2026", "suggested_points": 50 },
  "redeemed_at": "2026-03-15T10:30:15.123Z",
  "redemption_id": "<uuid>"
}
```

**Response KO:**
```json
{
  "status": "KO",
  "error_code": "ALREADY_REDEEMED",
  "error_message": "Este código ya ha sido utilizado",
  "details": { "redeemed_at": "2026-03-15T09:15:00Z" }
}
```

**Códigos de error:**

| `error_code` | HTTP | Descripción |
|---|---|---|
| `INVALID_STRUCTURE` | 400 | Longitud o charset incorrectos |
| `INVALID_SEGMENT` | 400 | Segmento específico no válido |
| `INVALID_CHECK_DIGIT` | 400 | Dígito de control incorrecto |
| `INVALID_HMAC` | 400 | Segmento HMAC no coincide (código inauténtico) |
| `NO_MATCHING_RULE` | 404 | No hay regla que coincida con el código |
| `ALREADY_REDEEMED` | 409 | Código ya canjeado |
| `PROJECT_INACTIVE` | 403 | Proyecto inactivo |
| `PROJECT_EXPIRED` | 403 | Proyecto fuera de vigencia |
| `RULE_INACTIVE` | 403 | Regla desactivada |
| `GEO_BLOCKED` | 403 | País del usuario no permitido |
| `RATE_LIMITED` | 429 | Demasiadas peticiones |
| `AUTH_FAILED` | 401 | API Key, firma HMAC o nonce inválidos |

### GET /api/v1/codes

Lista canjes con filtros. Scoped al tenant autenticado.

```
GET /api/v1/codes?project_id=<uuid>&from=2026-01-01&to=2026-03-15&page=1&limit=50
```

### GET /api/v1/codes/:id

Detalle de un canje. Scoped al tenant autenticado.

### GET /api/v1/stats/:project_id

Estadísticas agregadas del proyecto.

```json
{
  "project_id": "<uuid>",
  "total_redemptions": 45230,
  "unique_users": 12450,
  "by_rule": [{ "rule_id": "...", "rule_name": "Yogur Natural", "count": 28100 }],
  "by_day": [{ "date": "2026-03-14", "count": 1523 }],
  "error_rate": 0.034,
  "top_errors": [{ "error_code": "ALREADY_REDEEMED", "count": 890 }]
}
```

> **Nota de seguridad:** El endpoint `GET /validate/check` (pre-validación sin consumir) **ha sido eliminado de la API pública** porque actúa como oráculo para atacantes, permitiéndoles sondear qué códigos son válidos sin canjearllos. La funcionalidad equivalente está disponible únicamente en la Admin API: `POST /api/admin/rules/:id/test`.

### Health Checks

| Ruta | Descripción |
|---|---|
| `GET /health` | Estado general |
| `GET /health/ready` | Readiness (PostgreSQL + Redis OK). No expone detalles internos |
| `GET /health/live` | Liveness (proceso activo) |
| `GET /metrics` | Métricas Prometheus |

---

## 9. API REST — Admin API

Destinada al equipo OmniWallet. Requiere autenticación con **Bearer JWT** (ver sección 10).

### Auth

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/admin/auth/setup` | Bootstrap: crea el primer admin. Requiere `setup_secret` (= `JWT_SECRET`). Solo válido en el primer uso |
| `POST` | `/api/admin/auth/login` | Login con `username` + `password`. Devuelve JWT con expiración de 2h |

### Tenants

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/admin/tenants` | Crear tenant |
| `GET` | `/api/admin/tenants` | Listar tenants |
| `GET` | `/api/admin/tenants/:id` | Detalle |
| `PUT` | `/api/admin/tenants/:id` | Actualizar (incluye `banned_countries`) |
| `POST` | `/api/admin/tenants/:id/rotate-keys` | Rotar API Key y Secret |

### Projects

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/admin/tenants/:id/projects` | Crear proyecto |
| `GET` | `/api/admin/tenants/:id/projects` | Listar proyectos del tenant |
| `GET` | `/api/admin/projects/:id` | Detalle |
| `PUT` | `/api/admin/projects/:id` | Actualizar |
| `DELETE` | `/api/admin/projects/:id` | Soft delete |

### Code Rules

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/admin/projects/:id/rules` | Crear regla (ejecuta security linter) |
| `GET` | `/api/admin/projects/:id/rules` | Listar reglas |
| `GET` | `/api/admin/rules/:id` | Detalle |
| `PUT` | `/api/admin/rules/:id` | Actualizar (ejecuta security linter) |
| `POST` | `/api/admin/rules/:id/test` | Probar código contra regla (sin registrar canje) |

---

## 10. Autenticación

### Validation API — API Key + HMAC + Nonce

Cada petición debe incluir los siguientes headers:

```http
X-Api-Key:   {tenant.apiKey}
X-Timestamp: {ISO8601}              — Se rechaza si difiere >60s (configurable)
X-Nonce:     {uuid-único}           — Anti-replay: almacenado en Redis dentro de la ventana de tolerancia
X-Signature: {HMAC-SHA256-hex}      — Firma del payload (ver abajo)
```

**Construcción del payload firmado:**

```
{METHOD}\n{PATH}\n{TIMESTAMP}\n{NONCE}\n{BODY}
```

Ejemplo para `POST /api/v1/validate`:
```
POST\n/api/v1/validate\n2026-03-15T10:30:00Z\n<uuid-nonce>\n{"code":"..."}
```

**Propiedades de seguridad:**
- El nonce se almacena en Redis durante la ventana de tolerancia. Si se repite, la petición se rechaza (anti-replay completo)
- La comparación de firmas usa `timingSafeEqual` para prevenir timing attacks
- **Modo legacy:** Si se omite `X-Nonce`, la firma se calcula solo sobre el body (compatible con clientes anteriores, pero sin protección anti-replay completa)

### Admin API — Bearer JWT

```http
Authorization: Bearer {jwt_token}
```

**Flujo de setup inicial (solo la primera vez):**

```bash
# 1. Crear primer usuario admin
curl -X POST https://{host}/api/admin/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "contraseña-segura", "setup_secret": "<JWT_SECRET>"}'

# 2. Login
curl -X POST https://{host}/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "contraseña-segura"}'
# → { "token": "eyJ...", "expires_in": "2h", "user": {...} }
```

> **Cambio respecto a versión anterior:** El login **ya no usa `JWT_SECRET` como credencial**. El `JWT_SECRET` solo se usa como clave de firma de tokens (nunca sale del servidor) y como `setup_secret` en el bootstrap inicial.

---

## 11. Seguridad y Anti-Fraude

### Medidas implementadas

| Medida | Descripción |
|---|---|
| Anti-replay con nonce | Cada petición lleva un UUID único almacenado en Redis. No se acepta el mismo nonce dos veces dentro de la ventana de tolerancia |
| Constant-time comparison | Las firmas HMAC se comparan con `timingSafeEqual` (previene timing attacks) |
| HMAC-keyed code storage | Los códigos se almacenan como `HMAC(code, CODE_HASH_PEPPER)`, no como SHA-256 plano |
| Unicode NFKC + ASCII filter | Previene ataques de homóglifos (caracteres visualmente idénticos pero distintos en Unicode) |
| Tenant scoping (anti-BOLA) | Todas las queries de validación y listado están scoped al tenant autenticado |
| Security linter | Bloquea reglas de código con configuración insegura antes de llegar a producción |
| Custom DSL (sin vm/vm2) | Las funciones custom usan un DSL declarativo JSON. Elimina el vector de sandbox escape |
| Admin auth con credenciales | Login real con usuario/contraseña. Tokens de 2h. Setup inicial protegido con `setup_secret` |
| Swagger deshabilitado en prod | `/docs` no disponible cuando `NODE_ENV=production` |
| CORS restringido | Solo orígenes configurados en `CORS_ORIGIN` |
| Respuestas mínimas | La API pública no devuelve detalles internos en mensajes de error |
| `GET /validate/check` eliminado | El endpoint de pre-validación pública fue eliminado por actuar como oráculo para atacantes |

### Rate limiting

- Por usuario OmniWallet: configurable via `RATE_LIMIT_PER_USER_PER_MINUTE`
- Por IP: configurable via `RATE_LIMIT_PER_IP_PER_MINUTE`
- Implementado con `@fastify/rate-limit` + Redis

### Variables de entorno de seguridad

| Variable | Descripción | Default |
|---|---|---|
| `JWT_SECRET` | Clave de firma JWT (solo servidor) | `dev-jwt-secret` |
| `CODE_HASH_PEPPER` | Pepper para HMAC-keyed hash de códigos | `dev-pepper-change-in-production` |
| `HMAC_TOLERANCE_SECONDS` | Ventana anti-replay | `60` |
| `STORE_PLAIN_CODES` | Almacenar código en texto plano (solo debug) | `false` |
| `CORS_ORIGIN` | Origen CORS permitido | `https://admin.omnicodex.com` |
| `GLOBAL_BANNED_COUNTRIES` | Países bloqueados globalmente (ISO alpha-2) | *(vacío)* |

### Recomendaciones para producción

1. Reverse proxy (Nginx / HAProxy) con TLS termination
2. `JWT_SECRET` y `CODE_HASH_PEPPER` generados criptográficamente (`openssl rand -base64 48`)
3. `STORE_PLAIN_CODES=false` siempre
4. Rate limiting adicional a nivel de edge/WAF
5. IP allowlist para los endpoints `/api/admin/*`
6. Monitorizar patrones anómalos: alta tasa de `INVALID_HMAC`, exploración secuencial de códigos

---

## 12. Panel de Administración

Panel web React para gestionar tenants, proyectos, reglas y probar códigos.

**Stack:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui  
**Servidor de desarrollo:** `http://localhost:5173` (proxy Vite → API en `localhost:3000`)  
**Producción:** Imagen Docker multi-stage (Node build + Nginx). Serve en puerto 8080.

### Funcionalidades

| Página | Descripción |
|---|---|
| **Dashboard** | Estado de salud de la plataforma, conteo de tenants activos |
| **Tenants** | CRUD completo, rotación de API Keys, configuración de `banned_countries` |
| **Projects** | Crear/editar proyectos por tenant, fechas de vigencia |
| **Code Rules** | Gestión de reglas + Rule Builder visual con security linter integrado |
| **Code Tester** | Probar un código contra una regla con resultado debug detallado (solo admin) |
| **Stats** | Gráficas de canjes por día y por regla |

### Arranque en desarrollo

```bash
cd admin-ui
npm install
npm run dev
```

---

## 13. Despliegue

### Opción A — Digital Ocean App Platform (recomendado)

App Platform detecta los Dockerfiles automáticamente y gestiona infraestructura.

```bash
# Instalar doctl
brew install doctl   # macOS
snap install doctl   # Linux

# Autenticarse
doctl auth init

# Crear la app (provisiona API + Admin UI + PostgreSQL 16 + Redis 7)
doctl apps create --spec .do/app.yaml
```

**Variables de entorno a configurar manualmente en DO → Apps → Settings:**
- `JWT_SECRET` (generar: `openssl rand -base64 48`)
- `CODE_HASH_PEPPER` (generar: `openssl rand -hex 32`)
- `CORS_ORIGIN`
- `GLOBAL_BANNED_COUNTRIES`
- `GEO_REQUIRE_COUNTRY`

**Coste estimado App Platform:** ~$24/mes (compute + PostgreSQL managed + Redis managed)

### Opción B — Droplet con Docker Compose

```bash
# Setup en Droplet Ubuntu 24.04
curl -fsSL https://get.docker.com | sh
git clone https://github.com/nicolapicasso/codeguard.git
cd codeguard
cp .env.production .env.production.local
nano .env.production.local

# Levantar servicios (API :3000 + Admin UI :8080 + PostgreSQL + Redis)
docker compose -f docker-compose.prod.yml up -d --build
```

Configurar Nginx como reverse proxy con SSL (Let's Encrypt). Ver `DEPLOY.md` para la configuración completa.

**Coste estimado Droplet:** ~$6/mes

### Migraciones

El `docker-entrypoint.sh` ejecuta `prisma migrate deploy` automáticamente en cada despliegue.

### Seed inicial

Activar temporalmente `SEED_ON_DEPLOY=true`, hacer re-deploy, luego desactivar. El seed crea un tenant demo con API Key/Secret, un proyecto y 3 reglas de código (datos mostrados en consola).

---

## 14. Variables de Entorno

```env
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://omnicodex:secret@localhost:5432/omnicodex

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=<generar con openssl rand -base64 48>
HMAC_TOLERANCE_SECONDS=60

# Security
CODE_HASH_PEPPER=<generar con openssl rand -hex 32>
STORE_PLAIN_CODES=false
CORS_ORIGIN=https://admin.omnicodex.com

# Rate Limiting
RATE_LIMIT_PER_USER_PER_MINUTE=30
RATE_LIMIT_PER_IP_PER_MINUTE=100

# Geo-fencing
GLOBAL_BANNED_COUNTRIES=KP,IR,CU,SY
GEO_REQUIRE_COUNTRY=false

# Admin UI (opcional, para desarrollo)
SEED_ON_DEPLOY=false
```

---

## 15. Testing

```bash
# Tests unitarios
npm test

# Tests con cobertura
npm run test:coverage

# Type check
npm run typecheck

# Watch mode
npm run test:watch
```

**Cobertura objetivo:**

| Módulo | Tipo de test |
|---|---|
| `validation/normalizer` | Unit |
| `validation/structure` | Unit |
| `validation/segments` | Unit |
| `validation/check-digit/*` | Unit (todos los algoritmos) |
| `validation/pipeline` | Integration |
| `validation/geo-fencing` | Unit |
| API validate end-to-end | Integration |
| CRUD admin | Integration |
| Doble canje concurrente | Concurrency (race condition) |

---

## 16. Estructura del Proyecto

```
codeguard/
├── src/
│   ├── server.ts                     # Entry point Fastify + Swagger
│   ├── config/
│   │   └── index.ts                  # Variables de entorno tipadas
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── api-key.ts            # Verificación API Key
│   │   │   ├── hmac.ts               # Verificación HMAC-SHA256 + nonce
│   │   │   └── jwt.ts                # JWT para Admin API
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
│   │   │   ├── schemas.ts
│   │   │   └── security-linter.ts    # Validación de entropía y configuración segura
│   │   ├── validation/
│   │   │   ├── pipeline.ts           # Orquestador de las 7 fases
│   │   │   ├── normalizer.ts         # Fase 1: Unicode NFKC + ASCII + separadores
│   │   │   ├── structure.ts          # Fase 2: longitud + charset + prefijo
│   │   │   ├── segments.ts           # Fase 3: descomposición y validación por tipo
│   │   │   ├── check-digit/          # Fase 4
│   │   │   │   ├── index.ts          # Factory / dispatcher
│   │   │   │   ├── luhn.ts
│   │   │   │   ├── mod10.ts
│   │   │   │   ├── mod11.ts
│   │   │   │   ├── mod97.ts
│   │   │   │   ├── verhoeff.ts
│   │   │   │   ├── damm.ts
│   │   │   │   └── custom.ts         # Custom DSL (sin vm/vm2)
│   │   │   ├── vigency.ts            # Fase 5: isActive + rango temporal
│   │   │   ├── geo-fencing.ts        # Fase 5b: Tier 1/2/3 geo-fencing
│   │   │   └── uniqueness.ts         # Fase 6: HMAC-hash + Redlock + INSERT atómico
│   │   └── stats/
│   │       ├── routes.ts
│   │       └── service.ts
│   ├── middleware/
│   │   ├── rate-limiter.ts
│   │   ├── request-logger.ts
│   │   └── error-handler.ts
│   └── utils/
│       ├── crypto.ts                 # HMAC, timingSafeEqual helpers
│       ├── redis.ts                  # Redis client + Redlock
│       ├── prisma.ts                 # Prisma client singleton
│       ├── cache.ts                  # Caché CodeRules en Redis (TTL 5 min)
│       └── geoip.ts                  # Wrapper geoip-lite + fallback country field
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts                       # Datos demo para desarrollo
│   └── migrations/
├── tests/
│   ├── unit/
│   │   ├── validation/               # Tests del motor
│   │   └── auth/
│   ├── integration/
│   │   ├── validate.test.ts          # Flujo E2E validación
│   │   ├── admin.test.ts             # Operaciones CRUD
│   │   └── concurrency.test.ts       # Tests de race condition
│   └── load/
│       └── k6-validate.js            # Load testing con k6
├── admin-ui/
│   ├── src/
│   │   ├── pages/                    # Dashboard, Tenants, Projects, CodeRules, Stats
│   │   ├── components/               # Layout, Login, Card, Badge
│   │   ├── lib/                      # API client, utils
│   │   └── hooks/                    # useApi hook
│   ├── Dockerfile                    # Multi-stage: Node build + Nginx
│   ├── nginx.conf                    # SPA config + proxy /api → API backend
│   ├── package.json
│   └── tsconfig.json
├── docs/
│   └── integration-guide.md          # Guía para equipo OmniWallet
├── scripts/
├── .do/
│   └── app.yaml                      # Spec Digital Ocean App Platform
├── .github/
│   └── workflows/                    # CI/CD
├── .env.example
├── .env.production
├── docker-compose.yml                # Desarrollo: PostgreSQL + Redis + App
├── docker-compose.prod.yml           # Producción
├── Dockerfile
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 17. Responsabilidades OmniCodex vs OmniWallet

| OmniCodex | OmniWallet |
|---|---|
| Validar estructura del código | UI de escaneo (cámara, QR reader) |
| Validar autenticidad criptográfica (HMAC) | Definir reglas de puntos por campaña |
| Validar dígito de control | Asignar puntos al usuario |
| Garantizar unicidad (single-use) con Redlock | Almacenar transacción en CDP |
| Almacenar códigos canjeados (hasheados) | Notificar al usuario |
| Rate limiting y anti-fraude | Sincronizar sistemas externos |
| Estadísticas de canjes | Reportes de negocio |
| Geo-fencing (detección por IP) | **Reenviar IP real del usuario** en `X-Forwarded-For` |
| Gestionar reglas de código (Admin API) | Gestionar programas de fidelización |
| Security linter en creación de reglas | Gestionar el catálogo de productos |
