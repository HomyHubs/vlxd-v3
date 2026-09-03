import { randomUUID } from "node:crypto";

import type {
  CreateStockReceiptRequest,
  StockReceiptDetailResponse,
  StockReceiptLine,
  StockReceiptListItem,
  StockReceiptListResponse,
} from "@vlxd/shared";
import type { Kysely } from "kysely";

import type { Database } from "../../platform/database.js";

export type CreateStockReceiptResult =
  | { success: true; receipt: StockReceiptDetailResponse }
  | {
      success: false;
      code: "WAREHOUSE_NOT_FOUND" | "PRODUCT_NOT_FOUND" | "INVALID_RECEIPT_LINES";
      message: string;
    };

export interface StockReceiptService {
  create(
    tenantId: string,
    userId: string,
    input: CreateStockReceiptRequest,
  ): Promise<CreateStockReceiptResult>;
  list(
    tenantId: string,
    query?: {
      page?: number | undefined;
      pageSize?: number | undefined;
      warehouseId?: string | undefined;
    },
  ): Promise<StockReceiptListResponse>;
  getById(tenantId: string, id: string): Promise<StockReceiptDetailResponse | null>;
}

export interface StockReceiptServiceDependencies {
  database: Kysely<Database>;
}

function generateReceiptNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PN-${dateStr}-${randomSuffix}`;
}

export function createStockReceiptService(
  dependencies: StockReceiptServiceDependencies,
): StockReceiptService {
  const db = dependencies.database;

  return {
    async create(tenantId, userId, input) {
      if (!input.lines || input.lines.length === 0) {
        return {
          success: false,
          code: "INVALID_RECEIPT_LINES",
          message: "Phiếu nhập phải có ít nhất 1 sản phẩm",
        };
      }

      // Check warehouse exists and belongs to tenant
      const warehouse = await db
        .selectFrom("warehouses")
        .select(["id", "code", "name"])
        .where("id", "=", input.warehouseId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!warehouse) {
        return {
          success: false,
          code: "WAREHOUSE_NOT_FOUND",
          message: "Kho không tồn tại hoặc không thuộc quyền quản lý",
        };
      }

      // Validate all products belong to tenant
      const productIds = Array.from(new Set(input.lines.map((l) => l.productId)));
      const products = await db
        .selectFrom("products")
        .innerJoin("units", "units.id", "products.unit_id")
        .select(["products.id", "products.sku", "products.name", "units.name as unitName"])
        .where("products.tenant_id", "=", tenantId)
        .where("products.id", "in", productIds)
        .execute();

      if (products.length !== productIds.length) {
        return {
          success: false,
          code: "PRODUCT_NOT_FOUND",
          message: "Một hoặc nhiều sản phẩm không tồn tại hoặc không thuộc tenant này",
        };
      }

      const productMap = new Map(products.map((p) => [p.id, p]));

      // Get user name for response
      const user = await db
        .selectFrom("users")
        .select(["full_name as fullName"])
        .where("id", "=", userId)
        .executeTakeFirst();

      const createdByName = user?.fullName ?? "Người dùng";

      // Execute transaction: create receipt + lines + movements + upsert stock levels
      return db.transaction().execute(async (trx) => {
        const receiptId = `sr-${randomUUID()}`;
        const receiptNumber = generateReceiptNumber();
        const now = new Date();

        await trx
          .insertInto("stock_receipts")
          .values({
            id: receiptId,
            tenant_id: tenantId,
            warehouse_id: input.warehouseId,
            receipt_number: receiptNumber,
            status: "completed",
            note: input.note ?? null,
            created_by: userId,
          })
          .execute();

        const createdLines: StockReceiptLine[] = [];
        let totalQuantity = 0;

        for (const line of input.lines) {
          const lineId = `srl-${randomUUID()}`;
          const prod = productMap.get(line.productId)!;

          await trx
            .insertInto("stock_receipt_lines")
            .values({
              id: lineId,
              stock_receipt_id: receiptId,
              product_id: line.productId,
              quantity: line.quantity,
            })
            .execute();

          const movementId = `sm-${randomUUID()}`;
          await trx
            .insertInto("stock_movements")
            .values({
              id: movementId,
              tenant_id: tenantId,
              warehouse_id: input.warehouseId,
              product_id: line.productId,
              quantity: line.quantity,
              type: "inbound_receipt",
              reference_id: receiptId,
            })
            .execute();

          // Upsert stock_level atomically
          await trx
            .insertInto("stock_levels")
            .values({
              warehouse_id: input.warehouseId,
              product_id: line.productId,
              quantity: line.quantity,
            })
            .onConflict((oc) =>
              oc.columns(["warehouse_id", "product_id"]).doUpdateSet((eb) => ({
                quantity: eb("stock_levels.quantity", "+", line.quantity),
                updated_at: now,
              })),
            )
            .execute();

          createdLines.push({
            id: lineId,
            productId: line.productId,
            productSku: prod.sku,
            productName: prod.name,
            unitName: prod.unitName,
            quantity: line.quantity,
          });

          totalQuantity += line.quantity;
        }

        const receiptDetail: StockReceiptDetailResponse = {
          id: receiptId,
          receiptNumber,
          warehouseId: warehouse.id,
          warehouseCode: warehouse.code,
          warehouseName: warehouse.name,
          status: "completed",
          note: input.note ?? null,
          createdByName,
          createdAt: now.toISOString(),
          totalQuantity,
          lines: createdLines,
        };

        return { success: true, receipt: receiptDetail };
      });
    },

    async list(tenantId, query) {
      const page = Math.max(1, query?.page ?? 1);
      const pageSize = Math.min(100, Math.max(1, query?.pageSize ?? 20));
      const offset = (page - 1) * pageSize;

      let baseQuery = db
        .selectFrom("stock_receipts")
        .innerJoin("warehouses", "warehouses.id", "stock_receipts.warehouse_id")
        .innerJoin("users", "users.id", "stock_receipts.created_by")
        .where("stock_receipts.tenant_id", "=", tenantId);

      if (query?.warehouseId) {
        baseQuery = baseQuery.where("stock_receipts.warehouse_id", "=", query.warehouseId);
      }

      const [countResult, rows] = await Promise.all([
        baseQuery.select(({ fn }) => fn.countAll<number>().as("count")).executeTakeFirstOrThrow(),
        baseQuery
          .select([
            "stock_receipts.id",
            "stock_receipts.receipt_number as receiptNumber",
            "stock_receipts.warehouse_id as warehouseId",
            "warehouses.code as warehouseCode",
            "warehouses.name as warehouseName",
            "stock_receipts.status",
            "stock_receipts.note",
            "users.full_name as createdByName",
            "stock_receipts.created_at as createdAt",
          ])
          .orderBy("stock_receipts.created_at", "desc")
          .limit(pageSize)
          .offset(offset)
          .execute(),
      ]);

      const total = Number(countResult.count);
      if (rows.length === 0) {
        return { items: [], page, pageSize, total };
      }

      // Query line statistics for the returned receipts
      const receiptIds = rows.map((r) => r.id);
      const lineStats = await db
        .selectFrom("stock_receipt_lines")
        .select([
          "stock_receipt_id as receiptId",
          ({ fn }) => fn.countAll<number>().as("itemCount"),
          ({ fn }) => fn.sum<number>("quantity").as("totalQuantity"),
        ])
        .where("stock_receipt_id", "in", receiptIds)
        .groupBy("stock_receipt_id")
        .execute();

      const statsMap = new Map(
        lineStats.map((s) => [
          s.receiptId,
          {
            itemCount: Number(s.itemCount ?? 0),
            totalQuantity: Number(s.totalQuantity ?? 0),
          },
        ]),
      );

      const items: StockReceiptListItem[] = rows.map((r) => {
        const stats = statsMap.get(r.id) ?? { itemCount: 0, totalQuantity: 0 };
        return {
          id: r.id,
          receiptNumber: r.receiptNumber,
          warehouseId: r.warehouseId,
          warehouseCode: r.warehouseCode,
          warehouseName: r.warehouseName,
          status: r.status,
          note: r.note,
          createdByName: r.createdByName,
          createdAt: r.createdAt.toISOString(),
          itemCount: stats.itemCount,
          totalQuantity: stats.totalQuantity,
        };
      });

      return { items, page, pageSize, total };
    },

    async getById(tenantId, id) {
      const receipt = await db
        .selectFrom("stock_receipts")
        .innerJoin("warehouses", "warehouses.id", "stock_receipts.warehouse_id")
        .innerJoin("users", "users.id", "stock_receipts.created_by")
        .select([
          "stock_receipts.id",
          "stock_receipts.receipt_number as receiptNumber",
          "stock_receipts.warehouse_id as warehouseId",
          "warehouses.code as warehouseCode",
          "warehouses.name as warehouseName",
          "stock_receipts.status",
          "stock_receipts.note",
          "users.full_name as createdByName",
          "stock_receipts.created_at as createdAt",
        ])
        .where("stock_receipts.id", "=", id)
        .where("stock_receipts.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!receipt) {
        return null;
      }

      const lines = await db
        .selectFrom("stock_receipt_lines")
        .innerJoin("products", "products.id", "stock_receipt_lines.product_id")
        .innerJoin("units", "units.id", "products.unit_id")
        .select([
          "stock_receipt_lines.id",
          "stock_receipt_lines.product_id as productId",
          "products.sku as productSku",
          "products.name as productName",
          "units.name as unitName",
          "stock_receipt_lines.quantity",
        ])
        .where("stock_receipt_lines.stock_receipt_id", "=", id)
        .execute();

      const receiptLines: StockReceiptLine[] = lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        productSku: l.productSku,
        productName: l.productName,
        unitName: l.unitName,
        quantity: l.quantity,
      }));

      const totalQuantity = receiptLines.reduce((sum, l) => sum + l.quantity, 0);

      return {
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        warehouseId: receipt.warehouseId,
        warehouseCode: receipt.warehouseCode,
        warehouseName: receipt.warehouseName,
        status: receipt.status,
        note: receipt.note,
        createdByName: receipt.createdByName,
        createdAt: receipt.createdAt.toISOString(),
        totalQuantity,
        lines: receiptLines,
      };
    },
  };
}
