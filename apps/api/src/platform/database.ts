import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

export interface AppMetaTable {
  key: string;
  value: string;
  updated_at: Date;
}

export interface Database {
  app_meta: AppMetaTable;
}

export interface DatabaseLogger {
  error(obj: unknown, msg?: string): void;
  warn?(obj: unknown, msg?: string): void;
}

export function createDatabasePool(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

export function createDatabase(pool: Pool): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });
}

export async function checkDatabase(
  database: Kysely<Database>,
  logger?: DatabaseLogger,
): Promise<boolean> {
  try {
    await sql`select 1`.execute(database);
    return true;
  } catch (error: unknown) {
    if (logger) {
      logger.error({ err: error }, "database health check failed");
    }
    return false;
  }
}
