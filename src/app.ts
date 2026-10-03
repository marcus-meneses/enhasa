import express from "express";
import { authRouter } from "./routes/auth.routes";
import { authTokenRouter } from "./routes/auth-token.routes";
import { internalPermissionRouter, permissionRouter } from "./routes/permission.routes";
import { tomaRouter } from "./routes/toma.routes";
import { database } from "./database";
import { cors } from "./middleware/cors";
import { errorHandler } from "./middleware/errorHandler";

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

app.use("/auth", authRouter);
app.use("/api/auth-tokens", authTokenRouter);
app.use("/api/permissions", permissionRouter);
app.use("/internal/permissions", internalPermissionRouter);
app.use("/internal/toma", tomaRouter);

app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use(errorHandler);
