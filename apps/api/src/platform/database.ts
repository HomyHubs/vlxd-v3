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

export interface WarehouseTable {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface StockLevelTable {
  warehouse_id: string;
  product_id: string;
  quantity: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface StockReceiptTable {
  id: string;
  tenant_id: string;
  warehouse_id: string;
  receipt_number: string;
  status: Generated<string>;
  note: string | null;
  created_by: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface StockReceiptLineTable {
  id: string;
  stock_receipt_id: string;
  product_id: string;
  quantity: number;
  created_at: Generated<Date>;
}

export interface StockMovementTable {
  id: string;
  tenant_id: string;
  warehouse_id: string;
  product_id: string;
  quantity: number;
  type: string;
  reference_id: string;
  created_at: Generated<Date>;
}

export interface CustomerTable {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SalesOrderTable {
  id: string;
  tenant_id: string;
  order_number: string;
  customer_id: string;
  warehouse_id: string;
  status: Generated<string>;
  total_amount: number | string;
  note: string | null;
  created_by: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SalesOrderLineTable {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number | string;
  line_total: number | string;
  created_at: Generated<Date>;
}

export interface CapabilityTable {
  id: string;
  description: string;
  created_at: Generated<Date>;
}

export interface RoleGroupTable {
  id: string;
  code: string;
  name: string;
  created_at: Generated<Date>;
}

export interface RoleGroupCapabilityTable {
  role_group_id: string;
  capability_id: string;
}

export interface TitleTable {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TitleRoleGroupTable {
  title_id: string;
  role_group_id: string;
}

export interface UserTitleTable {
  user_id: string;
  title_id: string;
  tenant_id: string;
}

export interface PaymentTable {
  id: string;
  tenant_id: string;
  order_id: string;
  customer_id: string;
  amount: number | string;
  payment_method: "cash" | "bank_transfer";
  reference_code: string | null;
  note: string | null;
  created_by: string;
  idempotency_key: string | null;
  created_at: Generated<Date>;
}

export interface Database {
  app_meta: AppMetaTable;
  tenants: TenantTable;
  users: UserTable;
  sessions: SessionTable;
  units: UnitTable;
  products: ProductTable;
  warehouses: WarehouseTable;
  stock_levels: StockLevelTable;
  stock_receipts: StockReceiptTable;
  stock_receipt_lines: StockReceiptLineTable;
  stock_movements: StockMovementTable;
  customers: CustomerTable;
  sales_orders: SalesOrderTable;
  sales_order_lines: SalesOrderLineTable;
  capabilities: CapabilityTable;
  role_groups: RoleGroupTable;
  role_group_capabilities: RoleGroupCapabilityTable;
  titles: TitleTable;
  title_role_groups: TitleRoleGroupTable;
  user_titles: UserTitleTable;
  payments: PaymentTable;
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
