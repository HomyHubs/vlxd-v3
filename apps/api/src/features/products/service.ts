import { randomUUID } from "node:crypto";

import {
  getPlanPolicy,
  type CreateProductRequest,
  type Product,
  type ProductListQuery,
  type ProductListResponse,
} from "@vlxd/shared";
import { sql, type Kysely } from "kysely";

import type { Database } from "../../platform/database.js";

export type CreateProductResult =
  | { success: true; product: Product }
  | {
      success: false;
      code: "PRODUCT_LIMIT_REACHED" | "PRODUCT_SKU_EXISTS" | "UNIT_NOT_FOUND";
      message: string;
    };

export interface ProductService {
  list(tenantId: string, query: ProductListQuery): Promise<ProductListResponse>;
  create(
    tenantId: string,
    tenantPlan: string,
    input: CreateProductRequest,
  ): Promise<CreateProductResult>;
}

export interface ProductServiceDependencies {
  database: Kysely<Database>;
  freePlanLimit?: number;
}

function toProduct(row: {
  id: string;
  sku: string;
  name: string;
  unitCode: Product["unitCode"];
  unitName: string;
  createdAt: Date;
  stockLevels?: Product["stockLevels"];
}): Product {
  return { ...row, createdAt: row.createdAt.toISOString(), stockLevels: row.stockLevels ?? [] };
}

export function createProductService(dependencies: ProductServiceDependencies): ProductService {
  const db = dependencies.database;

  return {
    async list(tenantId, query) {
      const search = query.search?.trim();
      let productsQuery = db
        .selectFrom("products")
        .innerJoin("units", "units.id", "products.unit_id")
        .select([
          "products.id",
          "products.sku",
          "products.name",
          "units.code as unitCode",
          "units.name as unitName",
          "products.created_at as createdAt",
        ])
        .where("products.tenant_id", "=", tenantId);
      let countQuery = db
        .selectFrom("products")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .where("tenant_id", "=", tenantId);

      if (search) {
        const pattern = `%${search}%`;
        productsQuery = productsQuery.where((eb) =>
          eb.or([eb("products.sku", "ilike", pattern), eb("products.name", "ilike", pattern)]),
        );
        countQuery = countQuery.where((eb) =>
          eb.or([eb("sku", "ilike", pattern), eb("name", "ilike", pattern)]),
        );
      }

      const [rows, count] = await Promise.all([
        productsQuery
          .orderBy("products.created_at", "desc")
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize)
          .execute(),
        countQuery.executeTakeFirstOrThrow(),
      ]);
      const stockRows = rows.length
        ? await db
            .selectFrom("stock_levels")
            .innerJoin("warehouses", "warehouses.id", "stock_levels.warehouse_id")
            .select([
              "stock_levels.product_id as productId",
              "stock_levels.quantity as quantity",
              "warehouses.id as warehouseId",
              "warehouses.code as warehouseCode",
            ])
            .where(
              "stock_levels.product_id",
              "in",
              rows.map((row) => row.id),
            )
            .where("warehouses.tenant_id", "=", tenantId)
            .execute()
        : [];
      const stockByProduct = new Map<string, Product["stockLevels"]>();
      for (const stock of stockRows) {
        const levels = stockByProduct.get(stock.productId) ?? [];
        levels.push({
          warehouseId: stock.warehouseId,
          warehouseCode: stock.warehouseCode,
          quantity: stock.quantity,
        });
        stockByProduct.set(stock.productId, levels);
      }

      return {
        items: rows.map((row) =>
          toProduct({
            ...row,
            unitCode: row.unitCode as Product["unitCode"],
            stockLevels: stockByProduct.get(row.id) ?? [],
          }),
        ),
        page: query.page,
        pageSize: query.pageSize,
        total: Number(count.count),
      };
    },

    async create(tenantId, tenantPlan, input) {
      return db.transaction().execute(async (trx) => {
        await sql`select pg_advisory_xact_lock(hashtext(${tenantId}))`.execute(trx);

        const planPolicy = getPlanPolicy(tenantPlan);
        const productLimit = dependencies.freePlanLimit ?? planPolicy.limits.products;

        if (productLimit !== null) {
          const current = await trx
            .selectFrom("products")
            .select(({ fn }) => fn.countAll<number>().as("count"))
            .where("tenant_id", "=", tenantId)
            .executeTakeFirstOrThrow();
          if (Number(current.count) >= productLimit) {
            return {
              success: false,
              code: "PRODUCT_LIMIT_REACHED",
              message: `${planPolicy.planName} chỉ cho phép tối đa ${productLimit} sản phẩm`,
            };
          }
        }

        const unit = await trx
          .selectFrom("units")
          .selectAll()
          .where("code", "=", input.unitCode)
          .executeTakeFirst();
        if (!unit) {
          return { success: false, code: "UNIT_NOT_FOUND", message: "Đơn vị không tồn tại" };
        }

        try {
          const row = await trx
            .insertInto("products")
            .values({
              id: randomUUID(),
              tenant_id: tenantId,
              unit_id: unit.id,
              sku: input.sku.trim(),
              name: input.name.trim(),
            })
            .returning(["id", "sku", "name", "created_at as createdAt"])
            .executeTakeFirstOrThrow();
          return {
            success: true,
            product: toProduct({
              ...row,
              unitCode: input.unitCode,
              unitName: unit.name,
              stockLevels: [],
            }),
          };
        } catch (error: unknown) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "23505"
          ) {
            return {
              success: false,
              code: "PRODUCT_SKU_EXISTS",
              message: "Mã sản phẩm đã tồn tại",
            };
          }
          throw error;
        }
      });
    },
  };
}
