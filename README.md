# Enhasa

Enhasa is an HTTP authentication and authorization service. It validates user credentials, issues RS256 access tokens, manages app-scoped refresh sessions, creates impersonation tokens, maintains route-permission definitions, and issues short-lived real-time socket tickets.

This document describes Enhasa as an independent deployable unit: its runtime contract, exposed interfaces, persistence requirements, cryptographic material, and operational behavior.

## Service Contract

Enhasa exposes five surfaces:

1. **Authentication API** for login, identity validation, token refresh, logout, and impersonation.
2. **Token administration API** for inspecting and revoking refresh sessions.
3. **Permission administration API** for maintaining route-permission records.
4. **Trusted internal API** for public-key metadata, permission snapshots, and real-time credentials.
5. **PostgreSQL persistence surface** for identities, sessions, and permissions.

Access tokens are signed locally. Consumers validate them using metadata obtained from Enhasa; Enhasa is not called for every protected request.

## Runtime Requirements

- Node.js 20 or newer
- npm
- PostgreSQL
- An RSA key pair for the selected environment
- A provisioned database schema

Enhasa does not bootstrap or migrate its database schema. Missing configuration or signing keys prevent startup.

## Quick Start

```bash
npm install
cp .env.example .env.development
npm run dev
```

Development mode listens on port `3001` by default and runs through `tsx watch`. The `predev` lifecycle ensures that a DEVELOPMENT signing-key pair exists before the server starts.

Build and run compiled output:

```bash
npm run build
APP_ENV=production npm start
```

## Configuration Surface

Environment files are read in this order:

1. `.env`
2. `.env.<APP_ENV>`
3. `.env.local`
4. `.env.<APP_ENV>.local`

Values already present in the process environment take precedence. Runtime files are ignored by Git; `.env.example` defines the expected variables.

### Application

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `APP_ENV` | No | `development` | `development`, `test`, or `production`. |
| `APP_PORT` | No | `3001` | HTTP listener port. |
| `APP_PUBLIC_URL` | No | none | Public service URL retained in configuration. |
| `APP_CORS_ORIGINS` | No | empty | Comma-separated browser origins. |

Localhost origins are accepted outside production. The middleware also contains explicit known frontend-origin compatibility rules. `Access-Control-Allow-Credentials` is always `false` because authentication uses bearer tokens rather than cookies.

### Database

| Variable | Required | Default |
| --- | --- | --- |
| `DATABASE_HOST` | Yes | - |
| `DATABASE_PORT` | No | `5432` |
| `DATABASE_NAME` | Yes | - |
| `DATABASE_USER` | Yes | - |
| `DATABASE_PASSWORD` | Yes | - |
| `DATABASE_SSL` | No | `false` |
| `POSTGRES_POOL_MAX` | No | `10` |
| `POSTGRES_IDLE_TIMEOUT_MS` | No | `30000` |
| `POSTGRES_CONNECTION_TIMEOUT_MS` | No | `5000` |

When SSL is enabled, the current pool configuration uses `rejectUnauthorized: false`. Deployments requiring strict certificate verification must tighten this behavior before relying on database TLS identity validation.

### Tokens And Trust

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `JWT_EXPIRES_IN` | No | `1h` | Access-token lifetime accepted by `jsonwebtoken`. |
| `JWT_REFRESH_EXPIRES_IN_DAYS` | No | `30` | Refresh-session lifetime in days. |
| `JWT_ISSUER` | No | `enhasa` | JWT issuer claim. |
| `JWT_AUDIENCE` | No | `zeal` | JWT audience and fallback app identifier. |
| `AUTHORIZED_APPS` | No | `kahu,kajar,zeal` | Comma-separated app identifiers allowed to create sessions. |
| `VALIDATION_DATA_TOKEN` | Yes | - | Shared credential protecting trusted internal interfaces. |

`VALIDATION_DATA_TOKEN` must be treated as a service secret. It grants access to JWT validation metadata, permission snapshots, and internal real-time integration routes.

## Cryptographic Surface

Enhasa signs access tokens with RS256. It loads keys from:

```text
src/keys/<ENVIRONMENT>/private.pem
src/keys/<ENVIRONMENT>/public.pem
```

`ENVIRONMENT` is the uppercase `APP_ENV`: `DEVELOPMENT`, `TEST`, or `PRODUCTION`.

The private key is Enhasa-owned secret material. Consumers receive only the public validation contract through `GET /auth/validation-data`.

### Development Keys

Create a DEVELOPMENT pair only when both files are absent:

```bash
npm run keys:development:ensure
```

The command generates a 3072-bit RSA private key in PKCS#8 PEM format and a public key in SPKI PEM format. It fails when only one member of the pair exists.

Replace the DEVELOPMENT pair deliberately:

```bash
npm run keys:development:regenerate
```

Replace it and emit a JSON object containing `privateKey` and `publicKey` on `stdout`:

```bash
npm run --silent keys:development:regenerate:stdout
```

Operational output from the stdout variant goes to `stderr`, making the JSON suitable for direct piping into a secret-management command. Do not expose this output in CI logs, shell history, artifacts, or source control.

