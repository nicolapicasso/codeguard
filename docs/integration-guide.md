# OmniCodex — Guía de Integración para OmniWallet

## Índice

1. [Resumen del Flujo](#1-resumen-del-flujo)
2. [Autenticación](#2-autenticación)
3. [Validar un Código](#3-validar-un-código)
4. [Consultar Canjes](#4-consultar-canjes)
5. [Estadísticas](#5-estadísticas)
6. [Códigos de Error](#6-códigos-de-error)
7. [Rate Limiting](#7-rate-limiting)
8. [Modo Sandbox](#8-modo-sandbox)
9. [Geo-fencing](#9-geo-fencing)
10. [Seguridad](#10-seguridad)
11. [Ejemplos por Lenguaje](#11-ejemplos-por-lenguaje)

---

## 1. Resumen del Flujo

```
┌──────────┐     ┌───────────────┐     ┌───────────┐
│  Usuario  │────▶│  OmniWallet   │────▶│ OmniCodex │
│  (App)    │     │  (Backend)    │     │   (API)   │
└──────────┘     └───────────────┘     └───────────┘
      │                  │                     │
      │  1. Escanea      │  2. POST /validate  │
      │     código       │  (con HMAC + Nonce) │
      │                  │────────────────────▶│
      │                  │                     │ 3. Pipeline:
      │                  │                     │    Normaliza
      │                  │                     │    Estructura
      │                  │                     │    Segmentos
      │                  │                     │    Check digit
      │                  │                     │    Vigencia
      │                  │                     │    Unicidad
      │                  │  4. Respuesta       │
      │                  │◀────────────────────│
      │                  │    OK / KO          │
      │  5. Resultado    │                     │
      │◀─────────────────│                     │
      │  (puntos/error)  │                     │
```

**Responsabilidades:**
- **OmniCodex** valida el código, verifica unicidad, registra el canje
- **OmniWallet** gestiona la UX, asigna puntos, gestiona la fidelización

---

## 2. Autenticación

Todas las peticiones a la Validation API requieren **4 headers**:

| Header | Descripción | Ejemplo |
|--------|-------------|---------|
| `X-Api-Key` | Clave pública del tenant | `cg_abc123...` |
| `X-Timestamp` | Fecha ISO 8601 (UTC) | `2026-01-15T10:30:00Z` |
| `X-Nonce` | UUID v4 único por petición (anti-replay) | `f47ac10b-58cc-4372-a567-0e02b2c3d479` |
| `X-Signature` | HMAC-SHA256 del payload canónico | `a1b2c3d4e5...` |

### Cómo generar la firma HMAC

El payload de firma incluye el método HTTP, la ruta, el timestamp, el nonce y el body, separados por saltos de línea:

```
SIGNATURE = HMAC-SHA256("METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY", api_secret)
```

- **METHOD** es el verbo HTTP en mayúsculas (ej: `POST`, `GET`)
- **PATH** es la ruta del endpoint (ej: `/api/v1/validate`)
- **TIMESTAMP** es el valor del header `X-Timestamp`
- **NONCE** es el valor del header `X-Nonce` (UUID v4, debe ser único por petición)
- **BODY** es el JSON raw (sin modificar, exactamente como se envía). Para peticiones GET (sin body), usar cadena vacía
- El **api_secret** se obtiene al crear el tenant desde el Admin Panel
- El timestamp tiene tolerancia de **60 segundos** (anti-replay)
- Los nonces se almacenan en Redis y se rechazan si se reutilizan

> **Modo legacy (compatibilidad hacia atrás):** Si no se envía el header `X-Nonce`, la firma se calcula solo sobre el body: `HMAC-SHA256(body, api_secret)`. Este modo se mantiene temporalmente para facilitar la migración, pero se recomienda adoptar el nuevo formato con nonce lo antes posible.

### Ejemplo en bash

```bash
API_KEY="cg_tu_api_key"
API_SECRET="tu_api_secret"
BODY='{"code":"ABC12345678","project_id":"uuid-del-proyecto"}'
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NONCE=$(uuidgen)
METHOD="POST"
PATH_URL="/api/v1/validate"
SIGNATURE=$(printf '%s\n%s\n%s\n%s\n%s' "$METHOD" "$PATH_URL" "$TIMESTAMP" "$NONCE" "$BODY" \
  | openssl dgst -sha256 -hmac "$API_SECRET" | cut -d' ' -f2)

curl -X POST https://omnicodex.example.com/api/v1/validate \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $API_KEY" \
  -H "X-Timestamp: $TIMESTAMP" \
  -H "X-Nonce: $NONCE" \
  -H "X-Signature: $SIGNATURE" \
  -d "$BODY"
```

---

## 3. Validar un Código

**`POST /api/v1/validate`**

Valida el código y lo marca como canjeado (single-use).

> **Nota:** El endpoint `GET /api/v1/validate/check` (pre-validación sin canje) ha sido retirado de la API pública. La funcionalidad de prueba de reglas está disponible exclusivamente a través de la Admin API: `POST /api/admin/rules/:id/test`.

### Request Body

```json
{
  "code": "ABC-1234-5678-3",
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "ow_user_id": "user_12345",
  "ow_transaction_id": "txn_67890",
  "metadata": {
    "channel": "mobile_app",
    "store_id": "store_001"
  }
}
```

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|:-----------:|-------------|
| `code` | string | Sí | Código impreso tal cual lo escanea el usuario |
| `project_id` | UUID | Sí | ID del proyecto/campaña en OmniCodex |
| `ow_user_id` | string | No | ID del usuario en OmniWallet |
| `ow_transaction_id` | string | No | ID de transacción en OmniWallet |
| `country` | string | No | Código ISO 3166-1 alpha-2 (ej: `ES`, `MX`). Solo se usa como fallback si no se detecta el país por IP (ver [Geo-fencing](#9-geo-fencing)) |
| `metadata` | object | No | Datos adicionales (canal, tienda, etc.) |

### Respuesta OK (200)

```json
{
  "status": "OK",
  "redemption_id": "770e8400-e29b-41d4-a716-446655440000",
  "redeemed_at": "2026-01-15T10:30:00.000Z",
  "points_value": 50,
  "detected_country": "ES"
}
```

La respuesta de validación es minimal. Ya no se devuelven los campos `code`, `code_normalized`, `project`, `code_rule`, `product_info` ni `campaign_info`.

### Respuesta KO (4xx)

```json
{
  "status": "KO",
  "error_code": "ALREADY_REDEEMED",
  "error_message": "Code has already been redeemed"
}
```

Las respuestas de error son minimales y solo incluyen `status`, `error_code` y `error_message`. El campo `details` ya no se devuelve en la API pública.

---

## 4. Consultar Canjes

Todos los endpoints `/codes` están **scoped al tenant autenticado** (protección BOLA). Cada tenant solo puede consultar sus propios canjes; no es posible acceder a datos de otros tenants.

### Listar canjes

**`GET /api/v1/codes`**

| Query param | Tipo | Descripción |
|-------------|------|-------------|
| `project_id` | UUID | Filtrar por proyecto |
| `from` | ISO 8601 | Fecha inicio |
| `to` | ISO 8601 | Fecha fin |
| `page` | int | Página (default: 1) |
| `limit` | int | Items por página (default: 50, max: 100) |

```json
{
  "data": [
    {
      "id": "770e8400-...",
      "code_hash": "a1b2c3...",
      "code_rule_id": "660e8400-...",
      "code_rule_name": "Códigos Premium",
      "ow_user_id": "user_12345",
      "redemption_count": 1,
      "redeemed_at": "2026-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1234,
    "totalPages": 25
  }
}
```

### Detalle de un canje

**`GET /api/v1/codes/:redemption_id`**

---

## 5. Estadísticas

**`GET /api/v1/stats/:project_id`**

```json
{
  "project_id": "550e8400-...",
  "total_redemptions": 15234,
  "unique_users": 8901,
  "by_rule": [
    { "rule_id": "...", "rule_name": "Premium", "count": 10000 },
    { "rule_id": "...", "rule_name": "Standard", "count": 5234 }
  ],
  "by_day": [
    { "date": "2026-01-15", "count": 1200 },
    { "date": "2026-01-14", "count": 980 }
  ]
}
```

---

## 6. Códigos de Error

| error_code | HTTP | Significado | Acción recomendada |
|------------|:----:|-------------|-------------------|
| `INVALID_CODE` | 400 | El código es inválido (estructura, segmento o dígito de control incorrectos) | Verificar que el código escaneado es correcto y no está dañado |
| `NO_MATCHING_RULE` | 404 | No hay regla que coincida con el código | Verificar project_id o que el código pertenece a este proyecto |
| `ALREADY_REDEEMED` | 409 | El código ya fue canjeado | Informar al usuario que ya lo usó |
| `PROJECT_INACTIVE` | 403 | El proyecto está desactivado | Contactar administrador |
| `PROJECT_EXPIRED` | 403 | El proyecto está fuera de rango de fechas | La campaña ha terminado |
| `RULE_INACTIVE` | 403 | La regla está desactivada | Contactar administrador |
| `TENANT_MISMATCH` | 403 | El código o proyecto no pertenece al tenant autenticado | Verificar que se está usando la API key correcta para este proyecto |
| `GEO_BLOCKED` | 403 | País no permitido para esta regla | El usuario está fuera de la zona geográfica |
| `RATE_LIMITED` | 429 | Demasiadas peticiones | Implementar backoff exponencial |
| `AUTH_FAILED` | 401 | API Key inválida, firma incorrecta o nonce reutilizado | Verificar credenciales, generación de HMAC y unicidad del nonce |

> **Nota:** Los antiguos códigos `INVALID_STRUCTURE`, `INVALID_SEGMENT` e `INVALID_CHECK_DIGIT` se han unificado en `INVALID_CODE`. Las respuestas de error solo incluyen `status`, `error_code` y `error_message` (sin campo `details`).

---

## 7. Rate Limiting

OmniCodex aplica dos niveles de rate limiting:

| Nivel | Límite default | Clave |
|-------|:-------------:|-------|
| **Global por IP** | 100 req/min | Dirección IP |
| **Por usuario** | 30 req/min | `X-Api-Key` + `ow_user_id` |

Headers de respuesta cuando se aplica:

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 25
X-RateLimit-Reset: 1705312200
```

Si se excede:

```json
{
  "status": "KO",
  "error_code": "RATE_LIMITED",
  "error_message": "Too many requests, please try again later"
}
```

**Recomendación:** Implementar retry con backoff exponencial (1s, 2s, 4s, 8s).

---

## 8. Modo Sandbox

OmniCodex soporta un **modo sandbox** para pruebas de integración sin afectar datos de producción.

### Cómo activar

Enviar el header `X-Sandbox: true` en las peticiones de validación:

```bash
NONCE=$(uuidgen)
METHOD="POST"
PATH_URL="/api/v1/validate"
SIGNATURE=$(printf '%s\n%s\n%s\n%s\n%s' "$METHOD" "$PATH_URL" "$TIMESTAMP" "$NONCE" "$BODY" \
  | openssl dgst -sha256 -hmac "$API_SECRET" | cut -d' ' -f2)

curl -X POST https://omnicodex.example.com/api/v1/validate \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $API_KEY" \
  -H "X-Timestamp: $TIMESTAMP" \
  -H "X-Nonce: $NONCE" \
  -H "X-Signature: $SIGNATURE" \
  -H "X-Sandbox: true" \
  -d "$BODY"
```

### Comportamiento en sandbox

| Aspecto | Producción | Sandbox |
|---------|:----------:|:-------:|
| Pipeline fases 1-5 | Ejecuta | Ejecuta |
| Fase 6 (unicidad) | Registra canje real | **Simula** (no persiste) |
| Respuesta | `redemption_id` real | `redemption_id: "sandbox-*"` |
| Rate limiting | Activo | Activo (con prefix sandbox) |
| Estadísticas | Contabiliza | **No contabiliza** |

### Identificar respuestas sandbox

Las respuestas sandbox incluyen un campo adicional:

```json
{
  "status": "OK",
  "sandbox": true,
  "redemption_id": "sandbox-a1b2c3d4",
  ...
}
```

---

## 9. Geo-fencing

OmniCodex soporta restricción geográfica por regla de código. Si una regla tiene países permitidos configurados, solo se aceptarán canjes desde esos países.

### Detección automática por IP (recomendado)

OmniWallet **debe** enviar el header `X-Forwarded-For` con la IP real del usuario final. OmniCodex usará esta IP para detectar automáticamente el país mediante GeoIP:

```
X-Forwarded-For: 203.0.113.42
```

Este es el mecanismo principal de detección geográfica. OmniWallet debe asegurarse de incluir la IP real del usuario, no la IP del propio servidor backend.

### Fallback por campo `country`

Si la detección por IP no está disponible o no es concluyente, se puede incluir `country` en el body de validación como fallback:

```json
{
  "code": "ABC123",
  "project_id": "...",
  "country": "ES"
}
```

El campo `country` debe ser un código **ISO 3166-1 alpha-2** (2 letras mayúsculas). Ejemplos: `ES` (España), `MX` (México), `AR` (Argentina), `CO` (Colombia).

> **Nota:** Si se envía tanto `X-Forwarded-For` como `country`, la detección por IP tiene prioridad. El campo `country` solo se usa si no se puede determinar el país por IP.

Si la regla tiene geo-fencing activo y el país no está en la lista permitida:

```json
{
  "status": "KO",
  "error_code": "GEO_BLOCKED",
  "error_message": "This code cannot be redeemed from your country"
}
```

---

## 10. Seguridad

### Almacenamiento de códigos

Los códigos se almacenan como **hash HMAC-keyed** (HMAC-SHA256 con clave del servidor), no como hash SHA-256 plano. Esto previene ataques de rainbow table incluso si un atacante obtiene acceso a la base de datos. El código original nunca se guarda en producción (a menos que `STORE_PLAIN_CODES=true` esté configurado para debugging).

### Anti-replay

La protección anti-replay utiliza dos mecanismos:

1. **Timestamp:** El header `X-Timestamp` se rechaza si tiene más de **60 segundos** de diferencia con el servidor
2. **Nonce:** El header `X-Nonce` (UUID v4) debe ser único por petición. Los nonces se almacenan en Redis y se rechazan si se reutilizan, lo que impide completamente la repetición de peticiones capturadas

### Protección BOLA

Todos los endpoints `/codes` están scoped al tenant autenticado. Cada petición solo puede acceder a datos que pertenecen al tenant identificado por la `X-Api-Key`. Esto previene el acceso no autorizado a datos de otros tenants (Broken Object Level Authorization).

### Unicidad atómica

La fase 6 del pipeline usa:
1. **Redlock** — Bloqueo distribuido para evitar race conditions
2. **INSERT con UNIQUE constraint** — Constraint a nivel de base de datos `(code_rule_id, code_hash)` como garantía final

Esto garantiza que un código solo se puede canjear una vez, incluso con peticiones concurrentes.

### Recomendaciones para OmniWallet

1. **Nunca exponer** `api_secret` al frontend/app móvil
2. **Firmar peticiones** siempre desde el backend de OmniWallet
3. **Generar un nonce UUID v4 único** para cada petición
4. **Enviar `X-Forwarded-For`** con la IP real del usuario en cada petición
5. **Usar HTTPS** en producción
6. **Rotar credenciales** periódicamente desde el Admin Panel
7. **Monitorizar** el endpoint `/api/v1/stats` para detectar anomalías

---

## 11. Ejemplos por Lenguaje

### Node.js / TypeScript

```typescript
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const API_KEY = 'cg_your_api_key';
const API_SECRET = 'your_api_secret';
const BASE_URL = 'https://omnicodex.example.com';

async function validateCode(code: string, projectId: string, userId?: string, userIp?: string) {
  const body = JSON.stringify({
    code,
    project_id: projectId,
    ow_user_id: userId,
  });

  const method = 'POST';
  const path = '/api/v1/validate';
  const timestamp = new Date().toISOString();
  const nonce = uuidv4();

  const payload = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}`;
  const signature = crypto
    .createHmac('sha256', API_SECRET)
    .update(payload)
    .digest('hex');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Api-Key': API_KEY,
    'X-Timestamp': timestamp,
    'X-Nonce': nonce,
    'X-Signature': signature,
  };

  if (userIp) {
    headers['X-Forwarded-For'] = userIp;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body,
  });

  return response.json();
}

// Uso
const result = await validateCode('ABC-1234-5678-3', 'project-uuid', 'user-123', '203.0.113.42');
if (result.status === 'OK') {
  console.log(`Código válido! Puntos: ${result.points_value}, País: ${result.detected_country}`);
} else {
  console.log(`Error: ${result.error_code} — ${result.error_message}`);
}
```

### Python

```python
import hashlib
import hmac
import json
import uuid
import requests
from datetime import datetime, timezone

API_KEY = 'cg_your_api_key'
API_SECRET = 'your_api_secret'
BASE_URL = 'https://omnicodex.example.com'

def validate_code(code: str, project_id: str, user_id: str = None, user_ip: str = None):
    body = {
        'code': code,
        'project_id': project_id,
    }
    if user_id:
        body['ow_user_id'] = user_id

    body_str = json.dumps(body, separators=(',', ':'))
    method = 'POST'
    path = '/api/v1/validate'
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    nonce = str(uuid.uuid4())

    payload = f'{method}\n{path}\n{timestamp}\n{nonce}\n{body_str}'
    signature = hmac.new(
        API_SECRET.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()

    headers = {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'X-Signature': signature,
    }

    if user_ip:
        headers['X-Forwarded-For'] = user_ip

    response = requests.post(
        f'{BASE_URL}{path}',
        headers=headers,
        data=body_str,
    )

    return response.json()

# Uso
result = validate_code('ABC-1234-5678-3', 'project-uuid', 'user-123', '203.0.113.42')
if result['status'] == 'OK':
    print(f"Código válido! redemption_id: {result['redemption_id']}, puntos: {result['points_value']}")
else:
    print(f"Error: {result['error_code']}")
```

### PHP

```php
<?php
$apiKey = 'cg_your_api_key';
$apiSecret = 'your_api_secret';
$baseUrl = 'https://omnicodex.example.com';

function validateCode(string $code, string $projectId, ?string $userId = null, ?string $userIp = null): array {
    global $apiKey, $apiSecret, $baseUrl;

    $body = json_encode(array_filter([
        'code' => $code,
        'project_id' => $projectId,
        'ow_user_id' => $userId,
    ]));

    $method = 'POST';
    $path = '/api/v1/validate';
    $timestamp = gmdate('Y-m-d\TH:i:s\Z');
    $nonce = sprintf('%s-%s-%s-%s-%s',
        bin2hex(random_bytes(4)),
        bin2hex(random_bytes(2)),
        bin2hex(random_bytes(2)),
        bin2hex(random_bytes(2)),
        bin2hex(random_bytes(6))
    );

    $payload = implode("\n", [$method, $path, $timestamp, $nonce, $body]);
    $signature = hash_hmac('sha256', $payload, $apiSecret);

    $headers = [
        'Content-Type: application/json',
        "X-Api-Key: $apiKey",
        "X-Timestamp: $timestamp",
        "X-Nonce: $nonce",
        "X-Signature: $signature",
    ];

    if ($userIp) {
        $headers[] = "X-Forwarded-For: $userIp";
    }

    $ch = curl_init("$baseUrl$path");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => $headers,
    ]);

    $response = curl_exec($ch);
    curl_close($ch);

    return json_decode($response, true);
}

// Uso
$result = validateCode('ABC-1234-5678-3', 'project-uuid', 'user-123', '203.0.113.42');
if ($result['status'] === 'OK') {
    echo "Código válido! redemption_id: " . $result['redemption_id'] . ", puntos: " . $result['points_value'];
} else {
    echo "Error: " . $result['error_code'];
}
```

### Java (Spring)

```java
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.http.*;
import java.time.Instant;
import java.util.UUID;

public class OmniCodexClient {
    private static final String API_KEY = "cg_your_api_key";
    private static final String API_SECRET = "your_api_secret";
    private static final String BASE_URL = "https://omnicodex.example.com";

    public static String validateCode(String code, String projectId, String userId, String userIp)
            throws Exception {
        String body = String.format(
            "{\"code\":\"%s\",\"project_id\":\"%s\",\"ow_user_id\":\"%s\"}",
            code, projectId, userId
        );

        String method = "POST";
        String path = "/api/v1/validate";
        String timestamp = Instant.now().toString();
        String nonce = UUID.randomUUID().toString();

        String payload = String.join("\n", method, path, timestamp, nonce, body);

        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(API_SECRET.getBytes(), "HmacSHA256"));
        byte[] hash = mac.doFinal(payload.getBytes());
        String signature = bytesToHex(hash);

        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
            .uri(java.net.URI.create(BASE_URL + path))
            .header("Content-Type", "application/json")
            .header("X-Api-Key", API_KEY)
            .header("X-Timestamp", timestamp)
            .header("X-Nonce", nonce)
            .header("X-Signature", signature)
            .POST(HttpRequest.BodyPublishers.ofString(body));

        if (userIp != null) {
            requestBuilder.header("X-Forwarded-For", userIp);
        }

        HttpResponse<String> response = HttpClient.newHttpClient()
            .send(requestBuilder.build(), HttpResponse.BodyHandlers.ofString());

        return response.body();
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
```

---

## Checklist de Integración

- [ ] Obtener `api_key` y `api_secret` del Admin Panel de OmniCodex
- [ ] Implementar generación de HMAC-SHA256 con payload canónico (METHOD, PATH, TIMESTAMP, NONCE, BODY)
- [ ] Generar un UUID v4 nonce único por cada petición (`X-Nonce`)
- [ ] Configurar el `project_id` correspondiente a cada campaña
- [ ] Integrar `POST /api/v1/validate` en el flujo de escaneo
- [ ] Enviar `X-Forwarded-For` con la IP real del usuario en cada petición
- [ ] Manejar todos los `error_code` (ver tabla sección 6)
- [ ] Implementar retry con backoff para `RATE_LIMITED` (429)
- [ ] Probar en modo sandbox con header `X-Sandbox: true`
- [ ] Configurar geo-fencing si hay restricción geográfica
- [ ] Monitorizar estadísticas vía `/api/v1/stats/:project_id`
- [ ] Planificar rotación de credenciales periódica
