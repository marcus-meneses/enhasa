import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import { env } from "../config/env";

export type QueryParams = readonly unknown[];

export interface QueryableDatabase {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: QueryParams): Promise<QueryResult<T>>;
  queryRows<T extends QueryResultRow = QueryResultRow>(sql: string, params?: QueryParams): Promise<T[]>;
  queryOne<T extends QueryResultRow = QueryResultRow>(sql: string, params?: QueryParams): Promise<T | null>;
}

export class Database implements QueryableDatabase {
  private readonly pool: Pool;

  constructor(config: PoolConfig = Database.configFromEnv()) {
    this.pool = new Pool(config);
  }

  static configFromEnv(): PoolConfig {
    return {
      host: env.database.host,
      port: env.database.port,
      database: env.database.name,
      user: env.database.user,
      password: env.database.password,
      ssl: env.database.ssl ? { rejectUnauthorized: false } : false,
      max: Number(process.env.POSTGRES_POOL_MAX ?? 10),
      idleTimeoutMillis: Number(process.env.POSTGRES_IDLE_TIMEOUT_MS ?? 30000),
      connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECTION_TIMEOUT_MS ?? 5000)
    };
  }

  query<T extends QueryResultRow = QueryResultRow>(sql: string, params: QueryParams = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, [...params]);
  }

  async queryRows<T extends QueryResultRow = QueryResultRow>(sql: string, params: QueryParams = []): Promise<T[]> {
    const result = await this.query<T>(sql, params);
    return result.rows;
  }

  async queryOne<T extends QueryResultRow = QueryResultRow>(sql: string, params: QueryParams = []): Promise<T | null> {
    const result = await this.query<T>(sql, params);
    return result.rows[0] ?? null;
  }

  async healthCheck(): Promise<boolean> {
    const result = await this.queryOne<{ ok: number }>("SELECT 1 AS ok");
    return result?.ok === 1;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export const database = new Database();
