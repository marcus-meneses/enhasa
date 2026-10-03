import fs from "fs";
import path from "path";
import { loadEnvironment } from "./loadEnvironment";
import type { SignOptions } from "jsonwebtoken";
loadEnvironment();

type AppEnvironment = "development" | "production" | "test";
const environment = (process.env.APP_ENV ?? process.env.ENV ?? process.env.NODE_ENV ?? "development") as AppEnvironment;
if (!["development", "production", "test"].includes(environment)) throw new Error(`Invalid APP_ENV: ${environment}`);
const legacyPrefix = environment.toUpperCase();
const dbPrefix = `POSTGRES_${legacyPrefix}_`;
const first = (names: string[], fallback?: string) => names.map(name => process.env[name]).find(Boolean) ?? fallback;
const required = (names: string[]) => first(names) ?? (() => { throw new Error("Missing required configuration: " + names[0]); })();
const listValue = (primary: string, legacy: string[]): string[] => {
  const source = process.env[primary] ?? legacy.map(name => process.env[name]).find(Boolean) ?? "";
  return source.split(",").map(value => value.trim()).filter(Boolean);
};
const keyDirectory = path.resolve(process.cwd(), "src", "keys", legacyPrefix);
const requiredFile = (filePath: string): string => { try { return fs.readFileSync(filePath, "utf8"); } catch { throw new Error(`Missing required key file: ${filePath}`); } };

export const config = Object.freeze({
  app: Object.freeze({
    environment,
    port: Number(first(["APP_PORT", `${legacyPrefix}_PORT`, "PORT"], "3001")),
    publicUrl: first(["APP_PUBLIC_URL", `${legacyPrefix}_PUBLIC_URL`, "PUBLIC_URL"]),
    corsOrigins: Object.freeze(listValue("APP_CORS_ORIGINS", [`${legacyPrefix}_CORS_ORIGINS`, "CORS_ORIGINS"])),
  }),
  services: Object.freeze({}),
  auth: Object.freeze({
    jwtPrivateKey: requiredFile(path.join(keyDirectory, "private.pem")),
    jwtPublicKey: requiredFile(path.join(keyDirectory, "public.pem")),
    jwtExpiresIn: (process.env.JWT_EXPIRES_IN ?? "1h") as SignOptions["expiresIn"],
    jwtIssuer: process.env.JWT_ISSUER ?? "enhasa",
    jwtAudience: process.env.JWT_AUDIENCE ?? "zeal",
    authorizedApps: Object.freeze((process.env.AUTHORIZED_APPS ?? "kahu,kajar,zeal").split(",").map(app => app.trim()).filter(Boolean)),
    validationDataToken: required(["VALIDATION_DATA_TOKEN", `${legacyPrefix}_VALIDATION_DATA_TOKEN`]),
  }),
  database: Object.freeze({
    host: required(["DATABASE_HOST", `${dbPrefix}HOST`]),
    port: Number(first(["DATABASE_PORT", `${dbPrefix}PORT`], "5432")),
    name: required(["DATABASE_NAME", `${dbPrefix}DB`]),
    user: required(["DATABASE_USER", `${dbPrefix}USER`]),
    password: required(["DATABASE_PASSWORD", `${dbPrefix}PASSWORD`]),
    ssl: first(["DATABASE_SSL", `${dbPrefix}SSL`], "false") === "true",
  }),
});
export const env = Object.freeze({
  environment: config.app.environment,
  port: config.app.port,
  jwtPrivateKey: config.auth.jwtPrivateKey,
  jwtPublicKey: config.auth.jwtPublicKey,
  jwtExpiresIn: config.auth.jwtExpiresIn,
  jwtIssuer: config.auth.jwtIssuer,
  jwtAudience: config.auth.jwtAudience,
  authorizedApps: config.auth.authorizedApps,
  validationDataToken: config.auth.validationDataToken,
  cors: { origins: config.app.corsOrigins },
  database: config.database,
});
