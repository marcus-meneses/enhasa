import { database } from "../database";

export type AuthTokenStatusFilter = "all" | "active" | "expired" | "revoked";

export interface AuthRefreshTokenAdminRecord {
  id: string;
  numericId: string | number;
  tokenHashPreview: string;
  userId: string;
  app: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  userLogin: string | null;
  userEmail: string | null;
  userName: string | null;
  userCustomerId: string | null;
  userStatus: string | null;
}

export interface AuthTokenListOptions {
  limit?: number;
  offset?: number;
  search?: string;
  status?: AuthTokenStatusFilter;
}

export interface AuthTokenSummary {
  total: number;
  active: number;
  expired: number;
  revoked: number;
}

const tokenSelect = `
  SELECT
    rt."id",
    rt."numericId",
    CONCAT(SUBSTRING(rt."tokenHash" FROM 1 FOR 12), '...') AS "tokenHashPreview",
    rt."userId",
    rt."app",
    rt."createdAt",
    rt."expiresAt",
    rt."revokedAt",
    u."login" AS "userLogin",
    u."email" AS "userEmail",
    u."name" AS "userName",
    u."customerId" AS "userCustomerId",
    u."status" AS "userStatus"
  FROM "generalData"."authRefreshTokens" rt
  LEFT JOIN "generalData"."users" u ON u."id" = rt."userId"
`;

const whereSql = (options: Pick<AuthTokenListOptions, "search" | "status">, params: unknown[]): string => {
  const clauses: string[] = [];

  if (options.status === "active") clauses.push('rt."revokedAt" IS NULL AND rt."expiresAt" > CURRENT_TIMESTAMP');
  if (options.status === "expired") clauses.push('rt."revokedAt" IS NULL AND rt."expiresAt" <= CURRENT_TIMESTAMP');
  if (options.status === "revoked") clauses.push('rt."revokedAt" IS NOT NULL');

  const search = options.search?.trim();
  if (search) {
    params.push(`%${search}%`);
    clauses.push(`(
      CAST(rt."numericId" AS TEXT) ILIKE $${params.length}
      OR CAST(rt."id" AS TEXT) ILIKE $${params.length}
      OR CAST(rt."userId" AS TEXT) ILIKE $${params.length}
      OR rt."app" ILIKE $${params.length}
      OR u."login" ILIKE $${params.length}
      OR u."email" ILIKE $${params.length}
      OR u."name" ILIKE $${params.length}
    )`);
  }

  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
};

export const listAuthTokens = async (options: AuthTokenListOptions = {}): Promise<AuthRefreshTokenAdminRecord[]> => {
  const params: unknown[] = [];
  const where = whereSql(options, params);
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  params.push(limit);
  const limitParam = params.length;
  params.push(offset);
  const offsetParam = params.length;

  return database.queryRows<AuthRefreshTokenAdminRecord>(
    `${tokenSelect} ${where} ORDER BY rt."createdAt" DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params
  );
};

export const countAuthTokens = async (options: Pick<AuthTokenListOptions, "search" | "status"> = {}): Promise<number> => {
  const params: unknown[] = [];
  const where = whereSql(options, params);
  const row = await database.queryOne<{ count: string }>(
    `
      SELECT COUNT(*) AS count
      FROM "generalData"."authRefreshTokens" rt
      LEFT JOIN "generalData"."users" u ON u."id" = rt."userId"
      ${where}
    `,
    params
  );

  return Number(row?.count ?? 0);
};

export const summarizeAuthTokens = async (): Promise<AuthTokenSummary> => {
  const row = await database.queryOne<{ total: string; active: string; expired: string; revoked: string }>(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE "revokedAt" IS NULL AND "expiresAt" > CURRENT_TIMESTAMP) AS active,
      COUNT(*) FILTER (WHERE "revokedAt" IS NULL AND "expiresAt" <= CURRENT_TIMESTAMP) AS expired,
      COUNT(*) FILTER (WHERE "revokedAt" IS NOT NULL) AS revoked
    FROM "generalData"."authRefreshTokens"
  `);

  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    expired: Number(row?.expired ?? 0),
    revoked: Number(row?.revoked ?? 0)
  };
};

export const deleteAuthToken = async (id: string): Promise<boolean> => {
  const deleted = await database.queryOne<{ id: string }>(
    'DELETE FROM "generalData"."authRefreshTokens" WHERE "id" = $1 RETURNING "id"',
    [id]
  );

  return Boolean(deleted);
};
