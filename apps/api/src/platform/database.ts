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

export async function checkDatabase(database: Kysely<Database>): Promise<boolean> {
  try {
    const result = await database
      .selectFrom("app_meta")
      .select(["key", "value"])
      .where("key", "=", "schema_version")
      .executeTakeFirst();

    if (result?.value !== "slice-0") {
      return false;
    }

    await sql`select 1`.execute(database);
    return true;
  } catch {
    return false;
  }
}
