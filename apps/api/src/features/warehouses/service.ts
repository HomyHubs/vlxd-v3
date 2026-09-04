import { randomUUID } from "node:crypto";

import {
  getPlanPolicy,
  type CreateWarehouseRequest,
  type Warehouse,
  type WarehouseListResponse,
} from "@vlxd/shared";
import { sql, type Kysely } from "kysely";

import type { Database } from "../../platform/database.js";

export type CreateWarehouseResult =
  | { success: true; warehouse: Warehouse }
  | {
      success: false;
      code: "WAREHOUSE_LIMIT_REACHED" | "WAREHOUSE_CODE_EXISTS";
      message: string;
    };

export interface WarehouseService {
  list(tenantId: string): Promise<WarehouseListResponse>;
  create(
    tenantId: string,
    tenantPlan: string,
    input: CreateWarehouseRequest,
  ): Promise<CreateWarehouseResult>;
}

export interface WarehouseServiceDependencies {
  database: Kysely<Database>;
  freePlanLimit?: number;
}

function toWarehouse(row: { id: string; code: string; name: string; createdAt: Date }): Warehouse {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export function createWarehouseService(
  dependencies: WarehouseServiceDependencies,
): WarehouseService {
  const db = dependencies.database;

  return {
    async list(tenantId) {
      const [rows, count] = await Promise.all([
        db
          .selectFrom("warehouses")
          .select(["id", "code", "name", "created_at as createdAt"])
          .where("tenant_id", "=", tenantId)
          .orderBy("created_at", "desc")
          .execute(),
        db
          .selectFrom("warehouses")
          .select(({ fn }) => fn.countAll<number>().as("count"))
          .where("tenant_id", "=", tenantId)
          .executeTakeFirstOrThrow(),
      ]);
      return { items: rows.map(toWarehouse), total: Number(count.count) };
    },

    async create(tenantId, tenantPlan, input) {
      return db.transaction().execute(async (trx) => {
        await sql`select pg_advisory_xact_lock(hashtext(${tenantId}))`.execute(trx);

        const planPolicy = getPlanPolicy(tenantPlan);
        const warehouseLimit = dependencies.freePlanLimit ?? planPolicy.limits.warehouses;

        if (warehouseLimit !== null) {
          const current = await trx
            .selectFrom("warehouses")
            .select(({ fn }) => fn.countAll<number>().as("count"))
            .where("tenant_id", "=", tenantId)
            .executeTakeFirstOrThrow();
          if (Number(current.count) >= warehouseLimit) {
            return {
              success: false,
              code: "WAREHOUSE_LIMIT_REACHED",
              message: `${planPolicy.planName} allows at most ${warehouseLimit} warehouses`,
            };
          }
        }

        try {
          const warehouse = await trx
            .insertInto("warehouses")
            .values({
              id: randomUUID(),
              tenant_id: tenantId,
              code: input.code.trim(),
              name: input.name.trim(),
            })
            .returning(["id", "code", "name", "created_at as createdAt"])
            .executeTakeFirstOrThrow();

          const products = await trx
            .selectFrom("products")
            .select("id")
            .where("tenant_id", "=", tenantId)
            .execute();
          if (products.length > 0) {
            await trx
              .insertInto("stock_levels")
              .values(
                products.map((product) => ({
                  warehouse_id: warehouse.id,
                  product_id: product.id,
                  quantity: 0,
                })),
              )
              .execute();
          }
          return { success: true, warehouse: toWarehouse(warehouse) };
        } catch (error: unknown) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505"
          ) {
            return {
              success: false,
              code: "WAREHOUSE_CODE_EXISTS",
              message: "Warehouse code already exists",
            };
          }
          throw error;
        }
      });
    },
  };
}
