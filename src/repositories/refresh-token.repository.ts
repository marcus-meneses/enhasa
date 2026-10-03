import { createHash, randomBytes } from "crypto";
import { database } from "../database";

const REFRESH_TOKEN_BYTES = 48;
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS ?? 30);

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  app: string;
  expiresAt: Date;
}

const hashRefreshToken = (refreshToken: string): string =>
  createHash("sha256").update(refreshToken).digest("hex");

const refreshTokenExpiresAt = (): Date => {
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + REFRESH_TOKEN_TTL_DAYS);
  return expiresAt;
};

export const createRefreshToken = async (userId: string, app: string): Promise<{ refreshToken: string; expiresAt: Date }> => {
  const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
  const expiresAt = refreshTokenExpiresAt();

  await database.query(
    "INSERT INTO \"generalData\".\"authRefreshTokens\" (\"tokenHash\", \"userId\", \"app\", \"expiresAt\") VALUES ($1, $2, $3, $4)",
    [hashRefreshToken(refreshToken), userId, app, expiresAt]
  );

  return { refreshToken, expiresAt };
};

export const deleteRefreshTokensForUserApp = async (userId: string, app: string): Promise<number> => {
  const result = await database.query(
    "DELETE FROM \"generalData\".\"authRefreshTokens\" WHERE \"userId\" = $1 AND \"app\" = $2",
    [userId, app]
  );
  return result.rowCount ?? 0;
};

export const consumeRefreshToken = async (refreshToken: string, app?: string): Promise<RefreshTokenRecord | null> => {
  const consumed = await database.queryOne<RefreshTokenRecord>(
    `
      DELETE FROM \"generalData\".\"authRefreshTokens\"
      WHERE \"tokenHash\" = $1
        AND ($2::text IS NULL OR \"app\" = $2)
        AND \"revokedAt\" IS NULL
        AND \"expiresAt\" > CURRENT_TIMESTAMP
      RETURNING \"id\", \"userId\" AS \"userId\", \"app\", \"expiresAt\"
    `,
    [hashRefreshToken(refreshToken), app ?? null]
  );

  return consumed;
};

export const revokeRefreshToken = async (refreshToken: string, app?: string): Promise<boolean> => {
  const revoked = await database.queryOne<{ id: string }>(
    `
      DELETE FROM \"generalData\".\"authRefreshTokens\"
      WHERE \"tokenHash\" = $1
        AND ($2::text IS NULL OR \"app\" = $2)
      RETURNING \"id\"
    `,
    [hashRefreshToken(refreshToken), app ?? null]
  );

  return Boolean(revoked);
};
