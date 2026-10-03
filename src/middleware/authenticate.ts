import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { JwtPayload } from "../types/auth";

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authorization = req.header("authorization");
  const [scheme, token] = authorization?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token) {
    res.status(401).json({ message: "Missing or invalid authorization header" });
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtPublicKey, {
      algorithms: ["RS256"],
      audience: env.jwtAudience,
      issuer: env.jwtIssuer
    }) as JwtPayload;

    req.user = {
      id: payload.sub,
      customerId: payload.customerId,
      login: payload.login,
      email: payload.email,
      clearance: payload.clearance,
      clearanceLevel: payload.clearanceLevel,
      actor: payload.actor
    };

    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};