Filesystem permissions are normalized to:

- key directory: `0700`
- private key: `0600`
- public key: `0644`

Key regeneration invalidates access tokens signed by the previous pair. Automatic generation applies only to DEVELOPMENT; TEST and PRODUCTION keys must be provisioned externally.

## Identity Surface

Authentication reads identity state across users, employees, and customers. A login is eligible only when:

- the user exists, is active, and is not deleted;
- the associated customer exists, is active, and is not deleted;
- the associated employee exists, is active, and is not deleted;
- the employee has `canLogin = true`;
- the employee type is recognized;
- the requested app is authorized.

Recognized employee types are:

```text
SUP GES GFI REC VET AVE GBT OTB GHO OPH OPM OUT
```

Each type maps to a `clearance` acronym and `clearanceLevel`, which are embedded in access tokens.

Passwords currently use the legacy `passwordSHA256` database field. Unsalted SHA-256 is not a production-grade password KDF. This surface should be migrated to Argon2id or an equivalent password hashing scheme.

## Session Surface

### Access Tokens

Access tokens are stateless RS256 JWTs with these application claims:

| Claim | Meaning |
| --- | --- |
| `sub` | Effective user ID. |
| `customerId` | Effective tenant/customer ID. |
| `login` | Effective login. |
| `email` | Effective email, when present. |
| `clearance` | Effective employee type. |
| `clearanceLevel` | Effective clearance hierarchy value. |
| `actor` | Original actor identity on impersonation tokens. |

Standard `iat`, `exp`, `aud`, and `iss` claims are added during signing. Verification is restricted to RS256 and validates audience, issuer, and expiration.

Access tokens are not stored or checked against a revocation table. Deleting a refresh session stops future renewal but does not invalidate an already issued access token.

### Refresh Tokens

Refresh tokens are 48 random bytes encoded as base64url. Only a SHA-256 hash is persisted.

Session rules:

- Sessions are scoped by user and app.
- A successful login deletes previous refresh sessions for the same user/app.
- A user can retain independent sessions for different authorized apps.
- Refresh is rotational and one-time: the current row is consumed before a replacement is created.
- Logout deletes the supplied refresh-token row.
- Administrative revocation deletes a selected refresh-token row.

The current policy therefore allows at most one renewable session for each user/app combination.

### Impersonation Tokens

Only an authenticated `SUP` identity may issue an impersonation token. The resulting access token contains the target identity as the effective subject and stores the original SUP identity in `actor`.

Impersonation issues no refresh token. Its lifetime is the configured access-token lifetime.

## Permission Surface

Enhasa owns route-permission records with the following policy fields:

| Field | Contract |
| --- | --- |
| `audience` | `ZEAL` or `KAHU`. |
| `method` | `GET`, `POST`, `PATCH`, `PUT`, or `DELETE`. |
| `path` | Route pattern interpreted by the enforcement consumer. |
| `operation` | Stable `module.action` descriptor. |
| `allowedEmployeeTypes` | Inclusive employee-type allowlist. |
| `permission` | Human-readable description. |
| `section` | Administrative grouping. |
| `active` | Whether the permission participates in authorization. |

Create, update, and delete operations are restricted to authenticated SUP identities. Permission consumers retrieve a trusted full snapshot rather than querying records one route at a time.

The snapshot includes `revision`. Database-side revisioning increments `generalData.permissionRevision` whenever permission data changes, allowing consumers to invalidate caches cheaply.

Enhasa stores and exposes policy. It does not intercept or enforce requests belonging to another service.

## Real-Time Ticket Surface

The internal real-time interface has three operations:

1. Register a process-level master/client credential pair.
2. Return registered credentials to an authorized internal consumer.
3. Issue a 30-second user socket ticket.

Socket tickets are RS256 JWTs for audience `toma` and contain:

- `operatorId`
- `tenantId`
- credential version
- SHA-256 client-credential hash
- nonce
- source session expiration
- `typ: toma-socket`

Registered process credentials live only in memory. They disappear when Enhasa restarts and must be registered again. This surface is intentionally not durable in the current implementation.

## HTTP Surface

All request and response bodies use JSON unless the response has HTTP 204. Validation failures are produced by the shared Zod request middleware. Unknown routes return HTTP 404 with `{ "message": "Route not found" }`.

### Health

| Method | Path | Protection | Response |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Service and database status after `SELECT 1`. |

### Authentication

| Method | Path | Protection | Purpose |
| --- | --- | --- | --- |
| `GET` | `/auth/validation-data` | Boot token | Return algorithm, audience, issuer, and public key. |
| `POST` | `/auth/login` | Public | Authenticate and create an app-scoped session. |
| `GET` | `/auth/me` | Bearer access token | Return the validated effective identity. |
| `POST` | `/auth/impersonate` | SUP access token | Issue a target-user access token. |
| `POST` | `/auth/refresh` | Refresh token in body | Consume and rotate a refresh session. |
| `POST` | `/auth/logout` | Refresh token in body | Delete a refresh session. |

Login accepts `login` or `email`, plus `password` and optional `app`. Refresh and logout accept `refreshToken` and optional `app`. If app is omitted, `JWT_AUDIENCE` is used; the resolved value must appear in `AUTHORIZED_APPS`.

