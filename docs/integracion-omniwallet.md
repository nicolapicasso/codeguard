# Guía de Integración: OmniWallet ↔ OmniCodex

## Índice

1. [Visión General](#1-visión-general)
2. [Arquitectura de la Integración](#2-arquitectura-de-la-integración)
3. [Credenciales y Configuración](#3-credenciales-y-configuración)
4. [Autenticación HMAC-SHA256](#4-autenticación-hmac-sha256)
5. [Identificación de Usuario (ow_user_id) — IMPORTANTE](#5-identificación-de-usuario-ow_user_id--importante)
6. [Endpoint: Validar Código](#6-endpoint-validar-código)
7. [Respuestas y Códigos de Error](#7-respuestas-y-códigos-de-error)
8. [Otros Endpoints Disponibles](#8-otros-endpoints-disponibles)
9. [Modo Sandbox (Testing)](#9-modo-sandbox-testing)
10. [Ejemplos de Implementación](#10-ejemplos-de-implementación)
11. [Checklist de Integración](#11-checklist-de-integración)
12. [Preguntas Frecuentes](#12-preguntas-frecuentes)

---

## 1. Visión General

OmniCodex es el sistema de validación de códigos QR/alfanuméricos que verifica la
autenticidad de los códigos escaneados por los usuarios de OmniWallet.

**Flujo completo:**

```
┌──────────┐     ┌────────────────┐     ┌──────────────┐
│ App      │     │ Backend        │     │ OmniCodex    │
│ OmniWallet│────▶│ OmniWallet     │────▶│ API          │
│ (usuario)│     │ (vuestro)      │     │ (nuestro)    │
└──────────┘     └────────────────┘     └──────────────┘
  1. Escanea QR    2. Envía código     3. Valida y responde
                   4. Recibe OK/KO ◀──── OK → dar puntos
                   5. Muestra resultado   KO → mostrar error
```

OmniWallet actúa como intermediario: recibe el código del usuario y lo envía
al API de OmniCodex para validación. La app del usuario NUNCA habla directamente
con OmniCodex.

---

## 2. Arquitectura de la Integración

### Qué necesita hacer OmniWallet

El backend de OmniWallet necesita implementar **una sola función**: llamar al
endpoint de validación de OmniCodex cuando un usuario escanea un código.

```
POST https://<omnicodex-url>/api/v1/validate
```

### Qué NO necesita hacer OmniWallet

- No necesita generar códigos (eso lo hace OmniCodex o el fabricante)
- No necesita almacenar códigos
- No necesita implementar lógica de validación
- No necesita gestionar geo-fencing ni fraude

### Datos que OmniWallet debe enviar

| Dato | Obligatorio | De dónde sale |
|------|-------------|---------------|
| Código escaneado | Sí | Del QR que escanea el usuario |
| Project ID | Sí | Configurado por proyecto/campaña (se lo damos nosotros) |
| **User ID** | **Sí** | **ID interno del usuario en OmniWallet (ver [sección 5](#5-identificación-de-usuario-ow_user_id--importante))** |
| País | Opcional | Geolocalización del dispositivo del usuario |
| Transaction ID | Opcional | ID de transacción de OmniWallet para trazabilidad |

---

## 3. Credenciales y Configuración

### Datos que recibiréis de nuestro equipo

Para cada tenant (cliente) se os proporcionará:

| Dato | Ejemplo | Uso |
|------|---------|-----|
| **Base URL** | `https://omnicodex.com` | URL del servidor OmniCodex |
| **API Key** | `ock_a1b2c3d4e5f6...` | Identifica al tenant — va en el header `X-Api-Key` |
| **API Secret** | `ocs_x9y8z7w6v5u4...` | Clave para firmar peticiones — NUNCA se envía al servidor |
| **Project ID(s)** | `550e8400-e29b-41d4-...` | UUID del proyecto, va en el body de la petición |

### Dónde guardar las credenciales

Las credenciales deben almacenarse de forma segura en variables de entorno o
en un gestor de secretos. **Nunca** en código fuente ni en el frontend.

```env
# .env (ejemplo)
OMNICODEX_BASE_URL=https://omnicodex.com
OMNICODEX_API_KEY=ock_a1b2c3d4e5f6...
OMNICODEX_API_SECRET=ocs_x9y8z7w6v5u4...
OMNICODEX_PROJECT_ID=550e8400-e29b-41d4-a716-446655440000
```

---

## 4. Autenticación HMAC-SHA256

Cada petición al API debe estar firmada con HMAC-SHA256. Esto garantiza que:
- Solo quien conoce el API Secret puede hacer peticiones válidas
- Las peticiones no pueden ser modificadas en tránsito
- Las peticiones no pueden ser reenviadas (anti-replay)

### Headers requeridos

| Header | Obligatorio | Descripción |
|--------|-------------|-------------|
| `X-Api-Key` | Sí | La API Key del tenant |
| `X-Signature` | Sí | Firma HMAC-SHA256 en hexadecimal |
| `X-Timestamp` | Sí | Timestamp ISO 8601 (ej: `2026-03-22T15:30:45.123Z`) |
| `X-Nonce` | Recomendado | Valor único por petición (UUID o random hex) |
| `Content-Type` | Sí | `application/json` |

### Cómo calcular la firma

La firma se calcula sobre un string base compuesto por 5 partes separadas por `\n`:

```
{MÉTODO_HTTP}\n{PATH}\n{TIMESTAMP}\n{NONCE}\n{BODY_JSON}
```

**Ejemplo concreto:**

```
POST\n/api/v1/validate\n2026-03-22T15:30:45.123Z\nabc123def456\n{"code":"ABC-1234-XYZ","project_id":"550e8400-e29b-41d4-a716-446655440000","ow_user_id":"user-789"}
```

Luego se firma con HMAC-SHA256 usando el API Secret:

```
signature = HMAC-SHA256(api_secret, string_base)
```

El resultado se envía en formato hexadecimal en el header `X-Signature`.

### Ventana de tolerancia

- El timestamp debe estar dentro de **60 segundos** de la hora del servidor
- Aseguraos de que vuestro servidor tenga la hora sincronizada (NTP)
- Si el nonce se repite dentro de la ventana, la petición será rechazada

### Errores de autenticación

| Código HTTP | Mensaje | Causa |
|-------------|---------|-------|
| 401 | Missing API key | No se envió el header `X-Api-Key` |
| 401 | Invalid API key | API Key no reconocida o tenant inactivo |
| 401 | Missing request signature | No se envió `X-Signature` |
| 401 | Request timestamp is too old or invalid | Timestamp fuera de la ventana de 60s |
| 401 | Nonce already used (replay detected) | El nonce ya fue utilizado |
| 401 | Invalid HMAC signature | La firma no coincide |

---

## 5. Identificación de Usuario (ow_user_id) — IMPORTANTE

> **El campo `ow_user_id` es CRÍTICO para la seguridad del sistema.** Aunque
> técnicamente es opcional en el schema, su ausencia desactiva la mayoría de las
> protecciones anti-fraude. **Debe enviarse SIEMPRE.**

### ¿Qué es `ow_user_id`?

Es el identificador interno del usuario en OmniWallet (el ID de vuestra base
de datos). Se envía en el body de cada petición de validación.

```json
{
  "code": "ABC-1234-XYZ",
  "project_id": "550e8400-...",
  "ow_user_id": "user-789"
}
```

### ¿Por qué es tan importante?

Sin `ow_user_id`, OmniCodex no puede:

| Funcionalidad | Sin `ow_user_id` | Con `ow_user_id` |
|---------------|-------------------|-------------------|
| Rate limiting por usuario | Solo por IP (fácil de evadir) | 30 req/min por usuario real |
| Detección de fraude | No puede identificar usuarios sospechosos | Detecta patrones: alta tasa de fallos, múltiples IPs, múltiples países |
| Trazabilidad de canjes | Solo IP + timestamp | Usuario concreto + IP + timestamp |
| Códigos PROTECTED (nivel 3) | **BLOQUEADO** — la petición será rechazada | Funciona correctamente |
| Auditoría | Limitada | Completa: quién, cuándo, desde dónde |

### Rate Limiting por usuario

OmniCodex aplica un límite de **30 validaciones por minuto por usuario**.
La clave de rate limiting se compone de:

```
API Key + ow_user_id → máximo 30 req/min
```

Si no se envía `ow_user_id`, el rate limiting cae a nivel de IP, que es mucho
menos granular y fácil de evadir con VPNs o redes móviles.

### Detección de fraude

OmniCodex analiza el comportamiento de cada `ow_user_id` en una ventana de 7 días:

- **Tasa de fallos**: usuarios con muchos intentos fallidos son marcados como sospechosos
- **Códigos distintos**: un usuario probando muchos códigos distintos es sospechoso
- **Múltiples IPs**: un mismo usuario desde muchas IPs diferentes
- **Múltiples países**: un mismo usuario apareciendo desde distintos países

Todo esto requiere que el `ow_user_id` se envíe de forma **consistente** (siempre
el mismo ID para el mismo usuario).

### Códigos PROTECTED (nivel de seguridad 3)

Para códigos con nivel de seguridad PROTECTED (el más alto), el `ow_user_id` es
**obligatorio**. Si no se envía, la petición será rechazada con error:

```json
{
  "status": "KO",
  "error_code": "INVALID_CODE",
  "error_message": "PROTECTED level rule requires ow_user_id for anti-fraud traceability"
}
```

### Qué valor usar como `ow_user_id`

| Opción | Recomendación |
|--------|---------------|
| ID numérico de la BD (`12345`) | Válido |
| UUID (`550e8400-e29b-...`) | Válido |
| Email del usuario | **NO** — es dato personal, no debe enviarse |
| Teléfono del usuario | **NO** — es dato personal |
| Hash del ID (`sha256(userId)`) | Aceptable, pero pierde utilidad para soporte |

**Recomendación**: usar el ID interno de la base de datos de OmniWallet tal cual.
No contiene información personal y permite trazabilidad completa.

---

## 6. Endpoint: Validar Código

### Request

```
POST /api/v1/validate
```

**Body (JSON):**

```json
{
  "code": "ABC-1234-XYZ",
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "ow_user_id": "user-789",
  "ow_transaction_id": "txn-456",
  "country": "ES",
  "metadata": {
    "app_version": "3.2.1",
    "device": "iPhone"
  }
}
```

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `code` | string | **Sí** | El código escaneado por el usuario |
| `project_id` | string (UUID) | **Sí** | ID del proyecto en OmniCodex |
| `ow_user_id` | string | **Sí** (ver [sección 5](#5-identificación-de-usuario-ow_user_id--importante)) | ID del usuario en OmniWallet — activa rate limiting, detección de fraude y trazabilidad |
| `ow_transaction_id` | string | Opcional | ID de la transacción en OmniWallet |
| `country` | string (2 chars) | Opcional | País ISO alpha-2 del usuario (ej: `ES`, `MX`) |
| `metadata` | object | Opcional | Datos extra (versión de app, dispositivo, etc.) |

**Notas importantes:**
- El campo `code` es el texto completo que el usuario escanea o introduce
- OmniCodex se encarga de normalizar el código (quitar espacios, ajustar mayúsculas según la regla)
- El `ow_user_id` es **obligatorio en la práctica** — ver [sección 5](#5-identificación-de-usuario-ow_user_id--importante) para detalles
- El `country` se detecta automáticamente por la IP si no se envía, pero enviarlo mejora la precisión

### Response — Éxito (HTTP 200)

```json
{
  "status": "OK",
  "redemption_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "redeemed_at": "2026-03-22T15:30:45.123Z",
  "points_value": 100,
  "detected_country": "ES",
  "security_level": 2,
  "security_level_name": "AUTHENTICATED",
  "is_production_safe": true
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `status` | "OK" | Código válido |
| `redemption_id` | string | ID único de esta validación (guardar para referencia) |
| `redeemed_at` | string (ISO 8601) | Fecha/hora de la validación |
| `points_value` | number \| null | Puntos a asignar al usuario (si se configuró en la regla) |
| `detected_country` | string \| null | País detectado (ISO alpha-2) |
| `security_level` | number (0-3) | Nivel de seguridad de la regla |
| `security_level_name` | string | Nombre del nivel (OPEN, CONTROLLED, AUTHENTICATED, PROTECTED) |
| `is_production_safe` | boolean | Si la configuración es segura para producción |

**Qué hacer con la respuesta OK:**
1. Asignar `points_value` puntos al usuario (si no es null)
2. Guardar `redemption_id` como referencia
3. Mostrar mensaje de éxito al usuario

---

## 7. Respuestas y Códigos de Error

### Response — Error (HTTP 400/403/409)

```json
{
  "status": "KO",
  "error_code": "ALREADY_REDEEMED",
  "error_message": "Code has already been redeemed"
}
```

### Tabla completa de errores

| error_code | HTTP | Significado | Qué mostrar al usuario |
|------------|------|-------------|------------------------|
| `NO_MATCHING_RULE` | 400 | Código no reconocido | "Código no válido" |
| `INVALID_CODE` | 400 | Estructura incorrecta | "Código no válido" |
| `INVALID_CHECK_DIGIT` | 400 | Dígito de control incorrecto (posible falsificación) | "Código no válido" |
| `ALREADY_REDEEMED` | 409 | Ya fue canjeado antes | "Este código ya fue utilizado" |
| `PROJECT_INACTIVE` | 403 | Proyecto desactivado | "Campaña no disponible" |
| `PROJECT_EXPIRED` | 403 | Fuera de fechas del proyecto | "Campaña finalizada" |
| `RULE_INACTIVE` | 403 | Regla desactivada | "Campaña no disponible" |
| `GEO_BLOCKED` | 403 | País no permitido | "No disponible en tu ubicación" |
| `TENANT_MISMATCH` | 403 | Project ID no pertenece a este tenant | Error de configuración (contactar soporte) |

### Recomendación de manejo de errores

```
Si status == "OK":
    → Dar puntos, mostrar éxito

Si status == "KO":
    Si error_code == "ALREADY_REDEEMED":
        → "Este código ya ha sido utilizado"
    Si error_code en ["PROJECT_INACTIVE", "PROJECT_EXPIRED", "RULE_INACTIVE"]:
        → "Esta campaña ya no está activa"
    Si error_code == "GEO_BLOCKED":
        → "Esta campaña no está disponible en tu ubicación"
    En cualquier otro caso:
        → "Código no válido. Verifica e inténtalo de nuevo"
```

---

## 8. Otros Endpoints Disponibles

Estos endpoints son opcionales. El único necesario para la validación es
`POST /api/v1/validate`.

### Listar canjes (paginado)

```
GET /api/v1/codes?project_id={id}&from={ISO_date}&to={ISO_date}&page=1&limit=20
```

Útil para mostrar el historial de códigos canjeados por el usuario.

### Detalle de un canje

```
GET /api/v1/codes/{redemption_id}
```

### Estadísticas del proyecto

```
GET /api/v1/stats/{project_id}
```

Devuelve: total de canjes, usuarios únicos, canjes por día (30d), canjes por regla.

### Lotes (solo para modo MANAGED)

```
POST /api/v1/batches         → Solicitar generación de lote
GET  /api/v1/batches/{id}    → Ver estado del lote
GET  /api/v1/batches/{id}/download → Descargar códigos
GET  /api/v1/batches         → Listar lotes
```

> Todos estos endpoints requieren la misma autenticación HMAC-SHA256.

---

## 9. Modo Sandbox (Testing)

Para probar la integración sin consumir canjes reales, añadir el header:

```
X-Sandbox: true
```

En modo sandbox:
- Se ejecutan todas las validaciones (estructura, checksum, HMAC, geo-fencing)
- **NO** se registra el canje en la base de datos
- La respuesta incluye `"sandbox": true`
- Se puede usar el mismo código múltiples veces

**Flujo de testing recomendado:**

1. Primero probar con `X-Sandbox: true` hasta que la integración funcione
2. Luego probar con un código real en modo normal (sin el header)
3. Verificar en el backoffice de OmniCodex que el canje aparece registrado

---

## 10. Ejemplos de Implementación

### PHP (con cURL)

```php
<?php

function validateCode(string $code, string $projectId, ?string $userId = null): array
{
    $baseUrl   = getenv('OMNICODEX_BASE_URL');
    $apiKey    = getenv('OMNICODEX_API_KEY');
    $apiSecret = getenv('OMNICODEX_API_SECRET');

    $path      = '/api/v1/validate';
    $method    = 'POST';
    $timestamp = gmdate('Y-m-d\TH:i:s.v\Z'); // ISO 8601
    $nonce     = bin2hex(random_bytes(16));

    // Build request body
    $bodyArray = [
        'code'       => $code,
        'project_id' => $projectId,
    ];
    if ($userId) {
        $bodyArray['ow_user_id'] = $userId;
    }
    $bodyJson = json_encode($bodyArray);

    // Calculate HMAC signature
    $signatureBase = implode("\n", [$method, $path, $timestamp, $nonce, $bodyJson]);
    $signature     = hash_hmac('sha256', $signatureBase, $apiSecret);

    // Make request
    $ch = curl_init($baseUrl . $path);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $bodyJson,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            "X-Api-Key: {$apiKey}",
            "X-Timestamp: {$timestamp}",
            "X-Nonce: {$nonce}",
            "X-Signature: {$signature}",
        ],
    ]);

    $response   = curl_exec($ch);
    $httpCode   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $result = json_decode($response, true);

    if ($result['status'] === 'OK') {
        return [
            'valid'         => true,
            'redemption_id' => $result['redemption_id'],
            'points'        => $result['points_value'] ?? 0,
        ];
    }

    return [
        'valid'   => false,
        'error'   => $result['error_code'] ?? 'UNKNOWN_ERROR',
        'message' => $result['error_message'] ?? 'Error desconocido',
    ];
}

// Uso:
$result = validateCode('ABC-1234-XYZ', $projectId, $currentUser->id);
if ($result['valid']) {
    $currentUser->addPoints($result['points']);
    return response()->json(['message' => '¡Código válido! +' . $result['points'] . ' puntos']);
} else {
    return response()->json(['message' => 'Código no válido'], 400);
}
```

### PHP / Laravel (con Http facade)

```php
<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Http\Client\Response;

class OmniCodexService
{
    private string $baseUrl;
    private string $apiKey;
    private string $apiSecret;

    public function __construct()
    {
        $this->baseUrl   = config('services.omnicodex.base_url');
        $this->apiKey    = config('services.omnicodex.api_key');
        $this->apiSecret = config('services.omnicodex.api_secret');
    }

    public function validate(
        string  $code,
        string  $projectId,
        ?string $userId = null,
        ?string $country = null,
    ): array {
        $path = '/api/v1/validate';

        $body = array_filter([
            'code'       => $code,
            'project_id' => $projectId,
            'ow_user_id' => $userId,
            'country'    => $country,
        ]);

        $response = $this->signedRequest('POST', $path, $body);

        return $response->json();
    }

    private function signedRequest(string $method, string $path, array $body): Response
    {
        $timestamp = gmdate('Y-m-d\TH:i:s.v\Z');
        $nonce     = bin2hex(random_bytes(16));
        $bodyJson  = json_encode($body);

        $signatureBase = implode("\n", [$method, $path, $timestamp, $nonce, $bodyJson]);
        $signature     = hash_hmac('sha256', $signatureBase, $this->apiSecret);

        return Http::withHeaders([
            'X-Api-Key'    => $this->apiKey,
            'X-Timestamp'  => $timestamp,
            'X-Nonce'      => $nonce,
            'X-Signature'  => $signature,
        ])->timeout(10)->post($this->baseUrl . $path, $body);
    }
}
```

```php
// config/services.php
'omnicodex' => [
    'base_url'   => env('OMNICODEX_BASE_URL'),
    'api_key'    => env('OMNICODEX_API_KEY'),
    'api_secret' => env('OMNICODEX_API_SECRET'),
],
```

### Python

```python
import hmac
import hashlib
import json
import os
import secrets
from datetime import datetime, timezone
import requests

def validate_code(code: str, project_id: str, user_id: str = None) -> dict:
    base_url   = os.environ['OMNICODEX_BASE_URL']
    api_key    = os.environ['OMNICODEX_API_KEY']
    api_secret = os.environ['OMNICODEX_API_SECRET']

    path      = '/api/v1/validate'
    method    = 'POST'
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    nonce     = secrets.token_hex(16)

    body = {'code': code, 'project_id': project_id}
    if user_id:
        body['ow_user_id'] = user_id
    body_json = json.dumps(body, separators=(',', ':'))

    signature_base = f"{method}\n{path}\n{timestamp}\n{nonce}\n{body_json}"
    signature = hmac.new(
        api_secret.encode(), signature_base.encode(), hashlib.sha256
    ).hexdigest()

    response = requests.post(
        f"{base_url}{path}",
        json=body,
        headers={
            'X-Api-Key':   api_key,
            'X-Timestamp': timestamp,
            'X-Nonce':     nonce,
            'X-Signature': signature,
        },
        timeout=10,
    )

    return response.json()
```

### Node.js / TypeScript

```typescript
import crypto from 'crypto';

async function validateCode(code: string, projectId: string, userId?: string) {
  const baseUrl   = process.env.OMNICODEX_BASE_URL!;
  const apiKey    = process.env.OMNICODEX_API_KEY!;
  const apiSecret = process.env.OMNICODEX_API_SECRET!;

  const path      = '/api/v1/validate';
  const method    = 'POST';
  const timestamp = new Date().toISOString();
  const nonce     = crypto.randomUUID();

  const body: Record<string, unknown> = { code, project_id: projectId };
  if (userId) body.ow_user_id = userId;
  const bodyJson = JSON.stringify(body);

  const signatureBase = [method, path, timestamp, nonce, bodyJson].join('\n');
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(signatureBase)
    .digest('hex');

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key':    apiKey,
      'X-Timestamp':  timestamp,
      'X-Nonce':      nonce,
      'X-Signature':  signature,
    },
    body: bodyJson,
  });

  return res.json();
}
```

---

## 11. Checklist de Integración

### Preparación

- [ ] Recibir credenciales del equipo OmniCodex (API Key, API Secret, Base URL)
- [ ] Recibir el/los Project ID(s) de las campañas activas
- [ ] Almacenar credenciales en variables de entorno (NO en código fuente)
- [ ] Asegurar que el servidor tiene hora sincronizada (NTP)

### Implementación

- [ ] Implementar la función de firma HMAC-SHA256
- [ ] Implementar la llamada a `POST /api/v1/validate`
- [ ] **Enviar SIEMPRE `ow_user_id`** con el ID interno del usuario (ver [sección 5](#5-identificación-de-usuario-ow_user_id--importante))
- [ ] Verificar que el `ow_user_id` es consistente (mismo usuario = mismo ID siempre)
- [ ] No enviar datos personales (email, teléfono) como `ow_user_id`
- [ ] Manejar todos los códigos de error (ver tabla en sección 7)
- [ ] Implementar mensajes de error apropiados para el usuario final

### Testing

- [ ] Probar con `X-Sandbox: true` primero
- [ ] Verificar que la firma HMAC funciona correctamente
- [ ] Verificar que un código válido devuelve OK
- [ ] Verificar que un código repetido devuelve `ALREADY_REDEEMED`
- [ ] Verificar que un código inválido devuelve `NO_MATCHING_RULE`
- [ ] Probar sin el header sandbox y verificar en el backoffice que el canje se registra

### Producción

- [ ] Configurar timeout de 10 segundos en las peticiones
- [ ] Implementar reintentos con backoff exponencial para errores de red (5xx)
- [ ] NO reintentar errores 4xx (son definitivos)
- [ ] Monitorizar errores 401 (pueden indicar que las claves han sido rotadas)
- [ ] Notificar al equipo OmniCodex si se detectan errores 500 recurrentes

---

## 12. Preguntas Frecuentes

### ¿Puedo validar un código más de una vez?
Depende de la configuración de la regla. Por defecto, cada código solo puede
canjearse 1 vez. Si se intenta canjear de nuevo, se recibe `ALREADY_REDEEMED`.
Algunas reglas permiten múltiples canjes (configurable por nuestro equipo).

### ¿Qué pasa si mi servidor tiene la hora desincronizada?
Las peticiones serán rechazadas con "Request timestamp is too old or invalid".
La tolerancia es de 60 segundos. Aseguraos de usar NTP.

### ¿Puedo validar códigos de diferentes proyectos con las mismas credenciales?
Sí, siempre que los proyectos pertenezcan al mismo tenant. Solo cambia el
`project_id` en el body.

### ¿Qué hago si necesito nuevas credenciales?
Contactar al equipo OmniCodex. Se generarán nuevas credenciales y las
anteriores dejarán de funcionar inmediatamente.

### ¿Es seguro almacenar el `redemption_id`?
Sí. Es recomendable guardarlo como referencia para posibles reclamaciones
o auditorías. No contiene información sensible.

### ¿Qué pasa si OmniCodex está caído?
Si la petición falla por timeout o error de red (5xx), se recomienda
reintentar con backoff exponencial (1s, 2s, 4s). Si el problema persiste,
mostrar un mensaje genérico al usuario y registrar el intento para
procesarlo posteriormente.

### ¿El campo `country` es necesario?
No es obligatorio. OmniCodex detecta automáticamente el país a partir de
la IP del servidor de OmniWallet. Sin embargo, si queréis mayor precisión
(por ejemplo, usando la geolocalización del dispositivo del usuario),
podéis enviarlo en el body.

### ¿Puedo enviar datos adicionales?
Sí, usa el campo `metadata` para enviar cualquier dato extra (versión de app,
modelo de dispositivo, etc.). Estos datos se almacenan y pueden consultarse
en el backoffice.

---

## Contacto

Para dudas sobre la integración, contactar al equipo OmniCodex:
- [Añadir email/canal de contacto]

Para solicitar credenciales o configurar nuevos proyectos:
- [Añadir proceso/contacto]
