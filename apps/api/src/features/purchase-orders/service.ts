import { randomUUID } from "node:crypto";
import type { CreatePurchaseOrderRequest, PurchaseOrder } from "@vlxd/shared";
import type { Kysely } from "kysely";
import type { Database } from "../../platform/database.js";

const toSafe = (v: number | string) => {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isSafeInteger(n) ? n : 0;
};
export type PurchaseOrderResult =
  | { success: true; order: PurchaseOrder }
  | {
      success: false;
      code:
        "SUPPLIER_NOT_FOUND" | "WAREHOUSE_NOT_FOUND" | "PRODUCT_NOT_FOUND" | "INVALID_ORDER_LINES";
      message: string;
    };
export interface PurchaseOrderService {
  create(
    tenantId: string,
    userId: string,
    input: CreatePurchaseOrderRequest,
  ): Promise<PurchaseOrderResult>;
  list(
    tenantId: string,
    query: { page: number; pageSize: number },
  ): Promise<{
    items: Omit<PurchaseOrder, "lines">[];
    page: number;
    pageSize: number;
    total: number;
  }>;
  getById(tenantId: string, id: string): Promise<PurchaseOrder | null>;
}
export interface PurchaseOrderServiceDependencies {
  database: Kysely<Database>;
}

export function createPurchaseOrderService({
  database: db,
}: PurchaseOrderServiceDependencies): PurchaseOrderService {
  const detail = async (
    tenantId: string,
    id: string,
    database = db,
  ): Promise<PurchaseOrder | null> => {
    const row = await database
      .selectFrom("purchase_orders as po")
      .innerJoin("suppliers as s", "s.id", "po.supplier_id")
      .innerJoin("warehouses as w", "w.id", "po.warehouse_id")
      .innerJoin("users as u", "u.id", "po.created_by")
      .select([
        "po.id",
        "po.order_number as orderNumber",
        "po.supplier_id as supplierId",
        "s.code as supplierCode",
        "s.name as supplierName",
        "po.warehouse_id as warehouseId",
        "w.code as warehouseCode",
        "w.name as warehouseName",
        "po.status",
        "po.total_amount as totalAmount",
        "po.note",
        "u.full_name as createdByName",
        "po.created_at as createdAt",
      ])
      .where("po.tenant_id", "=", tenantId)
      .where("po.id", "=", id)
      .executeTakeFirst();
    if (!row) return null;
    const lines = await database
      .selectFrom("purchase_order_lines as l")
      .innerJoin("products as p", "p.id", "l.product_id")
      .innerJoin("units as un", "un.id", "p.unit_id")
      .select([
        "l.id",
        "l.product_id as productId",
        "p.sku as productSku",
        "p.name as productName",
        "un.name as unitName",
        "l.quantity",
        "l.unit_cost as unitCost",
        "l.line_total as lineTotal",
      ])
      .where("l.purchase_order_id", "=", id)
      .orderBy("l.created_at", "asc")
      .execute();
    return {
      ...row,
      totalAmount: toSafe(row.totalAmount),
      createdAt: row.createdAt.toISOString(),
      lines: lines.map((l) => ({
        ...l,
        quantity: toSafe(l.quantity),
        unitCost: toSafe(l.unitCost),
        lineTotal: toSafe(l.lineTotal),
      })),
    };
  };
  return {
    async create(tenantId, userId, input) {
      if (new Set(input.lines.map((l) => l.productId)).size !== input.lines.length)
        return {
          success: false,
          code: "INVALID_ORDER_LINES",
          message: "Sản phẩm trong đơn mua không được trùng",
        };
      const supplier = await db
        .selectFrom("suppliers")
        .select("id")
        .where("tenant_id", "=", tenantId)
        .where("id", "=", input.supplierId)
        .executeTakeFirst();
      if (!supplier)
        return {
          success: false,
          code: "SUPPLIER_NOT_FOUND",
          message: "Nhà cung cấp không tồn tại",
        };
      const warehouse = await db
        .selectFrom("warehouses")
        .select("id")
        .where("tenant_id", "=", tenantId)
        .where("id", "=", input.warehouseId)
        .executeTakeFirst();
      if (!warehouse)
        return { success: false, code: "WAREHOUSE_NOT_FOUND", message: "Kho không tồn tại" };
      const products = await db
        .selectFrom("products")
        .select(["id", "sku", "name"])
        .where("tenant_id", "=", tenantId)
        .where(
          "id",
          "in",
          input.lines.map((l) => l.productId),
        )
        .execute();
      if (products.length !== input.lines.length)
        return {
          success: false,
          code: "PRODUCT_NOT_FOUND",
          message: "Một hoặc nhiều sản phẩm không tồn tại",
        };
      const totals = input.lines.map((l) => l.quantity * l.unitCost);
      const total = totals.reduce((a, b) => a + b, 0);
      if (!Number.isSafeInteger(total))
        return {
          success: false,
          code: "INVALID_ORDER_LINES",
          message: "Tổng tiền vượt giới hạn an toàn",
        };
      const id = `po-${randomUUID()}`;
      const orderNumber = `PO-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("purchase_orders")
          .values({
            id,
            tenant_id: tenantId,
            supplier_id: input.supplierId,
            warehouse_id: input.warehouseId,
            order_number: orderNumber,
            status: "ordered",
            total_amount: total,
            note: input.note ?? null,
            created_by: userId,
          })
          .execute();
        await trx
          .insertInto("purchase_order_lines")
          .values(
            input.lines.map((l, i) => ({
              id: `pol-${randomUUID()}`,
              purchase_order_id: id,
              product_id: l.productId,
              quantity: l.quantity,
              unit_cost: l.unitCost,
              line_total: totals[i]!,
            })),
          )
          .execute();
      });
      return { success: true, order: (await detail(tenantId, id))! };
    },
    async list(tenantId, query) {
      const count = await db
        .selectFrom("purchase_orders")
        .select(({ fn }) => fn.countAll<number>().as("count"))
        .where("tenant_id", "=", tenantId)
        .executeTakeFirstOrThrow();
      const rows = await db
        .selectFrom("purchase_orders as po")
        .innerJoin("suppliers as s", "s.id", "po.supplier_id")
        .innerJoin("warehouses as w", "w.id", "po.warehouse_id")
        .innerJoin("users as u", "u.id", "po.created_by")
        .select([
          "po.id",
          "po.order_number as orderNumber",
          "po.supplier_id as supplierId",
          "s.code as supplierCode",
          "s.name as supplierName",
          "po.warehouse_id as warehouseId",
          "w.code as warehouseCode",
          "w.name as warehouseName",
          "po.status",
          "po.total_amount as totalAmount",
          "po.note",
          "u.full_name as createdByName",
          "po.created_at as createdAt",
        ])
        .where("po.tenant_id", "=", tenantId)
        .orderBy("po.created_at", "desc")
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute();
      return {
        items: rows.map((r) => ({
          ...r,
          totalAmount: toSafe(r.totalAmount),
          createdAt: r.createdAt.toISOString(),
        })),
        page: query.page,
        pageSize: query.pageSize,
        total: Number(count.count),
      };
    },
    getById: detail,
  };
}
