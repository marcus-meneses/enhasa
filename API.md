# Enhasa HTTP API

This document describes every HTTP route exposed by Enhasa, including request data, required headers, response shapes, and example requests.

## Conventions

Examples use these shell variables:

```bash
export ENHASA_URL="https://auth.example.com"
export ACCESS_TOKEN="<access-token>"
export REFRESH_TOKEN="<refresh-token>"
export BOOT_TOKEN="<validation-data-token>"
```

Unless stated otherwise:

- Request and response bodies use `application/json`.
- Authenticated routes use `Authorization: Bearer <access-token>`.
- Trusted internal routes use `x-enhasa-boot-token`.
- UUID route parameters must be valid UUID strings.
- Successful DELETE-style operations generally return HTTP 204 with no body.
- Unknown routes return HTTP 404 with `{ "message": "Route not found" }`.
- Validation errors are returned by the shared request-validation middleware.

## Error Responses

Common error responses use:

```json
{
  "message": "Error description"
}
```

Validation failures use HTTP 400 and include issue details:

```json
{
  "message": "Invalid request",
  "issues": [
    {
      "path": "fieldName",
      "message": "Validation message"
    }
  ]
}
```

Common status codes:

| Status | Meaning |
| --- | --- |
| `200` | Request completed successfully. |
| `201` | Resource or credentials registered successfully. |
| `204` | Request completed successfully with no response body. |
| `400` | Invalid input or unauthorized app identifier. |
| `401` | Missing, invalid, or expired authentication material. |
| `403` | Authenticated identity lacks the required SUP clearance. |
| `404` | Resource or route not found. |
| `500` | Unexpected internal error. |
| `503` | Required in-memory real-time credentials are unavailable. |

## Health

### `GET /health`

Checks PostgreSQL connectivity with `SELECT 1`.

**Authentication:** none.

**Request data:** none.

**Example:**

```bash
curl --fail-with-body \
  "$ENHASA_URL/health"
```

**Response: `200 OK`**

```json
{
  "status": "ok",
  "service": "enhasa",
  "database": "ok"
}
```

Database exceptions are handled as HTTP 500 errors.

## Authentication

### `GET /auth/validation-data`

Returns the public contract required to validate Enhasa access tokens locally.

**Authentication:** trusted boot token.

**Required headers:**

```http
x-enhasa-boot-token: <VALIDATION_DATA_TOKEN>
```

**Example:**

```bash
curl --fail-with-body \
  -H "x-enhasa-boot-token: $BOOT_TOKEN" \
  "$ENHASA_URL/auth/validation-data"
```

**Response: `200 OK`**

```json
{
  "algorithm": "RS256",
  "audience": "zeal",
  "issuer": "enhasa",
  "publicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"
}
```

`audience` and `issuer` reflect runtime configuration.

**Errors:**

- `401 Invalid validation data token`

### `POST /auth/login`

Authenticates a user and creates one renewable session for the resolved user/app combination. Existing refresh sessions for that same user/app are deleted.

**Authentication:** none.

**Body:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `login` | string | Conditional | Required when `email` is absent. |
| `email` | email string | Conditional | Required when `login` is absent. |
| `password` | string | Yes | Plaintext credential submitted for verification. |
| `app` | string | No | Authorized application identifier. Defaults to configured JWT audience. |

`app` accepts 1 to 64 letters, digits, underscores, or hyphens and must appear in `AUTHORIZED_APPS`.

**Example using login:**

```bash
curl --fail-with-body \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "login": "operator",
    "password": "replace-with-password",
    "app": "kahu"
  }' \
  "$ENHASA_URL/auth/login"
```

**Example using email:**

```bash
curl --fail-with-body \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "email": "operator@example.com",
    "password": "replace-with-password",
    "app": "kajar"
  }' \
  "$ENHASA_URL/auth/login"
```

**Response: `200 OK`**

```json
{
  "accessToken": "<signed-jwt>",
  "refreshToken": "<opaque-refresh-token>",
  "refreshTokenExpiresAt": "2026-11-02T12:00:00.000Z",
  "tokenType": "Bearer",
  "expiresIn": "1h",
  "app": "kahu"
}
```

**Errors:**

- `400 Unauthorized app`
- `400 Missing required fields`
- `400 Invalid request`
- `401 Invalid credentials`

