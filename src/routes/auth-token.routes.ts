import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validateRequest } from "../middleware/validateRequest";
import { countAuthTokens, deleteAuthToken, listAuthTokens, summarizeAuthTokens, type AuthTokenStatusFilter } from "../repositories/auth-token-admin.repository";
import { authTokenListQuerySchema, idParamsSchema } from "./validation.schemas";

export const authTokenRouter = Router();

const requireSuperuser = (req: Parameters<typeof authenticate>[0], res: Parameters<typeof authenticate>[1], next: Parameters<typeof authenticate>[2]): void => {
  authenticate(req, res, () => {
    if (req.user?.clearance !== "SUP") {
      res.status(403).json({ message: "Only SUP users can manage auth tokens" });
      return;
    }

    next();
  });
};

authTokenRouter.get("/", requireSuperuser, validateRequest({ query: authTokenListQuerySchema }), async (_req, res, next) => {
  try {
    const query = res.locals.validated.query as { limit: number; offset: number; search?: string; status: AuthTokenStatusFilter };
    const [data, count] = await Promise.all([listAuthTokens(query), countAuthTokens({ search: query.search, status: query.status })]);
    res.json({ data, count });
  } catch (error) {
    next(error);
  }
});

authTokenRouter.get("/summary", requireSuperuser, async (_req, res, next) => {
  try {
    res.json({ data: await summarizeAuthTokens() });
  } catch (error) {
    next(error);
  }
});

authTokenRouter.post("/:id/revoke", requireSuperuser, validateRequest({ params: idParamsSchema }), async (_req, res, next) => {
  try {
    const deleted = await deleteAuthToken(res.locals.validated.params.id);
    if (!deleted) {
      res.status(404).json({ message: "Token not found" });
      return;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
