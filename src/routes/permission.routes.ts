import { Router } from "express";
import { env } from "../config/env";
import { authenticate } from "../middleware/authenticate";
import { validateRequest } from "../middleware/validateRequest";
import {
  countRoutePermissions,
  createRoutePermission,
  deleteRoutePermission,
  getRoutePermissionRevision,
  getRoutePermission,
  listRoutePermissions,
  updateRoutePermission
} from "../repositories/route-permission.repository";
import { idParamsSchema, routePermissionCreateSchema, routePermissionListQuerySchema, routePermissionUpdateSchema } from "./validation.schemas";

export const permissionRouter = Router();
export const internalPermissionRouter = Router();

const requireSuperuser = (req: Parameters<typeof authenticate>[0], res: Parameters<typeof authenticate>[1], next: Parameters<typeof authenticate>[2]): void => {
  authenticate(req, res, () => {
    if (req.user?.clearance !== "SUP") {
      res.status(403).json({ message: "Only SUP users can manage route permissions" });
      return;
    }
    
    next();
  });
};

const requireBootToken = (req: Parameters<typeof authenticate>[0], res: Parameters<typeof authenticate>[1], next: Parameters<typeof authenticate>[2]): void => {
  if (req.header("x-enhasa-boot-token") !== env.validationDataToken) {
    res.status(401).json({ message: "Invalid validation data token" });
    return;
  }

  next();
};

permissionRouter.get("/", requireSuperuser, validateRequest({ query: routePermissionListQuerySchema }), async (_req, res, next) => {
  try {
    const query = res.locals.validated.query as { limit: number; offset: number; audience?: "ZEAL" | "KAHU" };
    const [data, count] = await Promise.all([listRoutePermissions(query), countRoutePermissions()]);
    res.json({ data, count });
  } catch (error) {
    next(error);
  }
});

permissionRouter.get("/:id", requireSuperuser, validateRequest({ params: idParamsSchema }), async (_req, res, next) => {
  try {
    const data = await getRoutePermission(res.locals.validated.params.id);
    if (!data) {
      res.status(404).json({ message: "Route permission not found" });
      return;
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

permissionRouter.post("/", requireSuperuser, validateRequest({ body: routePermissionCreateSchema }), async (_req, res, next) => {
  try {
    const data = await createRoutePermission(res.locals.validated.body);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

permissionRouter.patch("/:id", requireSuperuser, validateRequest({ params: idParamsSchema, body: routePermissionUpdateSchema }), async (_req, res, next) => {
  try {
    const data = await updateRoutePermission(res.locals.validated.params.id, res.locals.validated.body);
    if (!data) {
      res.status(404).json({ message: "Route permission not found" });
      return;
    }

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

permissionRouter.delete("/:id", requireSuperuser, validateRequest({ params: idParamsSchema }), async (_req, res, next) => {
  try {
    const deleted = await deleteRoutePermission(res.locals.validated.params.id);
    if (!deleted) {
      res.status(404).json({ message: "Route permission not found" });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

internalPermissionRouter.get("/", requireBootToken, async (_req, res, next) => {
  try {
    const [data, revision] = await Promise.all([
      listRoutePermissions({ limit: 10000, offset: 0 }),
      getRoutePermissionRevision()
    ]);
    res.json({ data, count: data.length, revision, loadedAt: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

internalPermissionRouter.get("/revision", requireBootToken, async (_req, res, next) => {
  try {
    res.json({ data: { revision: await getRoutePermissionRevision() } });
  } catch (error) {
    next(error);
  }
});
