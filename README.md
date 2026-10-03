# Enhasa

Enhasa is the authentication and authorization authority for the application ecosystem. It authenticates users, signs RS256 access tokens, rotates refresh tokens, issues impersonation tokens, owns route-permission definitions, and brokers credentials used to establish authenticated Toma connections.

Enhasa does not own tenant business data or authorize individual Zeal business requests. Zeal validates Enhasa-issued JWTs locally and applies route-permission and tenant-ownership policies.

## Responsibilities

- Authenticate active users associated with active customers and employees.
- Issue and verify the ecosystem's RS256 JWT contract.
- Maintain one refresh session per user and authorized application.
- Rotate refresh tokens on every successful refresh.
- Issue short-lived impersonation access tokens for SUP actors.
- Store route permissions for the `ZEAL` and `KAHU` audiences.
- Expose versioned permission snapshots to trusted services.
- Register Toma process credentials and issue short-lived socket tickets.
- Expose refresh-session administration to SUP users.

## Ecosystem Position

```text
Kahu / Kajar
     |
     | login, refresh, logout, /me, impersonation
     v
  Enhasa ---------------------> PostgreSQL
     |                          users, employees, customers,
     | validation metadata     refresh tokens, route permissions
     | permission snapshot
     v
   Zeal ----------------------> tenant business data
     |
     | socket ticket
     v
   Toma
```

Kahu is the tenant-facing frontend. Kajar is the administrative frontend. Zeal is the business API and local permission enforcement point. Toma provides real-time delivery. Enhasa is the source of identity and permission data used by those services.

## Runtime Requirements

- Node.js 20 or newer
- npm
- PostgreSQL reachable with the configured credentials
- The shared database schema already bootstrapped by Zeal
- An RSA key pair for the selected environment

Enhasa reads users and permission data from shared PostgreSQL schemas. It does not create or migrate those tables at startup.

## Install And Run

```bash
npm install
cp .env.example .env.development
npm run dev
```

The development server listens on port `3001` by default. `npm run dev` runs the `predev` lifecycle first, ensuring that a DEVELOPMENT RSA pair exists, and then starts `tsx` in watch mode.

Production build and startup:

```bash
npm run build
APP_ENV=production npm start
```

The production key pair and environment configuration must be provisioned before startup.

## Configuration

Configuration files are loaded in this order:

1. `.env`
2. `.env.<APP_ENV>`
3. `.env.local`
4. `.env.<APP_ENV>.local`

Values already present in the process environment take precedence over every file. Local and environment-specific files are ignored by Git; `.env.example` is the repository contract.

### Application

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `APP_ENV` | No | `development` | Runtime environment: `development`, `test`, or `production`. |
| `APP_PORT` | No | `3001` | HTTP listening port. |
| `APP_PUBLIC_URL` | No | none | Public service URL retained in application configuration. |
| `APP_CORS_ORIGINS` | No | empty | Comma-separated browser origins. |

In non-production environments, localhost and `127.0.0.1` origins are also accepted. Known Kahu and Kajar dev/prod subdomains under `aisergateway.dev.br` are currently accepted by the CORS middleware.

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

The database role needs access to:

- `generalData.users`
- `generalData.customers`
- `generalData.authRefreshTokens`
- `generalData.routePermissions`
- `generalData.permissionRevision`
- `tenantData.employees`

### Authentication

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `JWT_EXPIRES_IN` | No | `1h` | Access-token lifetime accepted by `jsonwebtoken`. |
| `JWT_REFRESH_EXPIRES_IN_DAYS` | No | `30` | Refresh-token lifetime in days. |
| `JWT_ISSUER` | No | `enhasa` | JWT issuer claim. |
| `JWT_AUDIENCE` | No | `zeal` | JWT audience and fallback app identifier. |
| `AUTHORIZED_APPS` | No | `kahu,kajar,zeal` | Applications allowed to create sessions. |
| `VALIDATION_DATA_TOKEN` | Yes | - | Shared boot credential used by trusted services. |

Legacy environment-specific database and application aliases remain accepted, but new deployments should use the names above.

## Signing Keys

Enhasa reads environment-specific keys from:

```text
src/keys/<ENVIRONMENT>/private.pem
src/keys/<ENVIRONMENT>/public.pem
```

`ENVIRONMENT` is the uppercase form of `APP_ENV`: `DEVELOPMENT`, `TEST`, or `PRODUCTION`. The private key must never be committed or distributed to resource services. Zeal obtains only the public key through the trusted validation-data endpoint.

### Development Key Lifecycle

Ensure the DEVELOPMENT pair exists without replacing it:

```bash
npm run keys:development:ensure
```

This runs automatically before `npm run dev`. It creates a 3072-bit RSA pair only when both files are absent. If only one file exists, it fails instead of silently creating an inconsistent pair.

Deliberately replace the DEVELOPMENT pair:

```bash
npm run keys:development:regenerate
```

Replace it and emit deployment-friendly JSON on `stdout`:

```bash
npm run --silent keys:development:regenerate:stdout
```

The JSON contains `privateKey` and `publicKey`; operational output goes to `stderr`. Pipe this output directly into a trusted secret-management tool. Never place it in shell history, CI logs, artifacts, or source control.

Generated permissions are `0700` for the directory, `0600` for the private key, and `0644` for the public key. Regeneration immediately invalidates every DEVELOPMENT access token signed by the previous pair. These scripts never generate TEST or PRODUCTION keys.

## Authentication Model

### Login Eligibility

A user can authenticate only when all of the following are true:

- The user exists and is not deleted.
- The user status is `active`.
- The associated customer exists, is not deleted, and is `active`.
- The associated employee exists, is not deleted, and is `active`.
- The employee has `canLogin = true`.
- The employee type maps to a recognized clearance.
- The requested `app` belongs to `AUTHORIZED_APPS`.

Login currently compares the submitted password using the legacy `passwordSHA256` field. Unsalted SHA-256 is not an adequate password-storage scheme and should be migrated to a password KDF such as Argon2id before the authentication surface is considered production-hardened.

### Access Tokens

Access tokens are stateless RS256 JWTs containing:

```text
sub
customerId
login
email
clearance
clearanceLevel
actor (impersonation only)
iat / exp / aud / iss
```

Services validate the signature, audience, issuer, algorithm, and expiration. Access tokens are not persisted or checked against a revocation list on every request; they remain valid until expiration unless signing keys are rotated.

### Refresh Sessions

Refresh tokens are random 48-byte values returned as base64url. Enhasa stores only their SHA-256 hashes.

The current session policy is one refresh session per user and app:

- A successful login deletes all previous refresh tokens for that user/app.
- The same user may retain independent sessions for different apps.
- Refresh tokens are one-time use: refresh consumes the current row and creates a replacement.
- Logout deletes the supplied refresh token.
- Administrative revocation also deletes the token row.

Deleting a refresh token prevents future renewal but does not invalidate an already issued stateless access token.

### Impersonation

Only an authenticated `SUP` user may call `/auth/impersonate`. The resulting access token uses the target user's identity and customer while retaining the real SUP identity in the `actor` claim.

Impersonation does not issue a refresh token. Zeal uses the presence of `actor` when applying tenant-ownership behavior. At present a direct SUP token may receive privileged tenant bypass in Zeal, while an impersonated token does not; that distinction belongs to Zeal's authorization policy, not Enhasa's JWT verification.

## Permission Model

Enhasa owns `generalData.routePermissions`, including:

- audience: `ZEAL` or `KAHU`
- HTTP method and route path
- `module.action` operation descriptor
- allowed employee types
- human-readable description and section
- active state

Permission mutations increment `generalData.permissionRevision` through the database revision mechanism. Trusted services retrieve the full snapshot and revision from `/internal/permissions`; clients can use revision changes to invalidate local access maps.

Kajar manages records through SUP-only `/api/permissions` routes. Zeal loads, validates, audits, caches, and enforces the snapshot. Enhasa stores permission policy but does not enforce Zeal business routes itself.

## Toma Integration

Toma registers a master/client credential pair through a boot-token-protected internal endpoint. Zeal can retrieve that pair and request a 30-second socket ticket on behalf of an authenticated user.

The ticket contains the effective operator and tenant identity, credential version, client-credential hash, nonce, session expiration, and `typ: toma-socket`. It is signed by Enhasa for audience `toma`.

Toma credentials are currently held in Enhasa process memory. They are lost when Enhasa restarts and must be registered again by Toma. This is current behavior, not durable secret storage.

## HTTP API

### Public And Session Routes

| Method | Path | Protection | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Database-aware service health. |
| `GET` | `/auth/validation-data` | Boot token | JWT validation contract for trusted services. |
| `POST` | `/auth/login` | Public | Authenticate and create an app-scoped session. |
| `POST` | `/auth/refresh` | Refresh token | Rotate refresh and access tokens. |
| `POST` | `/auth/logout` | Refresh token | Delete the supplied refresh session. |
| `GET` | `/auth/me` | Bearer JWT | Return the validated JWT identity. |
| `POST` | `/auth/impersonate` | SUP bearer JWT | Issue an impersonation access token. |