Users are also rejected as invalid credentials when their user, customer, or employee is inactive/deleted, their employee cannot log in, or their employee type is unknown.

### `GET /auth/me`

Validates an access token and returns its effective identity.

**Authentication:** bearer access token.

**Example:**

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$ENHASA_URL/auth/me"
```

**Response for a regular token: `200 OK`**

```json
{
  "user": {
    "id": "10000000-0000-4000-8000-000000000001",
    "customerId": "20000000-0000-4000-8000-000000000001",
    "login": "operator",
    "email": "operator@example.com",
    "clearance": "REC",
    "clearanceLevel": "AAA"
  }
}
```

For an impersonation token, `user.actor` contains the original SUP identity.

**Errors:**

- `401 Missing or invalid authorization header`
- `401 Invalid or expired token`

### `POST /auth/impersonate`

Issues an access token whose effective identity is the selected target user. The authenticated SUP identity is retained in the JWT `actor` claim. No refresh token is issued.

**Authentication:** bearer access token with `clearance: SUP`.

**Body:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `userId` | UUID | Yes | Active target user ID. |

**Example:**

```bash
curl --fail-with-body \
  -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "10000000-0000-4000-8000-000000000002"
  }' \
  "$ENHASA_URL/auth/impersonate"
```

**Response: `200 OK`**

```json
{
  "accessToken": "<impersonation-jwt>",
  "tokenType": "Bearer",
  "expiresIn": "1h",
  "impersonatedUser": {
    "id": "10000000-0000-4000-8000-000000000002",
    "customerId": "20000000-0000-4000-8000-000000000002",
    "login": "target-user",
    "email": "target@example.com",
    "clearance": "REC",
    "clearanceLevel": "AAA"
  },
  "actorUser": {
    "id": "10000000-0000-4000-8000-000000000001",
    "customerId": "20000000-0000-4000-8000-000000000001",
    "login": "admin",
    "email": "admin@example.com",
    "clearance": "SUP",
    "clearanceLevel": "0"
  }
}
```

**Errors:**

- `401 Missing authenticated user`
- `401 Invalid or expired token`
- `403 Only SUP users can impersonate`
- `404 User not found`

### `POST /auth/refresh`

Consumes a valid refresh token, creates a replacement refresh token, and issues a new access token. The submitted refresh token cannot be reused.

**Authentication:** opaque refresh token in the request body.

**Body:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `refreshToken` | string | Yes | Current opaque refresh token. |
| `app` | string | No | Must match the session app. Defaults to JWT audience. |

**Example:**

```bash
curl --fail-with-body \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\",\"app\":\"kahu\"}" \
  "$ENHASA_URL/auth/refresh"
```

**Response: `200 OK`**

The response has the same shape as a successful login and contains a new access token and a new refresh token.

```json
{
  "accessToken": "<new-signed-jwt>",
  "refreshToken": "<new-opaque-refresh-token>",
  "refreshTokenExpiresAt": "2026-11-02T12:00:00.000Z",
  "tokenType": "Bearer",
  "expiresIn": "1h",
  "app": "kahu"
}
```

**Errors:**

- `400 Unauthorized app`
- `401 Invalid or expired refresh token`
- `401 User no longer exists`

### `POST /auth/logout`

Deletes the supplied refresh session. It does not revoke an already issued stateless access token.

**Authentication:** opaque refresh token in the request body.

**Body:**

| Field | Type | Required |
| --- | --- | --- |
| `refreshToken` | string | Yes |
| `app` | string | No |

**Example:**

```bash
curl --fail-with-body \
  -X POST \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\",\"app\":\"kahu\"}" \
  "$ENHASA_URL/auth/logout"
```

**Response: `204 No Content`**

Logout remains idempotent from the caller's perspective: a missing matching row still returns 204.

**Errors:**

- `400 Unauthorized app`
- `400 Invalid request`

## Refresh-Token Administration

Every route in this section requires a bearer access token with `clearance: SUP`.

### `GET /api/auth-tokens`

Returns refresh-session metadata without exposing raw tokens or full token hashes.

**Query parameters:**

| Parameter | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `limit` | integer 1-500 | No | `100` | Page size. |
| `offset` | non-negative integer | No | `0` | Number of rows to skip. |
| `search` | string | No | none | Matches token/user IDs, numeric ID, app, login, email, or name. |
| `status` | enum | No | `all` | `all`, `active`, `expired`, or `revoked`. |

**Example:**

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$ENHASA_URL/api/auth-tokens?limit=100&offset=0&status=active&search=operator"
```

