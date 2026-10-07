import { Router } from "express";
import { getOpenApiDocument } from "../docs/openapi";

export const openApiRouter = Router();
openApiRouter.get("/openapi.json", (_req, res) => res.json(getOpenApiDocument()));
