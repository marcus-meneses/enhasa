import { z, type ZodType } from "zod";
import { config } from "../config/env";
import { registeredRoutes, type RegisteredRoute } from "../routes/route-registry";

type JsonSchema = Record<string, unknown>;
const schema = (value?: ZodType): JsonSchema | undefined => value
  ? z.toJSONSchema(value, { unrepresentable: "any" }) as JsonSchema
  : undefined;

const descriptions: Record<string, string> = {
  "GET /auth/validation-data": "Return JWT validation metadata to trusted backend services.",
  "POST /auth/login": "Authenticate a user and create the application's single active refresh session.",
  "GET /auth/me": "Return the effective authenticated user from the access token.",
  "POST /auth/impersonate": "Issue an access token for a target user while retaining the SUP actor identity.",
  "POST /auth/refresh": "Rotate a valid refresh token and issue a new access token.",
  "POST /auth/logout": "Revoke a refresh session.",
  "GET /api/auth-tokens": "List refresh-token sessions for SUP administration.",
  "GET /api/auth-tokens/summary": "Summarize refresh-token sessions.",
  "POST /api/auth-tokens/:id/revoke": "Revoke and remove a refresh-token session.",
  "GET /api/permissions": "List route permissions.",
  "GET /api/permissions/:id": "Read a route permission.",
  "POST /api/permissions": "Create a route permission and advance the permission revision.",
  "PATCH /api/permissions/:id": "Update a route permission and advance the permission revision.",
  "DELETE /api/permissions/:id": "Delete a route permission and advance the permission revision.",
  "GET /internal/permissions": "Return the complete permission snapshot to a trusted service.",
  "GET /internal/permissions/revision": "Return the current permission revision to a trusted service.",
  "POST /internal/toma/credentials": "Register Toma runtime credentials.",
  "GET /internal/toma/credentials": "Return Toma runtime credentials to Zeal.",
  "POST /internal/toma/socket-ticket": "Issue a short-lived authenticated Toma socket ticket.",
};

const authorization = (route: RegisteredRoute): { security?: unknown[]; headers?: Record<string, JsonSchema>; label: string } => {
  if (route.path.startsWith("/internal/")) {
    return { label: "Trusted service headers", headers: {
      "x-enhasa-boot-token": { type: "string" },
      ...(route.path.startsWith("/internal/toma") ? { "x-enhasa-service": { type: "string", enum: [route.path.endsWith("/credentials") && route.method === "POST" ? "toma" : "zeal"] } } : {}),
    }, ...(route.path.endsWith("/socket-ticket") ? { security: [{ bearerAuth: [] }] } : {}) };
  }
  if (route.path === "/auth/me" || route.path === "/auth/impersonate" || route.path.startsWith("/api/")) {
    return { label: route.path.startsWith("/api/") ? "SUP bearer token" : "Bearer token", security: [{ bearerAuth: [] }] };
  }
  return { label: "Public", ...(route.path === "/auth/validation-data" ? { headers: { "x-enhasa-boot-token": { type: "string" } } } : {}) };
};

const parameters = (route: RegisteredRoute): Record<string, unknown>[] => {
  const result: Record<string, unknown>[] = [];
  for (const [location, requestSchema] of [["path", schema(route.schemas.params)], ["query", schema(route.schemas.query)]] as const) {
    const properties = (requestSchema?.properties ?? {}) as Record<string, JsonSchema>;
    const required = new Set((requestSchema?.required ?? []) as string[]);
    for (const [name, value] of Object.entries(properties)) result.push({ name, in: location, required: location === "path" || required.has(name), schema: value });
  }
  const auth = authorization(route);
  for (const [name, value] of Object.entries(auth.headers ?? {})) result.push({ name, in: "header", required: true, schema: value });
  return result;
};

export const getOpenApiDocument = () => {
  const paths: Record<string, Record<string, unknown>> = {};
  const allRoutes: RegisteredRoute[] = [
    { method: "GET", path: "/health", schemas: {} },
    { method: "GET", path: "/openapi.json", schemas: {} },
    ...registeredRoutes(),
  ];
  for (const route of allRoutes) {
    const path = route.path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, "{$1}");
    const auth = authorization(route);
    const body = schema(route.schemas.body);
    paths[path] ??= {};
    paths[path][route.method.toLowerCase()] = {
      tags: [route.path.split("/").filter(Boolean)[0] ?? "System"],
      summary: descriptions[`${route.method} ${route.path}`] ?? `${route.method} ${route.path}`,
      description: `Authorization: ${auth.label}.`,
      operationId: `${route.method.toLowerCase()}_${route.path.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
      ...(auth.security ? { security: auth.security } : {}),
      ...(parameters(route).length ? { parameters: parameters(route) } : {}),
      ...(body ? { requestBody: { required: true, content: { "application/json": { schema: body } } } } : {}),
      responses: { "200": { description: "Successful response" }, "400": { description: "Invalid request" }, "401": { description: "Unauthenticated" }, "403": { description: "Forbidden" } },
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "Enhasa API", version: "1.0.0", description: "Authentication, sessions, impersonation, permission administration, and trusted-service bootstrap surfaces." },
    servers: config.app.publicUrl ? [{ url: config.app.publicUrl }] : [],
    paths,
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
  };
};
