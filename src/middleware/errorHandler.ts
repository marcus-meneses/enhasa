import type { NextFunction, Request, Response } from "express";

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const status = error instanceof Error && error.name === "UnauthorizedError" ? 401 : 500;

  res.status(status).json({
    message: error instanceof Error ? error.message : "Internal server error"
  });
};