**Response: `200 OK`**

```json
{
  "data": [
    {
      "id": "30000000-0000-4000-8000-000000000001",
      "numericId": "42",
      "tokenHashPreview": "df8a20bb27e1...",
      "userId": "10000000-0000-4000-8000-000000000001",
      "app": "kahu",
      "createdAt": "2026-10-03T12:00:00.000Z",
      "expiresAt": "2026-11-02T12:00:00.000Z",
      "revokedAt": null,
      "userLogin": "operator",
      "userEmail": "operator@example.com",
      "userName": "Example Operator",
      "userCustomerId": "20000000-0000-4000-8000-000000000001",
      "userStatus": "active"
    }
  ],
  "count": 1
}
```

### `GET /api/auth-tokens/summary`

Returns aggregate refresh-session counts.

**Example:**

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$ENHASA_URL/api/auth-tokens/summary"
```

**Response: `200 OK`**

```json
{
  "data": {
    "total": 12,
    "active": 8,
    "expired": 4,
    "revoked": 0
  }
}
```

The current implementation deletes tokens on logout and administrative revocation, so revoked rows are normally absent unless older data still uses `revokedAt`.

### `POST /api/auth-tokens/:id/revoke`

Deletes one refresh-token row by UUID.

**Path parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| `id` | UUID | Refresh-token record ID. |

**Example:**

```bash
curl --fail-with-body \
  -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$ENHASA_URL/api/auth-tokens/30000000-0000-4000-8000-000000000001/revoke"
```

**Response: `204 No Content`**

**Errors:**

- `404 Token not found`

## Permission Administration

Every route in this section requires a bearer access token with `clearance: SUP`.

Permission objects have this shape:

```json
{
  "id": "40000000-0000-4000-8000-000000000001",
  "numericId": "100",
  "audience": "ZEAL",
  "method": "GET",
  "path": "/api/animals",
  "operation": "animals.list",
  "allowedEmployeeTypes": ["SUP", "REC", "VET"],
  "permission": "List animals",
  "section": "Animals",
  "active": true,
  "createdAt": "2026-10-03T12:00:00.000Z",
  "updatedAt": "2026-10-03T12:00:00.000Z"
}
```

Allowed audiences are `ZEAL` and `KAHU`. Allowed methods are `GET`, `POST`, `PATCH`, `PUT`, and `DELETE`. Operations must match `module.action`.

Allowed employee types are:

```text
SUP GES GFI REC VET AVE GBT OTB GHO OPH OPM OUT
```

### `GET /api/permissions`

Lists route-permission records.

**Query parameters:**

| Parameter | Type | Required | Default |
| --- | --- | --- | --- |
| `limit` | integer 1-10000 | No | `500` |
| `offset` | non-negative integer | No | `0` |
| `audience` | `ZEAL` or `KAHU` | No | all |

**Example:**

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$ENHASA_URL/api/permissions?audience=ZEAL&limit=500&offset=0"
```

**Response: `200 OK`**

```json
{
  "data": [
    {
      "id": "40000000-0000-4000-8000-000000000001",
      "numericId": "100",
      "audience": "ZEAL",
      "method": "GET",
      "path": "/api/animals",
      "operation": "animals.list",
      "allowedEmployeeTypes": ["SUP", "REC", "VET"],
      "permission": "List animals",
      "section": "Animals",
      "active": true,
      "createdAt": "2026-10-03T12:00:00.000Z",
      "updatedAt": "2026-10-03T12:00:00.000Z"
    }
  ],
  "count": 319
}
```

`count` currently represents all permission rows, even when an audience filter is supplied.

### `GET /api/permissions/:id`

Returns one route-permission record.

**Example:**

```bash
curl --fail-with-body \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$ENHASA_URL/api/permissions/40000000-0000-4000-8000-000000000001"
```

**Response: `200 OK`**

```json
{
  "data": {
    "id": "40000000-0000-4000-8000-000000000001",
    "numericId": "100",
    "audience": "ZEAL",
    "method": "GET",
    "path": "/api/animals",
    "operation": "animals.list",
    "allowedEmployeeTypes": ["SUP", "REC", "VET"],
    "permission": "List animals",
    "section": "Animals",
    "active": true,
    "createdAt": "2026-10-03T12:00:00.000Z",
    "updatedAt": "2026-10-03T12:00:00.000Z"
  }
}
```

