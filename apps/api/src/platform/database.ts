import { type Generated, Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

export interface AppMetaTable {
  key: string;
  value: string;
  updated_at: Generated<Date>;
}

export interface TenantTable {
  id: string;
  name: string;
  code: string;
  plan: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserTable {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  password_hash: string;
  status: Generated<"active" | "inactive">;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SessionTable {
  id: string;
  user_id: string;
  tenant_id: string;
  expires_at: Date;
  created_at: Generated<Date>;
}

export interface UnitTable {
  id: string;
  code: string;
  name: string;
  created_at: Generated<Date>;
}

export interface ProductTable {
  id: string;
  tenant_id: string;
  unit_id: string;
  sku: string;
  name: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Database {
  app_meta: AppMetaTable;
  tenants: TenantTable;
  users: UserTable;
  sessions: SessionTable;
  units: UnitTable;
  products: ProductTable;
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
