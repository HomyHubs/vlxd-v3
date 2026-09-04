import { randomBytes, randomUUID } from "node:crypto";

import {
  MAX_STOCK_TRANSFER_LINE_QUANTITY,
  type CreateStockTransferRequest,
  type StockTransferDetailResponse,
  type StockTransferLine,
  type StockTransferListItem,
  type StockTransferListResponse,
} from "@vlxd/shared";
import { type Kysely, sql } from "kysely";

import type { Database } from "../../platform/database.js";

export class InsufficientStockError extends Error {
  constructor(
    message: string,
    public readonly details?: {
      productId: string;
      productName: string;
      availableQuantity: number;
      requestedQuantity: number;
    },
  ) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

export type CreateStockTransferResult =
  | { success: true; transfer: StockTransferDetailResponse }
  | {
      success: false;
      code:
        | "SAME_WAREHOUSE_NOT_ALLOWED"
        | "WAREHOUSE_NOT_FOUND"
        | "PRODUCT_NOT_FOUND"
        | "INVALID_TRANSFER_LINES"
        | "INSUFFICIENT_STOCK";
      message: string;
      details?: Record<string, unknown> | undefined;
    };

export interface StockTransferService {
  create(
    tenantId: string,
    userId: string,
    input: CreateStockTransferRequest,
  ): Promise<CreateStockTransferResult>;
  list(
    tenantId: string,
    query?: {
      page?: number | undefined;
      pageSize?: number | undefined;
      sourceWarehouseId?: string | undefined;
      destinationWarehouseId?: string | undefined;
    },
  ): Promise<StockTransferListResponse>;
  getById(tenantId: string, id: string): Promise<StockTransferDetailResponse | null>;
}

export interface StockTransferServiceDependencies {
  database: Kysely<Database>;
}

function generateTransferNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const timeSuffix = Date.now().toString(36).slice(-4).toUpperCase();
  const randomSuffix = randomBytes(3).toString("hex").toUpperCase();
  return `TRF-${dateStr}-${timeSuffix}${randomSuffix}`;
}