**Errors:**

- `404 Route permission not found`

### `POST /api/permissions`

Creates a route-permission record.

**Body:**

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `audience` | `ZEAL` or `KAHU` | Yes | - |
| `method` | supported HTTP method | Yes | - |
| `path` | non-empty string | Yes | - |
| `operation` | `module.action` string | Yes | - |
| `allowedEmployeeTypes` | employee-type array | No | `[]` |
| `permission` | non-empty string | No | generated fallback |
| `section` | non-empty string | No | `Unassigned` |
| `active` | boolean | No | `true` |

**Example:**

```bash
curl --fail-with-body \
  -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "audience": "ZEAL",
    "method": "POST",
    "path": "/api/animals",
    "operation": "animals.create",
    "allowedEmployeeTypes": ["SUP", "REC"],
    "permission": "Create animals",
    "section": "Animals",
    "active": true
  }' \
  "$ENHASA_URL/api/permissions"
```

**Response: `201 Created`**

```json
{
  "data": {
    "id": "40000000-0000-4000-8000-000000000002",
    "numericId": "101",
    "audience": "ZEAL",
    "method": "POST",
    "path": "/api/animals",
    "operation": "animals.create",
    "allowedEmployeeTypes": ["SUP", "REC"],
    "permission": "Create animals",
    "section": "Animals",
    "active": true,
    "createdAt": "2026-10-03T12:00:00.000Z",
    "updatedAt": "2026-10-03T12:00:00.000Z"
  }
}
```

### `PATCH /api/permissions/:id`

Updates one or more mutable fields. At least one field is required. Omitted fields retain their current values.

**Example:**

```bash
curl --fail-with-body \
  -X PATCH \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "allowedEmployeeTypes": ["SUP", "REC", "VET"],
    "active": true
  }' \
  "$ENHASA_URL/api/permissions/40000000-0000-4000-8000-000000000002"
```

**Response: `200 OK`**

```json
{
  "data": {
    "id": "40000000-0000-4000-8000-000000000002",
    "audience": "ZEAL",
    "method": "POST",
    "path": "/api/animals",
    "operation": "animals.create",
    "allowedEmployeeTypes": ["SUP", "REC", "VET"],
    "permission": "Create animals",
    "section": "Animals",
    "active": true
  }
}
```

The actual response also includes `numericId`, `createdAt`, and `updatedAt`.

**Errors:**

- `400 Invalid request` when no fields are supplied.
- `404 Route permission not found`

### `DELETE /api/permissions/:id`

Deletes one route-permission record.

**Example:**

```bash
curl --fail-with-body \
  -X DELETE \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$ENHASA_URL/api/permissions/40000000-0000-4000-8000-000000000002"
```

**Response: `204 No Content`**

**Errors:**

- `404 Route permission not found`

## Trusted Permission Snapshot

These routes use `x-enhasa-boot-token` and do not require a bearer token.

### `GET /internal/permissions`

Returns the complete permission snapshot used by enforcement consumers.

**Example:**

```bash
curl --fail-with-body \
  -H "x-enhasa-boot-token: $BOOT_TOKEN" \
  "$ENHASA_URL/internal/permissions"
```

**Response: `200 OK`**

```json
{
  "data": [
    {
      "id": "40000000-0000-4000-8000-000000000001",
      "numericId": "100",
      "audience": "ZEAL",
      "method": "GET",
      "path": "/api/animals",
      "operation": "animals.list",
      "allowedEmployeeTypes": ["SUP", "REC", "VET"],
      "permission": "List animals",
      "section": "Animals",
      "active": true,
      "createdAt": "2026-10-03T12:00:00.000Z",
      "updatedAt": "2026-10-03T12:00:00.000Z"
    }
  ],
  "count": 319,
  "revision": 12,
  "loadedAt": "2026-10-03T12:00:00.000Z"
}
```

The snapshot limit is 10,000 records.

**Errors:**

- `401 Invalid validation data token`

### `GET /internal/permissions/revision`

Returns only the current permission revision.

**Example:**

