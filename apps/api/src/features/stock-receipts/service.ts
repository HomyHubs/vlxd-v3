import { randomBytes, randomUUID } from "node:crypto";

import {
  MAX_STOCK_LEVEL_QUANTITY,
  MAX_STOCK_RECEIPT_LINE_QUANTITY,
  type CreateStockReceiptRequest,
  type StockReceiptDetailResponse,
  type StockReceiptLine,
  type StockReceiptListItem,
  type StockReceiptListResponse,
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
  const randomSuffix = randomBytes(4).toString("hex").toUpperCase();
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

      // Aggregate requested quantities per product and validate safe integer / domain bounds
      const aggregatedQuantities = new Map<string, number>();
      for (const line of input.lines) {
        const nextQty = (aggregatedQuantities.get(line.productId) ?? 0) + line.quantity;
        if (!Number.isSafeInteger(nextQty) || nextQty > MAX_STOCK_RECEIPT_LINE_QUANTITY) {
          return {
            success: false,
            code: "INVALID_RECEIPT_LINES",
            message: `Tổng số lượng nhập cho một sản phẩm không được vượt quá ${MAX_STOCK_RECEIPT_LINE_QUANTITY.toLocaleString()}`,
          };
        }
        aggregatedQuantities.set(line.productId, nextQty);
      }

      // Get user name for response
      const user = await db
        .selectFrom("users")
        .select(["full_name as fullName"])
        .where("id", "=", userId)
        .executeTakeFirst();

      const createdByName = user?.fullName ?? "Người dùng";

      // Execute transaction with collision retry for receipt_number
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          return await db.transaction().execute(async (trx) => {
            const receiptId = `sr-${randomUUID()}`;
            const receiptNumber = generateReceiptNumber();
            const now = new Date();

            // Lock and inspect existing stock levels to guarantee cumulative quantity <= MAX_STOCK_LEVEL_QUANTITY
            const existingStocks = await trx
              .selectFrom("stock_levels")
              .select(["product_id as productId", "quantity"])
              .where("warehouse_id", "=", input.warehouseId)
              .where("product_id", "in", Array.from(aggregatedQuantities.keys()))
              .forUpdate()
              .execute();

            const existingStockMap = new Map(existingStocks.map((s) => [s.productId, s.quantity]));

            for (const [productId, addQty] of aggregatedQuantities) {
              const currentQty = existingStockMap.get(productId) ?? 0;
              if (currentQty + addQty > MAX_STOCK_LEVEL_QUANTITY) {
                const prod = productMap.get(productId);
                return {
                  success: false as const,
                  code: "INVALID_RECEIPT_LINES" as const,
                  message: `Tồn kho sau khi nhập của sản phẩm "${prod?.name ?? productId}" vượt quá giới hạn tối đa (${MAX_STOCK_LEVEL_QUANTITY.toLocaleString()})`,
                };
              }
            }

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
        } catch (error: unknown) {
          const isUniqueViolation =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            (error as { code?: string }).code === "23505" &&
            "constraint" in error &&
            (error as { constraint?: string }).constraint === "stock_receipts_tenant_number_unique";

          if (isUniqueViolation && attempt < MAX_ATTEMPTS) {
            continue;
          }
          throw error;
        }
      }

      throw new Error("Không thể tạo mã phiếu nhập sau nhiều lần thử");
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
