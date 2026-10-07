import type { Application, Router } from "express";
import type { RequestSchemas } from "../middleware/validateRequest";

type TaggedMiddleware = { requestSchemas?: RequestSchemas };
type RouteLayer = {
  route?: {
    path: string | string[];
    methods: Record<string, boolean>;
    stack: Array<{ handle: TaggedMiddleware }>;
  };
};

export type RegisteredRoute = {
  method: string;
  path: string;
  schemas: RequestSchemas;
};

const routes: RegisteredRoute[] = [];
const normalize = (value: string): string => {
  const normalized = (`/${value}`).replace(/\/+/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
};

export const mountRouter = (app: Application, basePath: string, router: Router): void => {
  app.use(basePath, router);
  for (const layer of (router as unknown as { stack?: RouteLayer[] }).stack ?? []) {
    if (!layer.route) continue;
    const schemas = layer.route.stack.reduce<RequestSchemas>((result, item) => ({ ...result, ...item.handle.requestSchemas }), {});
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
    for (const routePath of paths) {
      for (const method of Object.keys(layer.route.methods).filter((key) => layer.route?.methods[key])) {
        routes.push({ method: method.toUpperCase(), path: normalize(`${basePath}/${routePath}`), schemas });
      }
    }
  }
};

export const registeredRoutes = (): RegisteredRoute[] => routes.map((route) => ({ ...route, schemas: { ...route.schemas } }));