```bash
curl --fail-with-body \
  -H "x-enhasa-boot-token: $BOOT_TOKEN" \
  "$ENHASA_URL/internal/permissions/revision"
```

**Response: `200 OK`**

```json
{
  "data": {
    "revision": 12
  }
}
```

## Trusted Real-Time Interface

All routes in this section require:

```http
x-enhasa-boot-token: <VALIDATION_DATA_TOKEN>
x-enhasa-service: <expected-service>
```

The service header is checked together with a timing-safe boot-token comparison.

### `POST /internal/toma/credentials`

Registers process credentials in Enhasa memory. Existing credentials are replaced and a new version UUID is generated.

**Expected service:** `toma`.

**Body:**

| Field | Type | Required | Constraint |
| --- | --- | --- | --- |
| `masterToken` | string | Yes | 43-256 characters. |
| `clientToken` | string | Yes | 43-256 characters. |

**Example:**

```bash
curl --fail-with-body \
  -X POST \
  -H "x-enhasa-boot-token: $BOOT_TOKEN" \
  -H "x-enhasa-service: toma" \
  -H "Content-Type: application/json" \
  -d '{
    "masterToken": "<at-least-43-character-master-token>",
    "clientToken": "<at-least-43-character-client-token>"
  }' \
  "$ENHASA_URL/internal/toma/credentials"
```

**Response: `201 Created`**

```json
{
  "version": "50000000-0000-4000-8000-000000000001",
  "registeredAt": "2026-10-03T12:00:00.000Z"
}
```

The response does not echo either credential.

**Errors:**

- `400 Invalid credentials payload`
- `401 Unauthorized service`

### `GET /internal/toma/credentials`

Returns the credentials currently held in memory.

**Expected service:** `zeal`.

**Example:**

```bash
curl --fail-with-body \
  -H "x-enhasa-boot-token: $BOOT_TOKEN" \
  -H "x-enhasa-service: zeal" \
  "$ENHASA_URL/internal/toma/credentials"
```

**Response: `200 OK`**

```json
{
  "masterToken": "<registered-master-token>",
  "clientToken": "<registered-client-token>",
  "version": "50000000-0000-4000-8000-000000000001",
  "registeredAt": "2026-10-03T12:00:00.000Z"
}
```

**Errors:**

- `401 Unauthorized service`
- `503 Toma credentials unavailable`

### `POST /internal/toma/socket-ticket`

Creates a 30-second RS256 JWT for opening a real-time socket as the bearer-token user.

**Expected service:** `zeal`.

**Additional authentication:** bearer access token.

**Required headers:**

```http
x-enhasa-boot-token: <VALIDATION_DATA_TOKEN>
x-enhasa-service: zeal
Authorization: Bearer <access-token>
```

**Request body:** none.

**Example:**

```bash
curl --fail-with-body \
  -X POST \
  -H "x-enhasa-boot-token: $BOOT_TOKEN" \
  -H "x-enhasa-service: zeal" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$ENHASA_URL/internal/toma/socket-ticket"
```

**Response: `200 OK`**

```json
{
  "ticket": "<short-lived-socket-jwt>",
  "expiresInSeconds": 30
}
```

The ticket is issued for audience `toma` and includes:

```json
{
  "operatorId": "10000000-0000-4000-8000-000000000001",
  "tenantId": "20000000-0000-4000-8000-000000000001",
  "credentialVersion": "50000000-0000-4000-8000-000000000001",
  "clientCredentialHash": "<base64url-sha256>",
  "nonce": "60000000-0000-4000-8000-000000000001",
  "typ": "toma-socket",
  "sessionExpiresAt": 1791028800000
}
```

Standard JWT claims include issuer, audience, `iat`, `exp`, and `jti`.

**Errors:**

- `401 Unauthorized service`
- `401 Missing or invalid authorization header`
- `401 Invalid or expired token`
- `503 Toma unavailable`

## CORS Preflight

The global middleware responds to every `OPTIONS` request with HTTP 204. When the request origin is allowed, responses include:

```http
Access-Control-Allow-Origin: <request-origin>
Vary: Origin
Access-Control-Allow-Credentials: false
Access-Control-Allow-Methods: GET,POST,PATCH,PUT,DELETE,OPTIONS
Access-Control-Allow-Headers: authorization, content-type, accept, x-enhasa-boot-token
```

Internal service calls should not depend on browser CORS behavior.