Trusted boot-token routes require:

```http
x-enhasa-boot-token: <VALIDATION_DATA_TOKEN>
```

### Refresh-Token Administration

All routes require an authenticated SUP token.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/auth-tokens` | Paginated and searchable token metadata. |
| `GET` | `/api/auth-tokens/summary` | Active, expired, revoked, and total counts. |
| `POST` | `/api/auth-tokens/:id/revoke` | Delete a refresh-token record. |

List filters include `limit`, `offset`, `search`, and `status` (`all`, `active`, `expired`, or `revoked`). Raw refresh tokens and complete hashes are never returned.

### Permission Administration

All routes require an authenticated SUP token.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/permissions` | List permissions, optionally by audience. |
| `GET` | `/api/permissions/:id` | Retrieve one permission. |
| `POST` | `/api/permissions` | Create a permission. |
| `PATCH` | `/api/permissions/:id` | Update a permission. |
| `DELETE` | `/api/permissions/:id` | Delete a permission. |

Operations must follow `module.action`. Accepted employee types are `SUP`, `GES`, `GFI`, `REC`, `VET`, `AVE`, `GBT`, `OTB`, `GHO`, `OPH`, `OPM`, and `OUT`.

### Internal Permissions

| Method | Path | Protection | Purpose |
| --- | --- | --- | --- |
| `GET` | `/internal/permissions` | Boot token | Complete snapshot and revision. |
| `GET` | `/internal/permissions/revision` | Boot token | Current revision only. |

### Internal Toma Routes

These routes require the boot token plus `x-enhasa-service: toma` or `x-enhasa-service: zeal`, as indicated:

| Method | Path | Caller | Purpose |
| --- | --- | --- | --- |
| `POST` | `/internal/toma/credentials` | Toma | Register process credentials. |
| `GET` | `/internal/toma/credentials` | Zeal | Retrieve registered credentials. |
| `POST` | `/internal/toma/socket-ticket` | Zeal + user JWT | Issue a short-lived socket ticket. |

## Health And Failure Behavior

`GET /health` executes `SELECT 1`. A successful check returns `status: ok`. Database failures flow through the central error handler. Unknown routes return JSON with HTTP 404.

Configuration and key files load during module initialization. Missing required variables, invalid `APP_ENV`, or missing selected-environment keys prevent startup rather than allowing a partially configured auth service.

## Development Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Ensure DEVELOPMENT keys and start the watch server. |
| `npm run typecheck` | Validate TypeScript without emitting files. |
| `npm test` | Run the current test target: type checking under `APP_ENV=test`. |
| `npm run build` | Compile TypeScript into `dist/`. |
| `npm start` | Run the compiled server, defaulting to production mode. |
| `npm run keys:development:ensure` | Create missing DEVELOPMENT keys. |
| `npm run keys:development:regenerate` | Replace DEVELOPMENT keys. |
| `npm run keys:development:regenerate:stdout` | Replace and emit the pair as JSON. |

The current test suite has no integration tests for PostgreSQL, session concurrency, permission revisioning, or Toma tickets. These remain important coverage gaps.

## Project Structure

```text
src/
  app.ts                         Express composition and route mounting
  server.ts                      HTTP listener
  config/                        Environment loading and typed configuration
  database/                      PostgreSQL pool wrapper
  middleware/                    JWT, CORS, validation, and errors
  repositories/                  Users, sessions, tokens, and permissions
  routes/                        Auth, token, permission, and Toma APIs
  services/                      In-memory Toma credential registry
  types/                         Authentication and Express types
scripts/
  development-keys.mjs           DEVELOPMENT RSA key lifecycle
```

## Security And Operational Notes

- Never commit `.env` files or `src/keys`.
- Limit `VALIDATION_DATA_TOKEN` to trusted service processes.
- Serve Enhasa behind TLS; credentials and bearer tokens must not cross public plain HTTP.
- Keep application identifiers explicit in login, refresh, and logout calls.
- Persist production keys across process replacement.
- Treat signing-key regeneration as a session-invalidating operation.
- Restarting Enhasa requires Toma credential registration again.
- Refresh-token deletion is not immediate access-token revocation.
- Migrate legacy password SHA-256 storage before production hardening.

## Current Boundaries

Enhasa intentionally does not:

- own tenant business entities;
- enforce tenant ownership for tutors, animals, sales, inventory, or services;
- decide UI visibility directly;
- persist Toma process credentials;
- revoke stateless access tokens per request;
- bootstrap or migrate the shared database schema.

These boundaries keep identity issuance centralized while allowing Zeal to remain the enforcement point closest to business resources.
