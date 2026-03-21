# OmniCodex — Especificación Técnica

## Motor de Validación y Generación de Códigos Únicos · Middleware para OmniWallet

> **Versión del documento:** 3.0
> **Rama de referencia:** `main`
> **Cambios respecto a v2.0:** Incorpora modo de generación gestionada de códigos por lotes (secciones 4, 18–25)

---

## Índice

1. [Visión General](#1-visión-general)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Modelo de Datos](#3-modelo-de-datos)
4. [Modos Operativos](#4-modos-operativos)
5. [Definición de Estructura por Segmentos](#5-definición-de-estructura-por-segmentos)
6. [Motor de Validación — Pipeline (7 fases)](#6-motor-de-validación--pipeline-7-fases)
7. [Segmento HMAC — Autenticidad Criptográfica](#7-segmento-hmac--autenticidad-criptográfica)
8. [Geo-fencing — Control Geográfico](#8-geo-fencing--control-geográfico)
9. [API REST — Validation API](#9-api-rest--validation-api)
10. [API REST — Admin API](#10-api-rest--admin-api)
11. [API REST — Batch API](#11-api-rest--batch-api)
12. [Autenticación](#12-autenticación)
13. [Seguridad y Anti-Fraude](#13-seguridad-y-anti-fraude)
14. [Panel de Administración](#14-panel-de-administración)
15. [Despliegue](#15-despliegue)
16. [Variables de Entorno](#16-variables-de-entorno)
17. [Testing](#17-testing)
18. [Estructura del Proyecto](#18-estructura-del-proyecto)
19. [Responsabilidades OmniCodex vs OmniWallet](#19-responsabilidades-omnicodex-vs-omniwallet)
20. [Generación Gestionada — Modelo Conceptual](#20-generación-gestionada--modelo-conceptual)
21. [Generación Gestionada — Modelo de Datos](#21-generación-gestionada--modelo-de-datos)
22. [Generación Gestionada — Flujo de Generación](#22-generación-gestionada--flujo-de-generación)
23. [Generación Gestionada — Flujo de Validación](#23-generación-gestionada--flujo-de-validación)
24. [Generación Gestionada — Motor de Generación por Segmentos](#24-generación-gestionada--motor-de-generación-por-segmentos)
25. [Generación Gestionada — Seguridad y Escalabilidad](#25-generación-gestionada--seguridad-y-escalabilidad)

---

## 1. Visión General

OmniCodex es un microservicio middleware independiente que gestiona códigos únicos desechables impresos por fabricantes de productos de gran consumo. Los consumidores escanean estos códigos desde OmniWallet para obtener puntos de fidelización u otras recompensas.

### Concepto fundamental

OmniCodex soporta **dos modos operativos** para cubrir distintos escenarios de integración con fabricantes:

1. **Modo EXTERNAL (validación por norma):** El fabricante genera sus propios códigos según una norma acordada. OmniCodex los valida en tiempo real sin prealmacenamiento, usando la definición de estructura, segmentos, check digit y opcionalmente un segmento HMAC.

2. **Modo MANAGED (generación gestionada):** OmniCodex genera, almacena y entrega los códigos por lotes. El fabricante los recibe y los imprime. La validación posterior se basa en inventario de códigos emitidos, lo que proporciona mayor seguridad que el modo EXTERNAL sin HMAC.

Ambos modos conviven en el mismo sistema. El modo se configura a nivel de `CodeRule`, permitiendo que un mismo proyecto tenga reglas con modos distintos.

### Flujo principal — Modo EXTERNAL

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

### Flujo principal — Modo MANAGED

```
Fabricante/Admin           OmniWallet                   OmniCodex
    │                          │                             │
    │── solicita lote ─────────────────────────────────────►│
    │   (API o Admin Panel)    │                             │── genera N códigos
    │                          │                             │── almacena inventario
    │◄── descarga lote (CSV/JSON) ──────────────────────────│
    │                          │                             │
    │── imprime códigos ─────► producto físico              │
    │                          │                             │
    │                  usuario escanea desde app/web         │
    │                          │                             │
    │                          │── POST /api/v1/validate ───►│
    │                          │   (API Key + HMAC + Nonce)  │
    │                          │                             │── pipeline fases 1-5b
    │                          │                             │── busca en inventario emitido
    │                          │                             │── marca como canjeado
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

Define la estructura y las reglas de validación para un tipo de código. El campo `generationMode` determina si los códigos son generados externamente por el fabricante o gestionados por OmniCodex.

```prisma
model CodeRule {
  id               String             @id @default(uuid())
  projectId        String             @map("project_id")
  project          Project            @relation(fields: [projectId], references: [id])
  name             String
  skuReference     String?            @map("sku_reference")
  generationMode   CodeGenerationMode @default(EXTERNAL) @map("generation_mode")
  totalLength      Int                @map("total_length")
  charset          Charset
  customCharset    String?            @map("custom_charset")
  hasCheckDigit    Boolean            @map("has_check_digit")
  checkAlgorithm   CheckAlgorithm?    @map("check_algorithm")
  checkDigitPosition CheckDigitPos?   @map("check_digit_position")
  structureDef     Json               @map("structure_def")
  separator        String?
  caseSensitive    Boolean            @default(false) @map("case_sensitive")
  prefix           String?
  maxRedemptions   Int                @default(1) @map("max_redemptions")
  fabricantSecret  String?            @map("fabricant_secret")   // Secreto compartido para segmento HMAC
  allowedCountries String[]           @map("allowed_countries")  // Tier 3 geo-fencing (whitelist)
  productInfo      Json?              @map("product_info")
  campaignInfo     Json?              @map("campaign_info")
  pointsValue      Int?               @map("points_value")
  isActive         Boolean            @default(true) @map("is_active")
  createdAt        DateTime           @default(now()) @map("created_at")
  updatedAt        DateTime           @updatedAt     @map("updated_at")
  redeemedCodes    RedeemedCode[]
  codeBatches      CodeBatch[]

  @@map("code_rules")
}

enum CodeGenerationMode {
  EXTERNAL   // Fabricante genera códigos, OmniCodex solo valida
  MANAGED    // OmniCodex genera, almacena y valida contra inventario
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

> **Nota sobre `generationMode`:** El modo se define a nivel de regla, no de proyecto. Un proyecto puede tener reglas EXTERNAL y MANAGED simultáneamente. Las reglas MANAGED requieren que `fabricantSecret` esté configurado, ya que OmniCodex lo usa internamente para generar el segmento HMAC (si la estructura lo incluye).

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

### 3.5 CodeBatch (nuevo — Generación Gestionada)

Representa un lote de códigos generados por OmniCodex en modo MANAGED. Contiene la metadata del lote y su estado en el ciclo de vida.

```prisma
model CodeBatch {
  id              String         @id @default(uuid())
  codeRuleId      String         @map("code_rule_id")
  codeRule        CodeRule       @relation(fields: [codeRuleId], references: [id])
  batchSize       Int            @map("batch_size")          // Solicitado: 1.000–1.000.000
  generatedCount  Int            @default(0) @map("generated_count")  // Real generados
  status          BatchStatus    @default(PENDING)
  format          BatchFormat    @default(PIN)
  label           String?                                     // Etiqueta descriptiva del lote
  expiresAt       DateTime?      @map("expires_at")           // Expiración de los códigos del lote
  downloadCount   Int            @default(0) @map("download_count")
  lastDownloadAt  DateTime?      @map("last_download_at")
  errorMessage    String?        @map("error_message")        // Si status=FAILED, motivo
  createdBy       String?        @map("created_by")           // admin username o "api"
  createdAt       DateTime       @default(now()) @map("created_at")
  updatedAt       DateTime       @updatedAt     @map("updated_at")
  completedAt     DateTime?      @map("completed_at")
  issuedCodes     IssuedCode[]

  @@index([codeRuleId])
  @@index([status])
  @@index([createdAt])
  @@map("code_batches")
}

enum BatchStatus {
  PENDING       // Creado, pendiente de generación
  GENERATING    // Generación en curso (background job)
  COMPLETED     // Todos los códigos generados
  FAILED        // Error durante generación
  CANCELLED     // Cancelado por admin antes de completar
  SEALED        // Completado y descargado, no se permite re-descarga sin autorización
}

enum BatchFormat {
  PIN           // Código alfanumérico plano
  CSV           // Exportación CSV
  JSON          // Exportación JSON
}
```

**Restricciones de negocio:**
- `batchSize` mínimo: 1.000 | máximo: 1.000.000
- Solo se pueden crear lotes para reglas con `generationMode = MANAGED`
- Un lote en estado `GENERATING` no puede cancelarse (esperar a que termine o falle)
- `expiresAt` es opcional; si se define, los códigos del lote se rechazan después de esa fecha

### 3.6 IssuedCode (nuevo — Generación Gestionada)

Cada código individual generado por OmniCodex como parte de un lote. Es el **inventario de códigos emitidos**.

```prisma
model IssuedCode {
  id              String          @id @default(uuid())
  batchId         String          @map("batch_id")
  batch           CodeBatch       @relation(fields: [batchId], references: [id])
  codeHash        String          @map("code_hash") @db.VarChar(64)    // HMAC-keyed hash para lookup
  codeEncrypted   String          @map("code_encrypted")               // Código cifrado (AES-256-GCM)
  status          IssuedCodeStatus @default(ACTIVE)
  redeemedAt      DateTime?       @map("redeemed_at")
  redeemedByUser  String?         @map("redeemed_by_user")             // ow_user_id
  redemptionCount Int             @default(0) @map("redemption_count")
  createdAt       DateTime        @default(now()) @map("created_at")

  @@unique([batchId, codeHash])
  @@index([codeHash])
  @@index([status])
  @@map("issued_codes")
}

enum IssuedCodeStatus {
  ACTIVE          // Emitido, disponible para canje
  REDEEMED        // Canjeado (consumido)
  EXPIRED         // Expirado por vigencia del lote
  REVOKED         // Revocado manualmente por admin (lote cancelado)
}
```

**Diseño de almacenamiento seguro:**
- `codeHash`: Mismo esquema que `RedeemedCode` — `HMAC(code, CODE_HASH_PEPPER)`. Se usa para lookup rápido durante validación.
- `codeEncrypted`: El código en texto plano cifrado con AES-256-GCM usando una clave derivada del lote. Necesario para poder exportar/descargar los códigos. **Nunca se almacena en texto plano.**
- El índice `@@unique([batchId, codeHash])` previene colisiones dentro del lote.
- El índice `@@index([codeHash])` permite búsqueda rápida cross-batch durante validación.

### 3.7 AdminUser

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

## 4. Modos Operativos

OmniCodex soporta dos modos operativos que conviven en el mismo sistema. El modo se configura a nivel de `CodeRule` mediante el campo `generationMode`.

### 4.1 Modo EXTERNAL (Validación por Norma)

Es el modo original de OmniCodex. El fabricante genera sus propios códigos siguiendo la estructura acordada.

| Aspecto | Descripción |
|---|---|
| **Quién genera** | El fabricante |
| **Prealmacenamiento** | No. OmniCodex no conoce los códigos de antemano |
| **Base de autenticidad** | Estructura válida + HMAC criptográfico (si configurado) |
| **Seguridad mínima recomendada** | Nivel 2 (AUTHENTICATED): regla con segmento HMAC |
| **Riesgo principal** | Sin HMAC, cualquiera que conozca la estructura puede forjar códigos |
| **Tabla de persistencia** | `redeemed_codes` (solo códigos canjeados) |

### 4.2 Modo MANAGED (Generación Gestionada)

Nuevo modo en el que OmniCodex genera, almacena y entrega los códigos por lotes.

| Aspecto | Descripción |
|---|---|
| **Quién genera** | OmniCodex, por petición del fabricante o admin |
| **Prealmacenamiento** | Sí. Todos los códigos emitidos se almacenan como inventario |
| **Base de autenticidad** | Inventario: el código solo es válido si fue emitido por OmniCodex |
| **Seguridad** | Inherentemente más seguro que EXTERNAL sin HMAC, porque la validez se basa en existencia en inventario |
| **Riesgo principal** | Fuga del lote exportado (mitigado con cifrado y auditoría de descargas) |
| **Tablas de persistencia** | `code_batches` + `issued_codes` |

### 4.3 Comparación de flujos de validación

| Fase | EXTERNAL | MANAGED |
|---|---|---|
| 1. Normalización | Idéntica | Idéntica |
| 2. Estructura | Idéntica | Idéntica |
| 3. Segmentos | Idéntica | Idéntica |
| 4. Check digit | Idéntica | Idéntica |
| 5. Vigencia | Idéntica | Idéntica + vigencia del lote (`expiresAt`) |
| 5b. Geo-fencing | Idéntica | Idéntica |
| 6. Unicidad/Canje | INSERT en `redeemed_codes` si no existe | LOOKUP en `issued_codes` → verificar que existe y está ACTIVE → marcar REDEEMED |

### 4.4 Convivencia

- Un proyecto puede tener reglas EXTERNAL y MANAGED simultáneamente
- El pipeline de validación detecta automáticamente el modo por el campo `generationMode` de la regla que hace match
- No se requiere que el caller indique el modo — OmniCodex lo resuelve internamente
- Las estadísticas y auditoría se unifican: ambos modos alimentan los mismos dashboards

---

## 5. Definición de Estructura por Segmentos

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

## 6. Motor de Validación — Pipeline (7 fases)

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

## 7. Segmento HMAC — Autenticidad Criptográfica

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

## 8. Geo-fencing — Control Geográfico

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

## 9. API REST — Validation API

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

## 10. API REST — Admin API

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

### Batches (Admin)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/admin/rules/:id/batches` | Crear lote de generación para una regla MANAGED |
| `GET` | `/api/admin/batches` | Listar lotes (filtrable por regla, proyecto, estado) |
| `GET` | `/api/admin/batches/:id` | Detalle del lote con estadísticas |
| `GET` | `/api/admin/batches/:id/download` | Descargar códigos del lote (`?format=csv\|json`) |
| `POST` | `/api/admin/batches/:id/cancel` | Cancelar lote (solo si PENDING o COMPLETED) |
| `POST` | `/api/admin/batches/:id/seal` | Sellar lote (bloquea re-descarga sin autorización) |

---

## 11. API REST — Batch API

API pública para generación y gestión de lotes. Requiere autenticación con **API Key + firma HMAC + Nonce** (misma autenticación que Validation API).

### POST /api/v1/batches

Solicita la generación de un lote de códigos para una regla en modo MANAGED.

**Request:**
```json
{
  "code_rule_id": "<uuid>",
  "batch_size": 50000,
  "label": "Campaña Verano 2026 - Lote 3",
  "expires_at": "2026-12-31T23:59:59Z",
  "format": "PIN"
}
```

**Validaciones:**
- La regla debe existir, estar activa y pertenecer al tenant autenticado
- La regla debe tener `generationMode = MANAGED`
- `batch_size` debe estar entre 1.000 y 1.000.000
- `format` válidos: `PIN`, `CSV`, `JSON`

**Response (202 Accepted):**
```json
{
  "batch_id": "<uuid>",
  "status": "PENDING",
  "batch_size": 50000,
  "estimated_duration_seconds": 30,
  "poll_url": "/api/v1/batches/<uuid>"
}
```

> **Nota:** Lotes > 10.000 se procesan de forma asíncrona. La API devuelve 202 y el cliente hace polling sobre el estado del lote. Lotes ≤ 10.000 se procesan de forma síncrona y la respuesta incluye directamente `status: "COMPLETED"`.

### GET /api/v1/batches/:id

Consultar el estado de un lote. Scoped al tenant autenticado.

**Response (200):**
```json
{
  "batch_id": "<uuid>",
  "code_rule_id": "<uuid>",
  "status": "COMPLETED",
  "batch_size": 50000,
  "generated_count": 50000,
  "format": "PIN",
  "label": "Campaña Verano 2026 - Lote 3",
  "expires_at": "2026-12-31T23:59:59Z",
  "download_count": 0,
  "created_at": "2026-03-21T10:00:00Z",
  "completed_at": "2026-03-21T10:00:32Z"
}
```

### GET /api/v1/batches/:id/download

Descarga los códigos generados. Scoped al tenant autenticado.

**Query params:**
- `format`: `csv` | `json` (default: el formato especificado en la creación)

**Response CSV (200, Content-Type: text/csv):**
```csv
code,batch_id,created_at
PRO26A7K9M2F8C1B37,<uuid>,2026-03-21T10:00:05Z
PRO26B3M8K1D9F2A54,<uuid>,2026-03-21T10:00:05Z
...
```

**Response JSON (200, Content-Type: application/json):**
```json
{
  "batch_id": "<uuid>",
  "codes": [
    "PRO26A7K9M2F8C1B37",
    "PRO26B3M8K1D9F2A54"
  ],
  "total": 50000,
  "format": "PIN"
}
```

> **Nota sobre streaming:** Para lotes > 50.000 códigos, la respuesta se envía como stream (chunked transfer encoding) para evitar cargar todo en memoria.

> **Nota sobre QR/Barcode:** Los formatos de representación visual (QR, código de barras) se generan client-side usando el PIN devuelto. El QR/barcode codifica **solo el PIN**, nunca una URL ni un enlace. OmniCodex no genera imágenes server-side.

### GET /api/v1/batches

Listar lotes del tenant autenticado.

```
GET /api/v1/batches?code_rule_id=<uuid>&status=COMPLETED&page=1&limit=20
```

### Códigos de error específicos de Batch API

| `error_code` | HTTP | Descripción |
|---|---|---|
| `INVALID_GENERATION_MODE` | 400 | La regla no tiene `generationMode = MANAGED` |
| `BATCH_SIZE_OUT_OF_RANGE` | 400 | `batch_size` fuera del rango 1.000–1.000.000 |
| `BATCH_NOT_FOUND` | 404 | Lote no encontrado o no pertenece al tenant |
| `BATCH_NOT_READY` | 409 | Lote aún en generación, no descargable |
| `BATCH_SEALED` | 403 | Lote sellado, re-descarga requiere autorización admin |
| `BATCH_CANCELLED` | 410 | Lote cancelado, códigos revocados |

---

## 12. Autenticación

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

## 13. Seguridad y Anti-Fraude

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

### Seguridad específica de Generación Gestionada (MANAGED)

| Medida | Descripción |
|---|---|
| Cifrado de códigos en reposo | Los códigos se almacenan cifrados con AES-256-GCM en `issued_codes.codeEncrypted`. La clave de cifrado se deriva del `CODE_HASH_PEPPER` + `batchId` |
| Auditoría de descargas | Cada descarga de lote incrementa `download_count` y registra `last_download_at`. Los admin pueden monitorizar descargas sospechosas |
| Sellado de lotes | Tras la descarga, un admin puede sellar el lote (`SEALED`). Descargas posteriores requieren re-autorización explícita |
| Validación por inventario | Los códigos MANAGED solo son válidos si existen en `issued_codes` con status `ACTIVE`. No se aceptan códigos que "cumplan la estructura" pero no estén en inventario |
| Revocación masiva | Cancelar un lote marca todos sus códigos como `REVOKED`, invalidándolos inmediatamente |
| Anti-colisión | Generación con INSERT batch + ON CONFLICT. Los códigos que colisionen se regeneran automáticamente |
| Hash indexado | `issued_codes.codeHash` usa el mismo HMAC-keyed hash que `redeemed_codes`, permitiendo lookup O(1) durante validación |

### Recomendaciones para producción

1. Reverse proxy (Nginx / HAProxy) con TLS termination
2. `JWT_SECRET` y `CODE_HASH_PEPPER` generados criptográficamente (`openssl rand -base64 48`)
3. `STORE_PLAIN_CODES=false` siempre
4. Rate limiting adicional a nivel de edge/WAF
5. IP allowlist para los endpoints `/api/admin/*`
6. Monitorizar patrones anómalos: alta tasa de `INVALID_HMAC`, exploración secuencial de códigos
7. Monitorizar descargas de lotes: alertar si `download_count` > 3 sin sellado
8. Limitar generación concurrente de lotes por tenant (máx. 3 lotes simultáneos en estado GENERATING)
9. `BATCH_ENCRYPTION_KEY` separado del `CODE_HASH_PEPPER` en producción (ver sección 25)

---

## 14. Panel de Administración

Panel web React para gestionar tenants, proyectos, reglas, lotes y probar códigos.

**Stack:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui  
**Servidor de desarrollo:** `http://localhost:5173` (proxy Vite → API en `localhost:3000`)  
**Producción:** Imagen Docker multi-stage (Node build + Nginx). Serve en puerto 8080.

### Funcionalidades

| Página | Descripción |
|---|---|
| **Dashboard** | Estado de salud de la plataforma, conteo de tenants activos |
| **Tenants** | CRUD completo, rotación de API Keys, configuración de `banned_countries` |
| **Projects** | Crear/editar proyectos por tenant, fechas de vigencia |
| **Code Rules** | Gestión de reglas + Rule Builder visual con security linter integrado. Selector de `generationMode` (EXTERNAL/MANAGED) |
| **Batches** | Crear lotes, ver progreso de generación, descargar códigos, sellar/cancelar lotes. Solo visible para reglas MANAGED |
| **Code Tester** | Probar un código contra una regla con resultado debug detallado (solo admin) |
| **Stats** | Gráficas de canjes por día y por regla. Incluye métricas de lotes generados vs canjeados para reglas MANAGED |

### Arranque en desarrollo

```bash
cd admin-ui
npm install
npm run dev
```

---

## 15. Despliegue

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

## 16. Variables de Entorno

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

# Batch Generation (Modo MANAGED)
BATCH_ENCRYPTION_KEY=<generar con openssl rand -hex 32>
BATCH_MAX_CONCURRENT_PER_TENANT=3
BATCH_CHUNK_SIZE=5000

# Admin UI (opcional, para desarrollo)
SEED_ON_DEPLOY=false
```

---

## 17. Testing

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
| `batch-generation/generator` | Unit (generación por segmento) |
| `batch-generation/service` | Integration (crear, cancelar, sellar lotes) |
| `validation/redemption-managed` | Unit (lookup inventario + estado) |
| API batch end-to-end | Integration (crear lote, descargar, validar código generado) |
| Colisiones en generación | Concurrency (batch INSERT con ON CONFLICT) |

---

## 18. Estructura del Proyecto

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
│   │   │   ├── uniqueness.ts         # Fase 6: HMAC-hash + Redlock + INSERT atómico
│   │   │   └── redemption-managed.ts # Fase 6 MANAGED: lookup inventario + marcar REDEEMED
│   │   ├── batch-generation/          # Módulo de generación gestionada
│   │   │   ├── routes.ts             # Endpoints Batch API
│   │   │   ├── service.ts            # Lógica de negocio (crear, listar, cancelar lotes)
│   │   │   ├── generator.ts          # Motor de generación por segmentos
│   │   │   ├── worker.ts             # Background job para lotes grandes (>10K)
│   │   │   ├── exporter.ts           # Exportación CSV/JSON con streaming
│   │   │   └── schemas.ts            # JSON Schema validation
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
│   │   ├── pages/                    # Dashboard, Tenants, Projects, CodeRules, Batches, Stats
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

## 19. Responsabilidades OmniCodex vs OmniWallet

| OmniCodex | OmniWallet |
|---|---|
| Validar estructura del código | UI de escaneo (cámara, QR reader) |
| Validar autenticidad criptográfica (HMAC) | Definir reglas de puntos por campaña |
| Validar dígito de control | Asignar puntos al usuario |
| Garantizar unicidad (single-use) con Redlock | Almacenar transacción en CDP |
| Almacenar códigos canjeados (hasheados) | Notificar al usuario |
| **Generar códigos por lotes (modo MANAGED)** | Sincronizar sistemas externos |
| **Almacenar inventario de códigos emitidos** | Reportes de negocio |
| **Exportar lotes en CSV/JSON** | **Renderizar QR/barcode client-side** |
| Rate limiting y anti-fraude | **Reenviar IP real del usuario** en `X-Forwarded-For` |
| Estadísticas de canjes | Gestionar programas de fidelización |
| Geo-fencing (detección por IP) | Gestionar el catálogo de productos |
| Gestionar reglas de código (Admin API) | |
| Security linter en creación de reglas | |

---

## 20. Generación Gestionada — Modelo Conceptual

### 20.1 Posición en la arquitectura

La generación gestionada añade una nueva responsabilidad a OmniCodex: además de validar códigos, ahora puede **emitirlos**. Esto no reemplaza el modo EXTERNAL, sino que ofrece una alternativa para fabricantes que prefieren delegar la generación.

```
                    ┌─────────────────────────────────┐
                    │         OmniCodex               │
                    │                                 │
                    │  ┌───────────┐  ┌────────────┐  │
                    │  │ Validation│  │   Batch     │  │
  OmniWallet ──────►  │ Pipeline  │  │ Generation  │  ◄──── Admin / Fabricante
  (validar código)  │  │ (7 fases) │  │ Engine      │  │     (solicitar lote)
                    │  └─────┬─────┘  └──────┬──────┘  │
                    │        │               │         │
                    │        ▼               ▼         │
                    │  ┌──────────┐   ┌───────────┐   │
                    │  │redeemed_ │   │ issued_   │   │
                    │  │codes     │   │ codes     │   │
                    │  │(EXTERNAL)│   │ (MANAGED) │   │
                    │  └──────────┘   └───────────┘   │
                    │        │               │         │
                    │        └───────┬───────┘         │
                    │                ▼                  │
                    │        ┌─────────────┐           │
                    │        │   Stats &   │           │
                    │        │   Audit     │           │
                    │        └─────────────┘           │
                    └─────────────────────────────────┘
```

### 20.2 Diferencias clave entre modos

| Dimensión | EXTERNAL | MANAGED |
|---|---|---|
| Origen del código | Fabricante | OmniCodex |
| Prealmacenamiento | No | Sí (inventario `issued_codes`) |
| Autenticidad | Criptográfica (HMAC) o por estructura | Por inventario (existencia en DB) |
| Riesgo de forja | Medio-alto sin HMAC, bajo con HMAC | Nulo (solo códigos emitidos son válidos) |
| Riesgo de fuga | Bajo (no hay catálogo centralizado) | Medio (lote descargable) |
| Trazabilidad | Por canje | Completa (emisión → descarga → canje) |
| Escalabilidad de emisión | Ilimitada (fabricante genera) | Limitada por capacidad de generación y almacenamiento |

### 20.3 Responsabilidades nuevas de OmniCodex

1. **Generar** códigos que cumplan la `structureDef` de una `CodeRule`
2. **Almacenar** cada código generado como inventario (`IssuedCode`)
3. **Exportar** códigos en formato descargable (CSV, JSON)
4. **Gestionar** el ciclo de vida del lote (PENDING → GENERATING → COMPLETED → SEALED)
5. **Validar** códigos generados contra inventario (no contra estructura solamente)
6. **Auditar** descargas, canjes y cancelaciones

---

## 21. Generación Gestionada — Modelo de Datos

### 21.1 Diagrama de relaciones

```
Tenant ──1:N──► Project ──1:N──► CodeRule ──1:N──► CodeBatch ──1:N──► IssuedCode
                                     │
                                     └──1:N──► RedeemedCode (solo modo EXTERNAL)
```

### 21.2 Ciclo de vida del lote (CodeBatch)

```
PENDING ──► GENERATING ──► COMPLETED ──► SEALED
   │             │              │
   │             ▼              ▼
   └──► CANCELLED        CANCELLED
                │
                ▼
             FAILED
```

| Estado | Descripción | Transiciones permitidas |
|---|---|---|
| `PENDING` | Lote creado, esperando generación | → `GENERATING`, → `CANCELLED` |
| `GENERATING` | Generación en curso (background job) | → `COMPLETED`, → `FAILED` |
| `COMPLETED` | Generación terminada, listo para descarga | → `SEALED`, → `CANCELLED` |
| `FAILED` | Error durante generación (parcial o total) | → `PENDING` (reintentar) |
| `CANCELLED` | Cancelado por admin. Códigos revocados | Estado terminal |
| `SEALED` | Descargado y sellado. Re-descarga requiere autorización | Estado terminal (salvo unseal por admin) |

### 21.3 Ciclo de vida del código emitido (IssuedCode)

```
ACTIVE ──► REDEEMED
   │
   ├──► EXPIRED (por vigencia del lote)
   │
   └──► REVOKED (por cancelación del lote)
```

| Estado | Descripción |
|---|---|
| `ACTIVE` | Disponible para canje |
| `REDEEMED` | Canjeado exitosamente. `redeemedAt` y `redeemedByUser` rellenados |
| `EXPIRED` | Expirado porque `batch.expiresAt` fue superado |
| `REVOKED` | Invalidado por cancelación del lote |

### 21.4 Schema Prisma completo (entidades nuevas)

Ver secciones 3.5 (`CodeBatch`) y 3.6 (`IssuedCode`) para el schema Prisma detallado.

---

## 22. Generación Gestionada — Flujo de Generación

### 22.1 Flujo completo de una petición de lote

```
1. Request: POST /api/v1/batches
   {code_rule_id, batch_size, label?, expires_at?, format?}

2. Validaciones:
   ├── Tenant autenticado (API Key + HMAC)
   ├── CodeRule existe, activa, pertenece al tenant
   ├── CodeRule.generationMode == MANAGED
   ├── batch_size ∈ [1.000, 1.000.000]
   ├── Lotes GENERATING del tenant < BATCH_MAX_CONCURRENT_PER_TENANT
   └── Si expires_at, debe ser futuro

3. Crear registro CodeBatch (status: PENDING)

4. Si batch_size ≤ 10.000:
   │   Generación síncrona → COMPLETED → Response 200
   │
   └── Si batch_size > 10.000:
       Encolar job de generación → Response 202 (PENDING)
       El worker procesa el lote en background

5. Generación (síncrona o background):
   ├── Marcar lote como GENERATING
   ├── Loop por chunks de BATCH_CHUNK_SIZE (default 5.000):
   │   ├── Generar N códigos usando motor de segmentos (sección 24)
   │   ├── Calcular codeHash para cada código
   │   ├── Cifrar cada código (AES-256-GCM)
   │   ├── INSERT batch en issued_codes (ON CONFLICT regenerar)
   │   └── Actualizar generatedCount
   ├── Marcar lote como COMPLETED + completedAt
   └── Si error: marcar como FAILED + errorMessage

6. Response (síncrona):
   {batch_id, status, generated_count, ...}

   Response (asíncrona):
   {batch_id, status: "PENDING", poll_url}
```

### 22.2 Descarga del lote

```
1. Request: GET /api/v1/batches/:id/download?format=csv

2. Validaciones:
   ├── Lote existe y pertenece al tenant
   ├── Status == COMPLETED (no PENDING, GENERATING, CANCELLED)
   ├── Status != SEALED (requiere unseal previo)
   └── Si batch.expiresAt < now() → rechazar con aviso

3. Descifrar códigos (AES-256-GCM)

4. Streaming response:
   ├── CSV: header + rows (chunked transfer)
   └── JSON: array de códigos (chunked)

5. Actualizar download_count y last_download_at

6. Log de auditoría: quién descargó, cuándo, formato
```

### 22.3 Cancelación de lote

```
1. Request: POST /api/admin/batches/:id/cancel

2. Validaciones:
   ├── Lote existe
   ├── Status ∈ [PENDING, COMPLETED] (no se puede cancelar GENERATING)
   └── Admin autenticado

3. Acciones:
   ├── Marcar lote como CANCELLED
   ├── UPDATE issued_codes SET status = 'REVOKED'
   │   WHERE batch_id = :id AND status = 'ACTIVE'
   └── Log de auditoría

4. Los códigos REDEEMED no se revocan (ya canjeados)
```

---

## 23. Generación Gestionada — Flujo de Validación

### 23.1 Validación de un código generado por OmniCodex

El pipeline de validación es **el mismo** para ambos modos. La bifurcación ocurre únicamente en la Fase 6.

```
Código recibido (POST /api/v1/validate)
     │
     ▼
Fases 1-5b: IDÉNTICAS (normalización, estructura, segmentos, check digit, vigencia, geo-fencing)
     │
     ▼
¿codeRule.generationMode?
     │
     ├── EXTERNAL ──► Fase 6 original (uniqueness.ts)
     │                INSERT redeemed_codes ON CONFLICT
     │
     └── MANAGED ──► Fase 6 managed (redemption-managed.ts)
                     │
                     ├── 1. Hash del código: HMAC(code, CODE_HASH_PEPPER)
                     ├── 2. SELECT FROM issued_codes WHERE codeHash = :hash
                     │      AND batch.codeRuleId = :ruleId
                     ├── 3. Si no existe → NO_MATCHING_RULE (código no emitido)
                     ├── 4. Si status = REDEEMED → ALREADY_REDEEMED
                     ├── 5. Si status = EXPIRED → CODE_EXPIRED
                     ├── 6. Si status = REVOKED → CODE_REVOKED
                     ├── 7. Si status = ACTIVE:
                     │      ├── Verificar batch.expiresAt (si aplica)
                     │      ├── UPDATE status = REDEEMED, redeemedAt, redeemedByUser
                     │      └── Return OK
                     └── 8. Log de auditoría
```

### 23.2 Códigos de error adicionales para modo MANAGED

| `error_code` | HTTP | Descripción |
|---|---|---|
| `CODE_NOT_ISSUED` | 404 | El código cumple la estructura pero no fue emitido por OmniCodex |
| `CODE_EXPIRED` | 410 | El código fue emitido pero el lote ha expirado |
| `CODE_REVOKED` | 410 | El código fue revocado (lote cancelado) |

### 23.3 Seguridad del modo MANAGED vs EXTERNAL

En modo MANAGED, un código que "cumple la estructura" pero no existe en `issued_codes` es **rechazado**. Esto es fundamentalmente más seguro que el modo EXTERNAL sin HMAC, donde cualquier código que cumpla la estructura es aceptado.

En la práctica, el modo MANAGED convierte a OmniCodex en la **única fuente de verdad** para códigos válidos. No importa si alguien conoce la estructura — sin estar en el inventario, el código no se acepta.

---

## 24. Generación Gestionada — Motor de Generación por Segmentos

### 24.1 Principio: reutilizar `structureDef`

El motor de generación usa la **misma definición de segmentos** que el motor de validación. No se crea un sistema de composición paralelo.

La regla define la estructura y OmniCodex la usa bidireccionalmente:
- **Validación:** descompone el código en segmentos y verifica cada uno
- **Generación:** compone un código generando el valor de cada segmento

### 24.2 Estrategia de generación por tipo de segmento

| Segmento | Categoría | Estrategia de generación |
|---|---|---|
| `fixed` | Literal | Emitir `segment.value` tal cual |
| `numeric` | Aleatorio | `crypto.randomInt(min, max)` formateado a `segment.length` dígitos. Si no hay min/max, rango `[0, 10^length - 1]` |
| `alpha` | Aleatorio | Random con charset según `segment.case`: upper → `[A-Z]`, lower → `[a-z]`, both → `[A-Za-z]` |
| `alphanumeric` | Aleatorio | Random con charset `[A-Z0-9]` (o según `codeRule.charset`) |
| `enum` | Selección | Random de `segment.values[]`. Si hay un solo valor, siempre ese |
| `date` | Contextual | Fecha del lote (`batch.createdAt`) formateada según `segment.format` (YYYYMMDD, YYMMDD, YYDDD) |
| `hmac` | Derivado | Calculado con `hmacSha256Base32(payload, fabricantSecret, length)` después de generar todos los segmentos base |
| `check` | Derivado | Calculado con `checkDigitCalculate(algorithm, dataSegments)` después de generar segmentos base + HMAC |

### 24.3 Orden de generación

Los segmentos se generan en **dos pasadas**, igual que en la validación:

```
Pasada 1 — Segmentos base (orden de structureDef):
  fixed → valor literal
  numeric → random
  alpha → random
  alphanumeric → random
  enum → random selección
  date → fecha del lote
  hmac → SKIP (marcado como pendiente)
  check → SKIP (marcado como pendiente)

Pasada 2 — Segmentos derivados:
  hmac → HMAC-SHA256-BASE32(concat(appliesTo segments), fabricantSecret)
  check → calculate(algorithm, concat(appliesTo segments))
```

### 24.4 Ejemplo de generación

Regla con `structureDef`:
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

**Pasada 1:**
```
prefix = "PRO"           (fixed: valor literal)
batch  = "42"             (numeric: crypto.randomInt(0, 99) → pad a 2 dígitos)
serial = "K7M3P9"         (alphanumeric: 6 chars random de [A-Z0-9])
auth   = pendiente
check  = pendiente
```

**Pasada 2:**
```
auth   = hmacSha256Base32("42K7M3P9", fabricantSecret, 6) → "D4F2GT"
check  = luhnCalculate("42K7M3P9D4F2GT") → "3"
```

**Código final:** `PRO42K7M3P9D4F2GT3`

Con separador `-` y prefix: `PRO-42-K7M3P9-D4F2GT-3`

### 24.5 Uso de `crypto.randomInt` para generación segura

Toda la aleatoriedad usa `crypto.randomInt()` o `crypto.randomBytes()` del módulo `node:crypto`. **Nunca `Math.random()`**. Esto garantiza que los códigos sean criptográficamente impredecibles.

### 24.6 Reutilización de funciones existentes

| Función existente | Ubicación | Uso en generación |
|---|---|---|
| `hmacSha256Base32()` | `utils/crypto.ts` | Calcular segmento HMAC |
| `codeHash()` | `utils/crypto.ts` | Generar `codeHash` para almacenamiento |
| `luhnCalculate()`, etc. | `validation/check-digit/*.ts` | Calcular dígito de control |
| `getValidator().calculate()` | `validation/check-digit/index.ts` | Dispatcher para cualquier algoritmo |

No se duplica lógica. El motor de generación importa y usa las mismas funciones que el motor de validación.

---

## 25. Generación Gestionada — Seguridad y Escalabilidad

### 25.1 Generación de lotes grandes (hasta 1M)

| Aspecto | Estrategia |
|---|---|
| **Procesamiento** | Lotes > 10K → background job. Lotes ≤ 10K → síncrono |
| **Chunks** | Inserción en chunks de `BATCH_CHUNK_SIZE` (default 5.000) para no bloquear DB |
| **Transaccionalidad** | Cada chunk en su propia transacción. Si falla un chunk, el lote queda como FAILED con `generatedCount` parcial |
| **Concurrencia** | Máx. `BATCH_MAX_CONCURRENT_PER_TENANT` lotes en estado GENERATING por tenant |
| **Timeout** | Job de generación tiene timeout de 30 minutos. Si se excede → FAILED |
| **Idempotencia** | Si un lote FAILED se reintenta, regenera solo los códigos faltantes (basado en `generatedCount` vs `batchSize`) |

### 25.2 Prevención de colisiones

```
Por cada chunk de N códigos:
  1. Generar N códigos en memoria
  2. Deduplicar dentro del chunk (Set de hashes)
  3. INSERT batch con ON CONFLICT (batch_id, code_hash) DO NOTHING
  4. Contar filas insertadas vs intentadas
  5. Si hay colisiones: regenerar los faltantes y reintentar
  6. Máx. 3 reintentos por chunk antes de FAILED
```

**Análisis probabilístico:** Con códigos alfanuméricos de 12 caracteres (charset 36), el espacio es ~4.7×10¹⁸. Para 1M de códigos, la probabilidad de colisión es ~10⁻⁷ (despreciable), pero el mecanismo de retry garantiza corrección incluso en casos extremos.

### 25.3 Almacenamiento eficiente

| Dato | Tamaño estimado por código | Para 1M códigos |
|---|---|---|
| `id` (UUID) | 36 bytes | 36 MB |
| `codeHash` (HMAC-SHA256 hex) | 64 bytes | 64 MB |
| `codeEncrypted` (AES-256-GCM) | ~80 bytes | 80 MB |
| `status` (enum) | 4 bytes | 4 MB |
| Timestamps + FK | ~50 bytes | 50 MB |
| **Total por código** | **~234 bytes** | **~234 MB** |

Un lote de 1M ocupa ~234 MB en DB. Es manejable, pero los índices añaden overhead. Considerar particionamiento de `issued_codes` por `batch_id` si la tabla supera los 100M de registros.

### 25.4 Exportación segura

| Medida | Descripción |
|---|---|
| **Cifrado en reposo** | Códigos almacenados con AES-256-GCM. Clave derivada: `HKDF(BATCH_ENCRYPTION_KEY, batchId)` |
| **Descifrado bajo demanda** | Solo se descifran en memoria durante la descarga. Nunca se cachean en texto plano |
| **Streaming** | Lotes > 50K se envían como stream chunked. No se carga todo en memoria |
| **Audit log** | Cada descarga registra: usuario, IP, timestamp, formato, cantidad de códigos |
| **Sellado** | Admin puede sellar lote tras descarga. Re-descarga requiere acción explícita de unseal |
| **Conteo de descargas** | `download_count` visible en admin. Alertar si > 3 descargas sin sellado |

### 25.5 Protección contra fuga de inventario

El riesgo principal del modo MANAGED es que una fuga del lote exportado compromete todos los códigos del lote. Mitigaciones:

1. **Códigos cifrados en DB** — Una fuga de la DB no revela los códigos
2. **Descarga autenticada** — Requiere API Key + HMAC o JWT admin
3. **Sellado de lote** — Limita ventana de exposición
4. **Revocación de lote** — Si se detecta fuga, cancelar el lote invalida todos los códigos activos inmediatamente
5. **Segregación por lote** — Un lote comprometido no afecta a otros lotes de la misma regla
6. **Webhook de descarga** — Notificar al tenant cuando se descarga un lote (via `tenant.webhookUrl`)

### 25.6 Variables de entorno nuevas

| Variable | Descripción | Default |
|---|---|---|
| `BATCH_ENCRYPTION_KEY` | Clave para cifrado AES-256-GCM de códigos emitidos | Derivado de `CODE_HASH_PEPPER` si no se define |
| `BATCH_MAX_CONCURRENT_PER_TENANT` | Máximo de lotes en estado GENERATING por tenant | `3` |
| `BATCH_CHUNK_SIZE` | Tamaño de chunk para INSERT batch | `5000` |
| `BATCH_JOB_TIMEOUT_MS` | Timeout del job de generación | `1800000` (30 min) |
| `BATCH_MAX_DOWNLOAD_ALERTS` | Umbral de descargas antes de alertar | `3` |