export function createStockTransferService(
  dependencies: StockTransferServiceDependencies,
): StockTransferService {
  const db = dependencies.database;

  return {
    async create(tenantId, userId, input) {
      if (input.sourceWarehouseId === input.destinationWarehouseId) {
        return {
          success: false,
          code: "SAME_WAREHOUSE_NOT_ALLOWED",
          message: "Kho xuất và kho nhập không được trùng nhau",
        };
      }

      if (!input.lines || input.lines.length === 0) {
        return {
          success: false,
          code: "INVALID_TRANSFER_LINES",
          message: "Phiếu chuyển kho phải có ít nhất 1 sản phẩm",
        };
      }

      // Check both source and destination warehouses belong to tenant
      const warehouses = await db
        .selectFrom("warehouses")
        .select(["id", "code", "name"])
        .where("id", "in", [input.sourceWarehouseId, input.destinationWarehouseId])
        .where("tenant_id", "=", tenantId)
        .execute();

      if (warehouses.length < 2) {
        return {
          success: false,
          code: "WAREHOUSE_NOT_FOUND",
          message: "Kho xuất hoặc kho nhập không tồn tại hoặc không thuộc quyền quản lý",
        };
      }

      const sourceWarehouse = warehouses.find((w) => w.id === input.sourceWarehouseId)!;
      const destinationWarehouse = warehouses.find((w) => w.id === input.destinationWarehouseId)!;

      // Validate all products belong to tenant
      const productIds = Array.from(new Set(input.lines.map((l) => l.productId)));
      const products = await db
        .selectFrom("products")
        .innerJoin("units", "units.id", "products.unit_id")
        .select([
          "products.id as id",
          "products.sku as sku",
          "products.name as name",
          "units.name as unitName",
        ])
        .where("products.id", "in", productIds)
        .where("products.tenant_id", "=", tenantId)
        .execute();

      if (products.length !== productIds.length) {
        return {
          success: false,
          code: "PRODUCT_NOT_FOUND",
          message: "Một hoặc nhiều sản phẩm không tồn tại hoặc không thuộc cửa hàng",
        };
      }

      const productMap = new Map(products.map((p) => [p.id, p]));

      // Aggregate requested quantities per product and validate safe bounds
      const requestedQuantities = new Map<string, number>();
      for (const line of input.lines) {
        const nextQty = (requestedQuantities.get(line.productId) ?? 0) + line.quantity;
        if (!Number.isSafeInteger(nextQty) || nextQty > MAX_STOCK_TRANSFER_LINE_QUANTITY) {
          return {
            success: false,
            code: "INVALID_TRANSFER_LINES",
            message: `Tổng số lượng sản phẩm chuyển không được vượt quá ${MAX_STOCK_TRANSFER_LINE_QUANTITY.toLocaleString()}`,
          };
        }
        requestedQuantities.set(line.productId, nextQty);
      }

      // Deterministic sort product IDs to prevent deadlock on concurrent transfers
      const sortedProductIds = Array.from(requestedQuantities.keys()).sort();

      // Get user name for response
      const user = await db
        .selectFrom("users")
        .select(["full_name as fullName"])
        .where("id", "=", userId)
        .executeTakeFirst();

      const createdByName = user?.fullName ?? "Người dùng";

      // Execute transaction with retry on unique transfer_number collision
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          return await db.transaction().execute(async (trx) => {
            const transferId = `trf-${randomUUID()}`;
            const transferNumber = generateTransferNumber();
            const now = new Date();

            // 1. Deduct stock at source warehouse atomically with sufficiency check
            for (const productId of sortedProductIds) {
              const reqQty = requestedQuantities.get(productId)!;
              const updateResult = await trx
                .updateTable("stock_levels")
                .set((eb) => ({
                  quantity: eb("stock_levels.quantity", "-", reqQty),
                  updated_at: now,
                }))
                .where("warehouse_id", "=", input.sourceWarehouseId)
                .where("product_id", "=", productId)
                .where("quantity", ">=", reqQty)
                .executeTakeFirst();

              if (Number(updateResult.numUpdatedRows ?? 0) === 0) {
                const currentStockRow = await trx
                  .selectFrom("stock_levels")
                  .select("quantity")
                  .where("warehouse_id", "=", input.sourceWarehouseId)
                  .where("product_id", "=", productId)
                  .executeTakeFirst();
                const currentStock = currentStockRow?.quantity ?? 0;
                const prod = productMap.get(productId);
                throw new InsufficientStockError(
                  `Sản phẩm "${prod?.name ?? productId}" tại ${sourceWarehouse.name} không đủ tồn kho (cần ${reqQty}, hiện có ${currentStock})`,
                  {
                    productId,
                    productName: prod?.name ?? productId,
                    availableQuantity: currentStock,
                    requestedQuantity: reqQty,
                  },
                );
              }
            }

            // 2. Increment stock at destination warehouse atomically with UPSERT
            for (const productId of sortedProductIds) {
              const reqQty = requestedQuantities.get(productId)!;
              await sql`
                INSERT INTO stock_levels (warehouse_id, product_id, quantity, updated_at)
                VALUES (${input.destinationWarehouseId}, ${productId}, ${reqQty}, ${now})
                ON CONFLICT (warehouse_id, product_id)
                DO UPDATE SET
                  quantity = stock_levels.quantity + EXCLUDED.quantity,
                  updated_at = EXCLUDED.updated_at
              `.execute(trx);
            }

            // 3. Create stock transfer record
            await trx
              .insertInto("stock_transfers")
              .values({
                id: transferId,
                tenant_id: tenantId,
                transfer_number: transferNumber,
                source_warehouse_id: input.sourceWarehouseId,
                destination_warehouse_id: input.destinationWarehouseId,
                status: "completed",
                note: input.note ?? null,
                created_by: userId,
              })
              .execute();

            // 4. Create stock transfer lines & stock movements
            const createdLines: StockTransferLine[] = [];
            let totalQuantity = 0;

            for (const [productId, reqQty] of requestedQuantities.entries()) {
              const lineId = `trfl-${randomUUID()}`;
              const prod = productMap.get(productId)!;

              await trx
                .insertInto("stock_transfer_lines")
                .values({
                  id: lineId,
                  transfer_id: transferId,
                  product_id: productId,
                  quantity: reqQty.toString(),
                })
                .execute();

              // Outbound movement from source warehouse
              const outMovementId = `sm-${randomUUID()}`;
              await trx
                .insertInto("stock_movements")
                .values({
                  id: outMovementId,
                  tenant_id: tenantId,
                  warehouse_id: input.sourceWarehouseId,
                  product_id: productId,
                  quantity: -reqQty,
                  type: "transfer_out",
                  reference_id: transferId,
                })
                .execute();

              // Inbound movement to destination warehouse
              const inMovementId = `sm-${randomUUID()}`;
              await trx
                .insertInto("stock_movements")
                .values({
                  id: inMovementId,
                  tenant_id: tenantId,
                  warehouse_id: input.destinationWarehouseId,
                  product_id: productId,
                  quantity: reqQty,
                  type: "transfer_in",
                  reference_id: transferId,
                })
                .execute();

              createdLines.push({
                id: lineId,
                productId,
                productSku: prod.sku,
                productName: prod.name,
                unitName: prod.unitName,
                quantity: reqQty,
              });

              totalQuantity += reqQty;
            }

            return {
              success: true,
              transfer: {
                id: transferId,
                transferNumber,
                sourceWarehouseId: input.sourceWarehouseId,
                sourceWarehouseCode: sourceWarehouse.code,
                sourceWarehouseName: sourceWarehouse.name,
                destinationWarehouseId: input.destinationWarehouseId,
                destinationWarehouseCode: destinationWarehouse.code,
                destinationWarehouseName: destinationWarehouse.name,
                status: "completed",
                note: input.note ?? null,
                createdByName,
                createdAt: now.toISOString(),
                totalQuantity,
                lines: createdLines,
              },
            };
          });
        } catch (error: unknown) {
          if (error instanceof InsufficientStockError) {
            return {
              success: false,
              code: "INSUFFICIENT_STOCK",
              message: error.message,
              details: error.details,
            };
          }

          // Retry on unique violation for transfer_number collision
          const isUniqueViolation =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            (error as { code: string }).code === "23505";

          if (isUniqueViolation && attempt < MAX_ATTEMPTS) {
            continue;
          }

          throw error;
        }
      }

      throw new Error("Không thể tạo phiếu chuyển kho sau nhiều lần thử lại");
    },

    async list(tenantId, query) {
      const page = query?.page ?? 1;
      const pageSize = query?.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      let baseQuery = db
        .selectFrom("stock_transfers as st")
        .innerJoin("warehouses as sw", "sw.id", "st.source_warehouse_id")
        .innerJoin("warehouses as dw", "dw.id", "st.destination_warehouse_id")
        .innerJoin("users as u", "u.id", "st.created_by")
        .where("st.tenant_id", "=", tenantId);

      if (query?.sourceWarehouseId) {
        baseQuery = baseQuery.where("st.source_warehouse_id", "=", query.sourceWarehouseId);
      }
      if (query?.destinationWarehouseId) {
        baseQuery = baseQuery.where(
          "st.destination_warehouse_id",
          "=",
          query.destinationWarehouseId,
        );
      }

      const countResult = await baseQuery
        .select((eb) => eb.fn.count<string>("st.id").as("total"))
        .executeTakeFirst();
      const total = Number(countResult?.total ?? 0);

      const rows = await baseQuery
        .select([
          "st.id as id",
          "st.transfer_number as transferNumber",
          "st.source_warehouse_id as sourceWarehouseId",
          "sw.code as sourceWarehouseCode",
          "sw.name as sourceWarehouseName",
          "st.destination_warehouse_id as destinationWarehouseId",
          "dw.code as destinationWarehouseCode",
          "dw.name as destinationWarehouseName",
          "st.status as status",
          "st.note as note",
          "u.full_name as createdByName",
          "st.created_at as createdAt",
          (eb) =>
            eb
              .selectFrom("stock_transfer_lines")
              .select(eb.fn.count<string>("id").as("count"))
              .whereRef("transfer_id", "=", "st.id")
              .as("itemCount"),
          (eb) =>
            eb
              .selectFrom("stock_transfer_lines")
              .select(sql<string>`COALESCE(SUM(quantity), 0)`.as("sum"))
              .whereRef("transfer_id", "=", "st.id")
              .as("totalQuantity"),
        ])
        .orderBy("st.created_at", "desc")
        .limit(pageSize)
        .offset(offset)
        .execute();

      const items: StockTransferListItem[] = rows.map((r) => ({
        id: r.id,
        transferNumber: r.transferNumber,
        sourceWarehouseId: r.sourceWarehouseId,
        sourceWarehouseCode: r.sourceWarehouseCode,
        sourceWarehouseName: r.sourceWarehouseName,
        destinationWarehouseId: r.destinationWarehouseId,
        destinationWarehouseCode: r.destinationWarehouseCode,
        destinationWarehouseName: r.destinationWarehouseName,
        status: r.status,
        note: r.note,
        createdByName: r.createdByName,
        createdAt: new Date(r.createdAt).toISOString(),
        itemCount: Number(r.itemCount ?? 0),
        totalQuantity: Number(r.totalQuantity ?? 0),
      }));

      return {
        items,
        page,
        pageSize,
        total,
      };
    },

    async getById(tenantId, id) {
      const transfer = await db
        .selectFrom("stock_transfers as st")
        .innerJoin("warehouses as sw", "sw.id", "st.source_warehouse_id")
        .innerJoin("warehouses as dw", "dw.id", "st.destination_warehouse_id")
        .innerJoin("users as u", "u.id", "st.created_by")
        .select([
          "st.id as id",
          "st.transfer_number as transferNumber",
          "st.source_warehouse_id as sourceWarehouseId",
          "sw.code as sourceWarehouseCode",
          "sw.name as sourceWarehouseName",
          "st.destination_warehouse_id as destinationWarehouseId",
          "dw.code as destinationWarehouseCode",
          "dw.name as destinationWarehouseName",
          "st.status as status",
          "st.note as note",
          "u.full_name as createdByName",
          "st.created_at as createdAt",
        ])
        .where("st.id", "=", id)
        .where("st.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!transfer) {
        return null;
      }

      const lines = await db
        .selectFrom("stock_transfer_lines as stl")
        .innerJoin("products as p", "p.id", "stl.product_id")
        .innerJoin("units as u", "u.id", "p.unit_id")
        .select([
          "stl.id as id",
          "p.id as productId",
          "p.sku as productSku",
          "p.name as productName",
          "u.name as unitName",
          "stl.quantity as quantity",
        ])
        .where("stl.transfer_id", "=", id)
        .execute();

      let totalQuantity = 0;
      const formattedLines: StockTransferLine[] = lines.map((l) => {
        const qty = Number(l.quantity);
        totalQuantity += qty;
        return {
          id: l.id,
          productId: l.productId,
          productSku: l.productSku,
          productName: l.productName,
          unitName: l.unitName,
          quantity: qty,
        };
      });

      return {
        id: transfer.id,
        transferNumber: transfer.transferNumber,
        sourceWarehouseId: transfer.sourceWarehouseId,
        sourceWarehouseCode: transfer.sourceWarehouseCode,
        sourceWarehouseName: transfer.sourceWarehouseName,
        destinationWarehouseId: transfer.destinationWarehouseId,
        destinationWarehouseCode: transfer.destinationWarehouseCode,
        destinationWarehouseName: transfer.destinationWarehouseName,
        status: transfer.status,
        note: transfer.note,
        createdByName: transfer.createdByName,
        createdAt: new Date(transfer.createdAt).toISOString(),
        totalQuantity,
        lines: formattedLines,
      };
    },
  };
}
