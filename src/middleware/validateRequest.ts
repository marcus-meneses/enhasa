import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";

export interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export interface ValidatedRequestData {
  body?: unknown;
  query?: unknown;
  params?: unknown;
}

export const validateRequest = (schemas: RequestSchemas) => (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const validated: ValidatedRequestData = {};

    if (schemas.body) {
      validated.body = schemas.body.parse(req.body);
    }

    if (schemas.query) {
      validated.query = schemas.query.parse(req.query);
    }

    if (schemas.params) {
      validated.params = schemas.params.parse(req.params);
    }

    res.locals.validated = {
      ...(res.locals.validated as ValidatedRequestData | undefined),
      ...validated
    };

    next();
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        message: "Invalid request",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
      return;
    }

    next(error);
  }
};
