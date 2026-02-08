# CodeGuard — Guía de Integración para OmniWallet

## Índice

1. [Resumen del Flujo](#1-resumen-del-flujo)
2. [Autenticación](#2-autenticación)
3. [Validar un Código](#3-validar-un-código)
4. [Pre-validación (sin canje)](#4-pre-validación-sin-canje)
5. [Consultar Canjes](#5-consultar-canjes)
6. [Estadísticas](#6-estadísticas)
7. [Códigos de Error](#7-códigos-de-error)
8. [Rate Limiting](#8-rate-limiting)
9. [Modo Sandbox](#9-modo-sandbox)
10. [Geo-fencing](#10-geo-fencing)
11. [Seguridad](#11-seguridad)
12. [Ejemplos por Lenguaje](#12-ejemplos-por-lenguaje)

---

## 1. Resumen del Flujo

```
┌──────────┐     ┌───────────────┐     ┌───────────┐
│  Usuario  │────▶│  OmniWallet   │────▶│ CodeGuard │
│  (App)    │     │  (Backend)    │     │   (API)   │
└──────────┘     └───────────────┘     └───────────┘
      │                  │                     │
      │  1. Escanea      │  2. POST /validate  │
      │     código       │  (con HMAC)         │
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
- **CodeGuard** valida el código, verifica unicidad, registra el canje
- **OmniWallet** gestiona la UX, asigna puntos, gestiona la fidelización

---

## 2. Autenticación

Todas las peticiones a la Validation API requieren **3 headers**:

| Header | Descripción | Ejemplo |
|--------|-------------|---------|
| `X-Api-Key` | Clave pública del tenant | `cg_abc123...` |
| `X-Timestamp` | Fecha ISO 8601 (UTC) | `2025-01-15T10:30:00Z` |
| `X-Signature` | HMAC-SHA256 del body | `a1b2c3d4e5...` |

### Cómo generar la firma HMAC

```
SIGNATURE = HMAC-SHA256(request_body, api_secret)
```

- El **body** es el JSON raw (sin modificar, exactamente como se envía)
- Para peticiones **GET** (sin body), firmar el string vacío: `HMAC-SHA256("", api_secret)`
- El **api_secret** se obtiene al crear el tenant desde el Admin Panel
- El timestamp tiene tolerancia de **5 minutos** (anti-replay)

### Ejemplo en bash

```bash
API_KEY="cg_tu_api_key"
API_SECRET="tu_api_secret"
BODY='{"code":"ABC12345678","project_id":"uuid-del-proyecto"}'
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$API_SECRET" | cut -d' ' -f2)

curl -X POST http://codeguard.example.com/api/v1/validate \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $API_KEY" \
  -H "X-Timestamp: $TIMESTAMP" \
  -H "X-Signature: $SIGNATURE" \
  -d "$BODY"
```

---

## 3. Validar un Código

**`POST /api/v1/validate`**

Valida el código y lo marca como canjeado (single-use).

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
| `project_id` | UUID | Sí | ID del proyecto/campaña en CodeGuard |
| `ow_user_id` | string | No | ID del usuario en OmniWallet |
| `ow_transaction_id` | string | No | ID de transacción en OmniWallet |
| `country` | string | No | Código ISO 3166-1 alpha-2 (ej: `ES`, `MX`) para geo-fencing |
| `metadata` | object | No | Datos adicionales (canal, tienda, etc.) |

### Respuesta OK (200)

```json
{
  "status": "OK",
  "code": "ABC-1234-5678-3",
  "code_normalized": "ABC123456783",
  "project": {
    "id": "550e8400-...",
    "name": "Campaña Navidad 2025"
  },
  "code_rule": {
    "id": "660e8400-...",
    "name": "Códigos Producto Premium"
  },
  "product_info": {
    "brand": "MarcaX",
    "sku": "PROD-001",
    "category": "bebidas"
  },
  "campaign_info": {
    "name": "Navidad 2025",
    "points_multiplier": 2
  },
  "redeemed_at": "2025-01-15T10:30:00.000Z",
  "redemption_id": "770e8400-..."
}
```

### Respuesta KO (4xx)

```json
{
  "status": "KO",
  "error_code": "ALREADY_REDEEMED",
  "error_message": "Code has already been redeemed"
}
```

---

## 4. Pre-validación (sin canje)

**`GET /api/v1/validate/check?code=ABC123&project_id=UUID`**

Ejecuta el pipeline completo **sin registrar el canje** (fases 1-5, sin fase 6). Útil para:
- Verificar que un código es válido antes de confirmar la operación
- Debugging durante integración
- Mostrar preview al usuario antes de confirmar

### Respuesta OK (200)

```json
{
  "status": "OK",
  "code": "ABC123",
  "code_normalized": "ABC123",
  "project": { "id": "...", "name": "..." },
  "code_rule": { "id": "...", "name": "..." },
  "product_info": { ... },
  "campaign_info": { ... }
}
```

> **Nota:** No incluye `redeemed_at` ni `redemption_id` porque no se registra el canje.

---

## 5. Consultar Canjes

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
      "redeemed_at": "2025-01-15T10:30:00.000Z"
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

## 6. Estadísticas

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
    { "date": "2025-01-15", "count": 1200 },
    { "date": "2025-01-14", "count": 980 }
  ]
}
```

---

## 7. Códigos de Error

| error_code | HTTP | Significado | Acción recomendada |
|------------|:----:|-------------|-------------------|
| `INVALID_STRUCTURE` | 400 | Longitud, charset o prefijo incorrectos | Verificar que el código escaneado es correcto |
| `INVALID_SEGMENT` | 400 | Un segmento no cumple su formato | El código puede estar dañado o mal leído |
| `INVALID_CHECK_DIGIT` | 400 | El dígito de control no coincide | Código inválido o falsificado |
| `NO_MATCHING_RULE` | 404 | No hay regla que coincida con el código | Verificar project_id o que el código pertenece a este proyecto |
| `ALREADY_REDEEMED` | 409 | El código ya fue canjeado | Informar al usuario que ya lo usó |
| `PROJECT_INACTIVE` | 403 | El proyecto está desactivado | Contactar administrador |
| `PROJECT_EXPIRED` | 403 | El proyecto está fuera de rango de fechas | La campaña ha terminado |
| `RULE_INACTIVE` | 403 | La regla está desactivada | Contactar administrador |
| `GEO_BLOCKED` | 403 | País no permitido para esta regla | El usuario está fuera de la zona geográfica |
| `RATE_LIMITED` | 429 | Demasiadas peticiones | Implementar backoff exponencial |
| `AUTH_FAILED` | 401 | API Key inválida o firma incorrecta | Verificar credenciales y generación de HMAC |

---

## 8. Rate Limiting

CodeGuard aplica dos niveles de rate limiting:

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

## 9. Modo Sandbox

CodeGuard soporta un **modo sandbox** para pruebas de integración sin afectar datos de producción.

### Cómo activar

Enviar el header `X-Sandbox: true` en las peticiones de validación:

```bash
curl -X POST http://codeguard.example.com/api/v1/validate \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $API_KEY" \
  -H "X-Timestamp: $TIMESTAMP" \
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

## 10. Geo-fencing

CodeGuard soporta restricción geográfica por regla de código. Si una regla tiene países permitidos configurados, solo se aceptarán canjes desde esos países.

### Uso

Incluir `country` en el body de validación:

```json
{
  "code": "ABC123",
  "project_id": "...",
  "country": "ES"
}
```

El campo `country` debe ser un código **ISO 3166-1 alpha-2** (2 letras mayúsculas). Ejemplos: `ES` (España), `MX` (México), `AR` (Argentina), `CO` (Colombia).

Si la regla tiene geo-fencing activo y el país no está en la lista permitida:

```json
{
  "status": "KO",
  "error_code": "GEO_BLOCKED",
  "error_message": "This code cannot be redeemed from your country"
}
```

Si no se envía `country` y la regla tiene geo-fencing, la validación se rechaza igualmente.

> **Nota:** Es responsabilidad de OmniWallet determinar el país del usuario (por IP, configuración de perfil, o GPS) y enviarlo en la petición.

---

## 11. Seguridad

### Almacenamiento de códigos

Los códigos se almacenan como **hash SHA-256**. El código original nunca se guarda en producción (a menos que `STORE_PLAIN_CODES=true` esté configurado para debugging).

### Anti-replay

El header `X-Timestamp` se rechaza si tiene más de 5 minutos de diferencia con el servidor. Esto previene ataques de replay con peticiones capturadas.

### Unicidad atómica

La fase 6 del pipeline usa:
1. **Redlock** — Bloqueo distribuido para evitar race conditions
2. **INSERT con UNIQUE constraint** — Constraint a nivel de base de datos `(code_rule_id, code_hash)` como garantía final

Esto garantiza que un código solo se puede canjear una vez, incluso con peticiones concurrentes.

### Recomendaciones para OmniWallet

1. **Nunca exponer** `api_secret` al frontend/app móvil
2. **Firmar peticiones** siempre desde el backend de OmniWallet
3. **Usar HTTPS** en producción
4. **Rotar credenciales** periódicamente desde el Admin Panel
5. **Monitorizar** el endpoint `/api/v1/stats` para detectar anomalías

---

## 12. Ejemplos por Lenguaje

### Node.js / TypeScript

```typescript
import crypto from 'crypto';

const API_KEY = 'cg_your_api_key';
const API_SECRET = 'your_api_secret';
const BASE_URL = 'https://codeguard.example.com';

async function validateCode(code: string, projectId: string, userId?: string) {
  const body = JSON.stringify({
    code,
    project_id: projectId,
    ow_user_id: userId,
  });

  const timestamp = new Date().toISOString();
  const signature = crypto
    .createHmac('sha256', API_SECRET)
    .update(body)
    .digest('hex');

  const response = await fetch(`${BASE_URL}/api/v1/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    },
    body,
  });

  return response.json();
}

// Uso
const result = await validateCode('ABC-1234-5678-3', 'project-uuid', 'user-123');
if (result.status === 'OK') {
  console.log(`Código válido! Puntos: ${result.product_info?.points}`);
} else {
  console.log(`Error: ${result.error_code} — ${result.error_message}`);
}
```

### Python

```python
import hashlib
import hmac
import json
import requests
from datetime import datetime, timezone

API_KEY = 'cg_your_api_key'
API_SECRET = 'your_api_secret'
BASE_URL = 'https://codeguard.example.com'

def validate_code(code: str, project_id: str, user_id: str = None):
    body = {
        'code': code,
        'project_id': project_id,
    }
    if user_id:
        body['ow_user_id'] = user_id

    body_str = json.dumps(body, separators=(',', ':'))
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    signature = hmac.new(
        API_SECRET.encode(),
        body_str.encode(),
        hashlib.sha256
    ).hexdigest()

    response = requests.post(
        f'{BASE_URL}/api/v1/validate',
        headers={
            'Content-Type': 'application/json',
            'X-Api-Key': API_KEY,
            'X-Timestamp': timestamp,
            'X-Signature': signature,
        },
        data=body_str,
    )

    return response.json()

# Uso
result = validate_code('ABC-1234-5678-3', 'project-uuid', 'user-123')
if result['status'] == 'OK':
    print(f"Código válido! redemption_id: {result['redemption_id']}")
else:
    print(f"Error: {result['error_code']}")
```

### PHP

```php
<?php
$apiKey = 'cg_your_api_key';
$apiSecret = 'your_api_secret';
$baseUrl = 'https://codeguard.example.com';

function validateCode(string $code, string $projectId, ?string $userId = null): array {
    global $apiKey, $apiSecret, $baseUrl;

    $body = json_encode(array_filter([
        'code' => $code,
        'project_id' => $projectId,
        'ow_user_id' => $userId,
    ]));

    $timestamp = gmdate('Y-m-d\TH:i:s\Z');
    $signature = hash_hmac('sha256', $body, $apiSecret);

    $ch = curl_init("$baseUrl/api/v1/validate");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            "X-Api-Key: $apiKey",
            "X-Timestamp: $timestamp",
            "X-Signature: $signature",
        ],
    ]);

    $response = curl_exec($ch);
    curl_close($ch);

    return json_decode($response, true);
}

// Uso
$result = validateCode('ABC-1234-5678-3', 'project-uuid', 'user-123');
if ($result['status'] === 'OK') {
    echo "Código válido! redemption_id: " . $result['redemption_id'];
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

public class CodeGuardClient {
    private static final String API_KEY = "cg_your_api_key";
    private static final String API_SECRET = "your_api_secret";
    private static final String BASE_URL = "https://codeguard.example.com";

    public static String validateCode(String code, String projectId, String userId)
            throws Exception {
        String body = String.format(
            "{\"code\":\"%s\",\"project_id\":\"%s\",\"ow_user_id\":\"%s\"}",
            code, projectId, userId
        );

        String timestamp = Instant.now().toString();

        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(API_SECRET.getBytes(), "HmacSHA256"));
        byte[] hash = mac.doFinal(body.getBytes());
        String signature = bytesToHex(hash);

        HttpRequest request = HttpRequest.newBuilder()
            .uri(java.net.URI.create(BASE_URL + "/api/v1/validate"))
            .header("Content-Type", "application/json")
            .header("X-Api-Key", API_KEY)
            .header("X-Timestamp", timestamp)
            .header("X-Signature", signature)
            .POST(HttpRequest.BodyPublishers.ofString(body))
            .build();

        HttpResponse<String> response = HttpClient.newHttpClient()
            .send(request, HttpResponse.BodyHandlers.ofString());

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

- [ ] Obtener `api_key` y `api_secret` del Admin Panel de CodeGuard
- [ ] Implementar generación de HMAC-SHA256 en el backend de OmniWallet
- [ ] Configurar el `project_id` correspondiente a cada campaña
- [ ] Integrar `POST /api/v1/validate` en el flujo de escaneo
- [ ] Manejar todos los `error_code` (ver tabla sección 7)
- [ ] Implementar retry con backoff para `RATE_LIMITED` (429)
- [ ] Probar en modo sandbox con header `X-Sandbox: true`
- [ ] Verificar con `GET /validate/check` antes de canjear (opcional)
- [ ] Configurar geo-fencing si hay restricción geográfica
- [ ] Monitorizar estadísticas vía `/api/v1/stats/:project_id`
- [ ] Planificar rotación de credenciales periódica
