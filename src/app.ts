import express from "express";
import { authRouter } from "./routes/auth.routes";
import { authTokenRouter } from "./routes/auth-token.routes";
import { internalPermissionRouter, permissionRouter } from "./routes/permission.routes";
import { tomaRouter } from "./routes/toma.routes";
import { database } from "./database";
import { cors } from "./middleware/cors";
import { errorHandler } from "./middleware/errorHandler";
import { mountRouter } from "./routes/route-registry";
import { openApiRouter } from "./routes/openapi.routes";

export const app = express();

app.use(cors);
app.use(express.json());

app.get("/health", async (_req, res, next) => {
  try {
    const databaseOk = await database.healthCheck();
    res.json({ status: databaseOk ? "ok" : "degraded", service: "enhasa", database: databaseOk ? "ok" : "unavailable" });
  } catch (error) {
    next(error);
  }
});

mountRouter(app, "/auth", authRouter);
mountRouter(app, "/api/auth-tokens", authTokenRouter);
mountRouter(app, "/api/permissions", permissionRouter);
mountRouter(app, "/internal/permissions", internalPermissionRouter);
mountRouter(app, "/internal/toma", tomaRouter);
app.use(openApiRouter);

app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use(errorHandler);