Trusted boot-token calls send:

```http
x-enhasa-boot-token: <VALIDATION_DATA_TOKEN>
```

### Refresh-Token Administration

These routes require a SUP bearer token.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/auth-tokens` | List refresh-session metadata. |
| `GET` | `/api/auth-tokens/summary` | Return total, active, expired, and revoked counts. |
| `POST` | `/api/auth-tokens/:id/revoke` | Delete one refresh-token row. |

The list supports `limit` from 1 to 500, non-negative `offset`, optional `search`, and `status` values `all`, `active`, `expired`, or `revoked`. It returns only a short hash preview, never the raw token or full hash.

### Permission Administration

These routes require a SUP bearer token.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/permissions` | List records; accepts pagination and optional audience. |
| `GET` | `/api/permissions/:id` | Return one record. |
| `POST` | `/api/permissions` | Create a record. |
| `PATCH` | `/api/permissions/:id` | Partially update a record. |
| `DELETE` | `/api/permissions/:id` | Delete a record. |

Permission list limits range from 1 to 10,000. Operation descriptors must match `module.action`.

### Trusted Permission Snapshot

| Method | Path | Protection | Purpose |
| --- | --- | --- | --- |
| `GET` | `/internal/permissions` | Boot token | Return all records, count, revision, and load timestamp. |
| `GET` | `/internal/permissions/revision` | Boot token | Return only the current revision. |

### Trusted Real-Time Interface

Every request requires `x-enhasa-boot-token`. It must also identify its caller through `x-enhasa-service`.

| Method | Path | Service header | Additional protection | Purpose |
| --- | --- | --- | --- | --- |
| `POST` | `/internal/toma/credentials` | `toma` | none | Register master/client credentials. |
| `GET` | `/internal/toma/credentials` | `zeal` | none | Retrieve registered credentials. |
| `POST` | `/internal/toma/socket-ticket` | `zeal` | Bearer access token | Issue a socket ticket. |

Boot-token comparison on this interface is timing-safe. Credential registration returns only version and registration time.

## Persistence Surface

Enhasa expects access to these tables:

| Table | Use |
| --- | --- |
| `generalData.users` | Login identity, password hash, status, customer and employee references. |
| `generalData.customers` | Customer eligibility. |
| `tenantData.employees` | Employee type, status, and login eligibility. |
| `generalData.authRefreshTokens` | Hashed app-scoped refresh sessions. |
| `generalData.routePermissions` | Permission definitions. |
| `generalData.permissionRevision` | Current permission revision singleton. |

Enhasa performs parameterized queries through a shared PostgreSQL pool. It does not currently wrap refresh rotation or login session replacement in explicit multi-statement application transactions; atomicity for token consumption itself comes from `DELETE ... RETURNING`.

## Error And Failure Behavior

- Invalid or missing bearer headers return HTTP 401.
- Invalid or expired access tokens return HTTP 401.
- Invalid or expired refresh tokens return HTTP 401.
- Unauthorized app identifiers return HTTP 400.
- Non-SUP access to administration or impersonation returns HTTP 403.
- Missing records return HTTP 404 where applicable.
- Missing in-memory real-time credentials return HTTP 503.
- Unexpected failures are serialized by the central error middleware as HTTP 500.
- Invalid startup configuration fails before the listener starts.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Ensure DEVELOPMENT keys and start watch mode. |
| `npm run typecheck` | Validate TypeScript without output. |
| `npm test` | Run the current test target: type checking with `APP_ENV=test`. |
| `npm run build` | Compile `src` into `dist`. |
| `npm start` | Run `dist/server.js`; defaults to production mode. |
| `npm run keys:development:ensure` | Create a missing DEVELOPMENT pair. |
| `npm run keys:development:regenerate` | Replace the DEVELOPMENT pair. |
| `npm run keys:development:regenerate:stdout` | Replace and emit the pair as JSON. |

The repository currently has no integration tests for database behavior, refresh-session concurrency, permission revisioning, impersonation, or socket-ticket issuance. `npm test` is presently a type-checking gate.

## Project Structure

```text
src/
  app.ts                         Express composition
  server.ts                      HTTP listener
  config/                        Environment loading and validation
  database/                      PostgreSQL pool abstraction
  middleware/                    JWT, CORS, errors, request validation
  repositories/                  Identity, session, and permission queries
  routes/                        HTTP surfaces
  services/                      In-memory real-time credentials
  types/                         JWT and Express contracts
scripts/
  development-keys.mjs           DEVELOPMENT RSA lifecycle
```

## Security Notes

- Never commit `.env` files or `src/keys`.
- Deploy only behind TLS.
- Keep the boot token restricted to trusted processes.
- Persist production signing keys across process replacement.
- Treat key rotation as access-token invalidation.
- Treat refresh-token revocation and access-token revocation as different operations.
- Re-register real-time credentials after every Enhasa restart.
- Replace legacy password SHA-256 with a password KDF before production hardening.
- Consider strict PostgreSQL certificate verification where database TLS is required.
