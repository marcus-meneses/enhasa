import { database } from "../database";

export type RoutePermissionAudience = "ZEAL" | "KAHU";
export type RoutePermissionMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RoutePermission {
  id: string;
  numericId: string | number;
  audience: RoutePermissionAudience;
  method: RoutePermissionMethod;
  path: string;
  operation: string;
  allowedEmployeeTypes: string[];
  permission: string;
  section: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoutePermissionInput {
  audience: RoutePermissionAudience;
  method: RoutePermissionMethod;
  path: string;
  operation: string;
  allowedEmployeeTypes?: string[];
  permission?: string;
  section?: string;
  active?: boolean;
}

const routePermissionSelect = `
  SELECT
    "id",
    "numericId",
    "audience",
    "method",
    "path",
    "operation",
    "allowedEmployeeTypes",
    "permission",
    "section",
    "active",
    "createdAt",
    "updatedAt"
  FROM "generalData"."routePermissions"
`;

export interface ListRoutePermissionOptions {
  limit?: number;
  offset?: number;
  audience?: RoutePermissionAudience;
}

export const listRoutePermissions = async (options: ListRoutePermissionOptions = {}): Promise<RoutePermission[]> => {
  const limit = options.limit ?? 500;
  const offset = options.offset ?? 0;
  return database.queryRows<RoutePermission>(
    `${routePermissionSelect} ${options.audience ? 'WHERE "audience" = $3' : ''} ORDER BY "audience", "section", "path", "method" LIMIT $1 OFFSET $2`,
    options.audience ? [limit, offset, options.audience] : [limit, offset]
  );
};

export const countRoutePermissions = async (): Promise<number> => {
  const row = await database.queryOne<{ count: string }>('SELECT COUNT(*) AS count FROM "generalData"."routePermissions"');
  return Number(row?.count ?? 0);
};

export const getRoutePermissionRevision = async (): Promise<number> => {
  const row = await database.queryOne<{ revision: string }>(
    'SELECT "revision"::TEXT AS revision FROM "generalData"."permissionRevision" WHERE "id" = 1'
  );
  if (!row) throw new Error("Permission revision is not initialized");
  return Number(row.revision);
};

export const getRoutePermission = async (id: string): Promise<RoutePermission | null> =>
  database.queryOne<RoutePermission>(`${routePermissionSelect} WHERE "id" = $1 LIMIT 1`, [id]);

export const createRoutePermission = async (input: RoutePermissionInput): Promise<RoutePermission> => {
  const row = await database.queryOne<RoutePermission>(
    `
      INSERT INTO "generalData"."routePermissions"
        ("audience", "method", "path", "operation", "allowedEmployeeTypes", "permission", "section", "active")
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'Permission description not defined'), COALESCE($7, 'Unassigned'), COALESCE($8, TRUE))
      RETURNING "id", "numericId", "audience", "method", "path", "operation", "allowedEmployeeTypes", "permission", "section", "active", "createdAt", "updatedAt"
    `,
    [input.audience, input.method, input.path, input.operation, input.allowedEmployeeTypes ?? [], input.permission ?? null, input.section ?? null, input.active ?? null]
  );

  if (!row) throw new Error("Could not create route permission");
  return row;
};

export const updateRoutePermission = async (id: string, input: Partial<RoutePermissionInput>): Promise<RoutePermission | null> => {
  const current = await getRoutePermission(id);
  if (!current) return null;

  return database.queryOne<RoutePermission>(
    `
      UPDATE "generalData"."routePermissions"
      SET
        "audience" = $2,
        "method" = $3,
        "path" = $4,
        "operation" = $5,
        "allowedEmployeeTypes" = $6,
        "permission" = $7,
        "section" = $8,
        "active" = $9,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = $1
      RETURNING "id", "numericId", "audience", "method", "path", "operation", "allowedEmployeeTypes", "permission", "section", "active", "createdAt", "updatedAt"
    `,
    [
      id,
      input.audience ?? current.audience,
      input.method ?? current.method,
      input.path ?? current.path,
      input.operation ?? current.operation,
      input.allowedEmployeeTypes ?? current.allowedEmployeeTypes,
      input.permission ?? current.permission,
      input.section ?? current.section,
      input.active ?? current.active
    ]
  );
};

export const deleteRoutePermission = async (id: string): Promise<boolean> => {
  const deleted = await database.queryOne<{ id: string }>(
    'DELETE FROM "generalData"."routePermissions" WHERE "id" = $1 RETURNING "id"',
    [id]
  );
  return Boolean(deleted);
};
