import { createHash } from "crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { authenticate } from "../middleware/authenticate";
import { validateRequest } from "../middleware/validateRequest";
import { createRefreshToken, consumeRefreshToken, deleteRefreshTokensForUserApp, revokeRefreshToken } from "../repositories/refresh-token.repository";
import { findUserById, findUserByLoginOrEmail } from "../repositories/user.repository";
import type { JwtPayload } from "../types/auth";
import { authImpersonateBodySchema, authLoginBodySchema, authLogoutBodySchema, authRefreshBodySchema } from "./validation.schemas";

export const authRouter = Router();

authRouter.get("/validation-data", (req, res) => {
  if (req.header("x-enhasa-boot-token") !== env.validationDataToken) {
    res.status(401).json({ message: "Invalid validation data token" });
    return;
  }

  res.json({
    algorithm: "RS256",
    audience: env.jwtAudience,
    issuer: env.jwtIssuer,
    publicKey: env.jwtPublicKey
  });
});

const hashPassword = (password: string): string => createHash("sha256").update(password).digest("hex");

const signAccessToken = (payload: JwtPayload): string =>
  jwt.sign(payload, env.jwtPrivateKey, {
    algorithm: "RS256",
    audience: env.jwtAudience,
    expiresIn: env.jwtExpiresIn,
    issuer: env.jwtIssuer
  });

const resolveApp = (requestedApp?: string): string | null => {
  const app = requestedApp?.trim() || env.jwtAudience;
  return env.authorizedApps.includes(app) ? app : null;
};

const authResponse = (accessToken: string, refreshToken: { refreshToken: string; expiresAt: Date }, app: string) => ({
  accessToken,
  refreshToken: refreshToken.refreshToken,
  refreshTokenExpiresAt: refreshToken.expiresAt.toISOString(),
  tokenType: "Bearer" as const,
  expiresIn: env.jwtExpiresIn,
  app
});

authRouter.post("/login", validateRequest({ body: authLoginBodySchema }), async (req, res, next) => {
  try {
    const { login, email, password, app: requestedApp } = req.body as { login?: string; email?: string; password: string; app?: string };
    const app = resolveApp(requestedApp);

    if (!app) {
      res.status(400).json({ message: "Unauthorized app" });
      return;
    }

    if ((!login && !email) || !password) {
      res.status(400).json({ message: "Missing required fields" });
      return;
    }

    const user = await findUserByLoginOrEmail({ login, email });

    if (!user?.passwordSHA256 || user.passwordSHA256 !== hashPassword(password)) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const payload: JwtPayload = {
      sub: user.id,
      customerId: user.customerId,
      login: user.login,
      email: user.email,
      clearance: user.clearance,
      clearanceLevel: user.clearanceLevel
    };

    await deleteRefreshTokensForUserApp(user.id, app);
    const accessToken = signAccessToken(payload);
    const refreshToken = await createRefreshToken(user.id, app);

    res.json(authResponse(accessToken, refreshToken, app));
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});


authRouter.post("/impersonate", authenticate, validateRequest({ body: authImpersonateBodySchema }), async (req, res, next) => {
  try {
    const currentUser = req.user;

    if (!currentUser) {
      res.status(401).json({ message: "Missing authenticated user" });
      return;
    }

    if (currentUser.clearance !== "SUP") {
      res.status(403).json({ message: "Only SUP users can impersonate" });
      return;
    }

    const { userId } = req.body as { userId: string };
    const targetUser = await findUserById(userId);

    if (!targetUser) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const actor = {
      id: currentUser.id,
      customerId: currentUser.customerId,
      login: currentUser.login,
      email: currentUser.email,
      clearance: currentUser.clearance,
      clearanceLevel: currentUser.clearanceLevel
    };

    const payload: JwtPayload = {
      sub: targetUser.id,
      customerId: targetUser.customerId,
      login: targetUser.login,
      email: targetUser.email,
      clearance: targetUser.clearance,
      clearanceLevel: targetUser.clearanceLevel,
      actor
    };

    res.json({
      accessToken: signAccessToken(payload),
      tokenType: "Bearer",
      expiresIn: env.jwtExpiresIn,
      impersonatedUser: {
        id: targetUser.id,
        customerId: targetUser.customerId,
        login: targetUser.login,
        email: targetUser.email,
        clearance: targetUser.clearance,
        clearanceLevel: targetUser.clearanceLevel
      },
      actorUser: actor
    });
  } catch (error) {
    next(error);
  }
});



authRouter.post("/refresh", validateRequest({ body: authRefreshBodySchema }), async (req, res, next) => {
  try {
    const { refreshToken, app: requestedApp } = req.body as { refreshToken: string; app?: string };
    const app = resolveApp(requestedApp);

    if (!app) {
      res.status(400).json({ message: "Unauthorized app" });
      return;
    }

    const consumedRefreshToken = await consumeRefreshToken(refreshToken, app);

    if (!consumedRefreshToken) {
      res.status(401).json({ message: "Invalid or expired refresh token" });
      return;
    }

    const currentUser = await findUserById(consumedRefreshToken.userId);

    if (!currentUser) {
      res.status(401).json({ message: "User no longer exists" });
      return;
    }

    const payload: JwtPayload = {
      sub: currentUser.id,
      customerId: currentUser.customerId,
      login: currentUser.login,
      email: currentUser.email,
      clearance: currentUser.clearance,
      clearanceLevel: currentUser.clearanceLevel
    };
    const nextRefreshToken = await createRefreshToken(currentUser.id, consumedRefreshToken.app);

    res.json(authResponse(signAccessToken(payload), nextRefreshToken, consumedRefreshToken.app));
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", validateRequest({ body: authLogoutBodySchema }), async (req, res, next) => {
  try {
    const { refreshToken, app: requestedApp } = req.body as { refreshToken: string; app?: string };
    const app = resolveApp(requestedApp);

    if (!app) {
      res.status(400).json({ message: "Unauthorized app" });
      return;
    }

    await revokeRefreshToken(refreshToken, app);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
