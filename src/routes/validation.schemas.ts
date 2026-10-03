import { z } from "zod";

const appSchema = z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/).optional();

export const authLoginBodySchema = z
  .object({
    login: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(1),
    app: appSchema
  })
  .refine((value) => value.login || value.email, {
    message: "Either login or email is required",
    path: ["login"]
  });

export const authRefreshBodySchema = z.object({
  refreshToken: z.string().min(1),
  app: appSchema
});

export const authLogoutBodySchema = z.object({
  refreshToken: z.string().min(1),
  app: appSchema
});


export const authImpersonateBodySchema = z.object({
  userId: z.string().uuid()
});


export const idParamsSchema = z.object({
  id: z.string().uuid()
});

export const authTokenListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().optional(),
  status: z.enum(["all", "active", "expired", "revoked"]).default("all")
});

const employeeTypeSchema = z.enum(["SUP", "GES", "GFI", "REC", "VET", "AVE", "GBT", "OTB", "GHO", "OPH", "OPM", "OUT"]);

const routePermissionAudienceSchema = z.enum(["ZEAL", "KAHU"]);

const routePermissionBaseSchema = z.object({
  audience: routePermissionAudienceSchema,
  method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]),
  path: z.string().trim().min(1),
  operation: z.string().trim().regex(/^[a-z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*$/, "Operation must use module.action format"),
  allowedEmployeeTypes: z.array(employeeTypeSchema).optional(),
  permission: z.string().trim().min(1).optional(),
  section: z.string().trim().min(1).optional(),
  active: z.boolean().optional()
});

export const routePermissionCreateSchema = routePermissionBaseSchema;
export const routePermissionUpdateSchema = routePermissionBaseSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided"
});

export const routePermissionListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10000).default(500),
  offset: z.coerce.number().int().min(0).default(0),
  audience: routePermissionAudienceSchema.optional()
});
