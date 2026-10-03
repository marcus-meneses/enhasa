import { randomUUID, timingSafeEqual } from "crypto";
import { NextFunction, Request, Response, Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env";
import { authenticate } from "../middleware/authenticate";
import { getTomaCredentials, registerTomaCredentials, tomaClientTokenHash } from "../services/toma-credential.service";

export const tomaRouter = Router();
const credentialsSchema = z.object({ masterToken: z.string().min(43).max(256), clientToken: z.string().min(43).max(256) });
const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
const trusted = (service: "toma" | "zeal") => (req: Request, res: Response, next: NextFunction) => {
  const token = req.header("x-enhasa-boot-token") ?? "";
  if (!safeEqual(token, env.validationDataToken) || req.header("x-enhasa-service") !== service) {
    res.status(401).json({ message: "Unauthorized service" }); return;
  }
  next();
};

tomaRouter.post("/credentials", trusted("toma"), (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Invalid credentials payload" }); return; }
  res.status(201).json(registerTomaCredentials(parsed.data.masterToken, parsed.data.clientToken));
});

tomaRouter.get("/credentials", trusted("zeal"), (_req, res) => {
  const credentials = getTomaCredentials();
  if (!credentials) { res.status(503).json({ message: "Toma credentials unavailable" }); return; }
  res.json(credentials);
});

tomaRouter.post("/socket-ticket", trusted("zeal"), authenticate, (req, res) => {
  const credentials = getTomaCredentials();
  if (!credentials || !req.user) { res.status(503).json({ message: "Toma unavailable" }); return; }
  const authorization = req.header("authorization") ?? "";
  const sessionPayload = jwt.decode(authorization.replace(/^Bearer /, "")) as jwt.JwtPayload | null;
  const ticket = jwt.sign({
    operatorId: req.user.id,
    tenantId: req.user.customerId,
    credentialVersion: credentials.version,
    clientCredentialHash: tomaClientTokenHash(credentials.clientToken),
    nonce: randomUUID(),
    typ: "toma-socket",
    sessionExpiresAt: Number(sessionPayload?.exp) * 1000
  }, env.jwtPrivateKey, { algorithm: "RS256", audience: "toma", issuer: env.jwtIssuer, expiresIn: "30s", jwtid: randomUUID() });
  res.json({ ticket, expiresInSeconds: 30 });
});
