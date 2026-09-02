import { randomUUID } from "node:crypto";

import type {
  CreateProductRequest,
  Product,
  ProductListQuery,
  ProductListResponse,
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
}): Product {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export function createProductService(dependencies: ProductServiceDependencies): ProductService {
  const db = dependencies.database;
  const freePlanLimit = dependencies.freePlanLimit ?? 80;

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

      return {
        items: rows.map((row) =>
          toProduct({ ...row, unitCode: row.unitCode as Product["unitCode"] }),
        ),
        page: query.page,
        pageSize: query.pageSize,
        total: Number(count.count),
      };
    },

    async create(tenantId, tenantPlan, input) {
      return db.transaction().execute(async (trx) => {
        await sql`select pg_advisory_xact_lock(hashtext(${tenantId}))`.execute(trx);

        if (tenantPlan === "free") {
          const current = await trx
            .selectFrom("products")
            .select(({ fn }) => fn.countAll<number>().as("count"))
            .where("tenant_id", "=", tenantId)
            .executeTakeFirstOrThrow();
          if (Number(current.count) >= freePlanLimit) {
            return {
              success: false,
              code: "PRODUCT_LIMIT_REACHED",
              message: `Gói Free chỉ cho phép tối đa ${freePlanLimit} sản phẩm`,
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
            product: toProduct({ ...row, unitCode: input.unitCode, unitName: unit.name }),
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
