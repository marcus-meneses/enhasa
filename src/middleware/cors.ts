import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

const configuredOrigins = new Set(env.cors.origins);
const knownFrontendOriginPattern = /^https:\/\/(kahu|kajar)\.(dev|prod)\.aisergateway\.dev\.br$/;

const isAllowedOrigin = (origin: string): boolean => {
  if (configuredOrigins.has("*")) return true;
  if (configuredOrigins.has(origin)) return true;
  if (knownFrontendOriginPattern.test(origin)) return true;
  if (env.environment !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
};

export const cors = (req: Request, res: Response, next: NextFunction): void => {
  const origin = req.header("origin");

  if (origin && isAllowedOrigin(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }

  res.header("Access-Control-Allow-Credentials", "false");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "authorization, content-type, accept, x-enhasa-boot-token");

  if (req.method === "OPTIONS") {
    res.status(204).send();
    return;
  }

  next();
};
