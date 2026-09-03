import { randomUUID } from "node:crypto";

import type {
  CreateSalesOrderRequest,
  SalesOrderDetailResponse,
  SalesOrderLine,
  SalesOrderListItem,
  SalesOrderListResponse,
  SalesOrderQuery,
} from "@vlxd/shared";
import type { Kysely } from "kysely";

import type { Database } from "../../platform/database.js";

export type CreateSalesOrderResult =
  | { success: true; order: SalesOrderDetailResponse }
  | {
      success: false;
      code:
        | "CUSTOMER_NOT_FOUND"
        | "WAREHOUSE_NOT_FOUND"
        | "PRODUCT_NOT_FOUND"
        | "INSUFFICIENT_STOCK"
        | "INVALID_ORDER_LINES";
      message: string;
    };

export interface SalesOrderService {
  create(
    tenantId: string,
    userId: string,
    input: CreateSalesOrderRequest,
  ): Promise<CreateSalesOrderResult>;
  list(tenantId: string, query?: SalesOrderQuery): Promise<SalesOrderListResponse>;
  getById(tenantId: string, id: string): Promise<SalesOrderDetailResponse | null>;
}

export interface SalesOrderServiceDependencies {
  database: Kysely<Database>;
}

function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `DH-${dateStr}-${randomSuffix}`;
}

export function createSalesOrderService(
  dependencies: SalesOrderServiceDependencies,
): SalesOrderService {
  const db = dependencies.database;

  return {
    async create(tenantId, userId, input) {
      if (!input.lines || input.lines.length === 0) {
        return {
          success: false,
          code: "INVALID_ORDER_LINES",
          message: "Đơn hàng phải có ít nhất 1 sản phẩm",
        };
      }

      // Check customer exists and belongs to tenant
      const customer = await db
        .selectFrom("customers")
        .select(["id", "code", "name", "phone", "address"])
        .where("id", "=", input.customerId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!customer) {
        return {
          success: false,
          code: "CUSTOMER_NOT_FOUND",
          message: "Khách hàng không tồn tại hoặc không thuộc quyền quản lý",
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

      // Aggregate requested quantities per product
      const requestedQuantities = new Map<string, number>();
      for (const line of input.lines) {
        requestedQuantities.set(
          line.productId,
          (requestedQuantities.get(line.productId) ?? 0) + line.quantity,
        );
      }

      // Check stock levels in the warehouse
      const stockLevels = await db
        .selectFrom("stock_levels")
        .select(["product_id as productId", "quantity"])
        .where("warehouse_id", "=", input.warehouseId)
        .where("product_id", "in", productIds)
        .execute();

      const stockMap = new Map(stockLevels.map((s) => [s.productId, s.quantity]));

      for (const [productId, reqQty] of requestedQuantities.entries()) {
        const currentStock = stockMap.get(productId) ?? 0;
        if (currentStock < reqQty) {
          const prod = productMap.get(productId);
          return {
            success: false,
            code: "INSUFFICIENT_STOCK",
            message: `Sản phẩm "${prod?.name ?? productId}" không đủ tồn kho (cần ${reqQty}, hiện có ${currentStock})`,
          };
        }
      }

      // Get user name for response
      const user = await db
        .selectFrom("users")
        .select(["full_name as fullName"])
        .where("id", "=", userId)
        .executeTakeFirst();

      const createdByName = user?.fullName ?? "Người dùng";

      // Execute transaction: create order + lines + movements + deduct stock levels
      return db.transaction().execute(async (trx) => {
        const orderId = `so-${randomUUID()}`;
        const orderNumber = generateOrderNumber();
        const now = new Date();

        // Calculate total amount
        let totalAmount = 0;
        for (const line of input.lines) {
          totalAmount += line.quantity * line.unitPrice;
        }

        await trx
          .insertInto("sales_orders")
          .values({
            id: orderId,
            tenant_id: tenantId,
            order_number: orderNumber,
            customer_id: input.customerId,
            warehouse_id: input.warehouseId,
            status: "confirmed",
            total_amount: totalAmount,
            note: input.note ?? null,
            created_by: userId,
          })
          .execute();

        const createdLines: SalesOrderLine[] = [];

        for (const line of input.lines) {
          const lineId = `sol-${randomUUID()}`;
          const prod = productMap.get(line.productId)!;
          const lineTotal = line.quantity * line.unitPrice;

          await trx
            .insertInto("sales_order_lines")
            .values({
              id: lineId,
              order_id: orderId,
              product_id: line.productId,
              quantity: line.quantity,
              unit_price: line.unitPrice,
              line_total: lineTotal,
            })
            .execute();

          // Log outbound stock movement (negative quantity for sales issue)
          const movementId = `sm-${randomUUID()}`;
          await trx
            .insertInto("stock_movements")
            .values({
              id: movementId,
              tenant_id: tenantId,
              warehouse_id: input.warehouseId,
              product_id: line.productId,
              quantity: -line.quantity,
              type: "sales_issue",
              reference_id: orderId,
            })
            .execute();

          // Atomically deduct stock level
          await trx
            .updateTable("stock_levels")
            .set((eb) => ({
              quantity: eb("stock_levels.quantity", "-", line.quantity),
              updated_at: now,
            }))
            .where("warehouse_id", "=", input.warehouseId)
            .where("product_id", "=", line.productId)
            .execute();

          createdLines.push({
            id: lineId,
            productId: line.productId,
            productSku: prod.sku,
            productName: prod.name,
            unitName: prod.unitName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal,
          });
        }

        return {
          success: true,
          order: {
            id: orderId,
            orderNumber,
            customerId: customer.id,
            customerCode: customer.code,
            customerName: customer.name,
            customerPhone: customer.phone,
            customerAddress: customer.address,
            warehouseId: warehouse.id,
            warehouseCode: warehouse.code,
            warehouseName: warehouse.name,
            status: "confirmed",
            totalAmount,
            note: input.note ?? null,
            createdByName,
            createdAt: now.toISOString(),
            lines: createdLines,
          },
        };
      });
    },

    async list(tenantId, query) {
      const page = query?.page ?? 1;
      const pageSize = query?.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      let baseQuery = db.selectFrom("sales_orders").where("sales_orders.tenant_id", "=", tenantId);

      if (query?.customerId) {
        baseQuery = baseQuery.where("sales_orders.customer_id", "=", query.customerId);
      }
      if (query?.warehouseId) {
        baseQuery = baseQuery.where("sales_orders.warehouse_id", "=", query.warehouseId);
      }

      const totalResult = await baseQuery
        .select((eb) => eb.fn.count<string>("sales_orders.id").as("total"))
        .executeTakeFirst();
      const total = Number(totalResult?.total ?? 0);

      const rows = await baseQuery
        .innerJoin("customers", "customers.id", "sales_orders.customer_id")
        .innerJoin("warehouses", "warehouses.id", "sales_orders.warehouse_id")
        .innerJoin("users", "users.id", "sales_orders.created_by")
        .select([
          "sales_orders.id as id",
          "sales_orders.order_number as orderNumber",
          "sales_orders.customer_id as customerId",
          "customers.name as customerName",
          "sales_orders.warehouse_id as warehouseId",
          "warehouses.name as warehouseName",
          "sales_orders.status as status",
          "sales_orders.total_amount as totalAmount",
          "sales_orders.note as note",
          "users.full_name as createdByName",
          "sales_orders.created_at as createdAt",
        ])
        .orderBy("sales_orders.created_at", "desc")
        .limit(pageSize)
        .offset(offset)
        .execute();

      if (rows.length === 0) {
        return { items: [], page, pageSize, total };
      }

      const orderIds = rows.map((r) => r.id);
      const lineStats = await db
        .selectFrom("sales_order_lines")
        .select(["order_id as orderId", ({ fn }) => fn.countAll<number>().as("itemCount")])
        .where("order_id", "in", orderIds)
        .groupBy("order_id")
        .execute();

      const statsMap = new Map(lineStats.map((s) => [s.orderId, Number(s.itemCount ?? 0)]));

      const items: SalesOrderListItem[] = rows.map((r) => ({
        id: r.id,
        orderNumber: r.orderNumber,
        customerId: r.customerId,
        customerName: r.customerName,
        warehouseId: r.warehouseId,
        warehouseName: r.warehouseName,
        status: r.status,
        totalAmount: Number(r.totalAmount),
        itemCount: statsMap.get(r.id) ?? 0,
        note: r.note,
        createdByName: r.createdByName,
        createdAt: r.createdAt.toISOString(),
      }));

      return {
        items,
        page,
        pageSize,
        total,
      };
    },

    async getById(tenantId, id) {
      const order = await db
        .selectFrom("sales_orders")
        .innerJoin("customers", "customers.id", "sales_orders.customer_id")
        .innerJoin("warehouses", "warehouses.id", "sales_orders.warehouse_id")
        .innerJoin("users", "users.id", "sales_orders.created_by")
        .select([
          "sales_orders.id as id",
          "sales_orders.order_number as orderNumber",
          "sales_orders.customer_id as customerId",
          "customers.code as customerCode",
          "customers.name as customerName",
          "customers.phone as customerPhone",
          "customers.address as customerAddress",
          "sales_orders.warehouse_id as warehouseId",
          "warehouses.code as warehouseCode",
          "warehouses.name as warehouseName",
          "sales_orders.status as status",
          "sales_orders.total_amount as totalAmount",
          "sales_orders.note as note",
          "users.full_name as createdByName",
          "sales_orders.created_at as createdAt",
        ])
        .where("sales_orders.id", "=", id)
        .where("sales_orders.tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!order) return null;

      const lines = await db
        .selectFrom("sales_order_lines")
        .innerJoin("products", "products.id", "sales_order_lines.product_id")
        .innerJoin("units", "units.id", "products.unit_id")
        .select([
          "sales_order_lines.id as id",
          "sales_order_lines.product_id as productId",
          "products.sku as productSku",
          "products.name as productName",
          "units.name as unitName",
          "sales_order_lines.quantity as quantity",
          "sales_order_lines.unit_price as unitPrice",
          "sales_order_lines.line_total as lineTotal",
        ])
        .where("sales_order_lines.order_id", "=", id)
        .orderBy("sales_order_lines.created_at", "asc")
        .execute();

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customerCode: order.customerCode,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerAddress: order.customerAddress,
        warehouseId: order.warehouseId,
        warehouseCode: order.warehouseCode,
        warehouseName: order.warehouseName,
        status: order.status,
        totalAmount: Number(order.totalAmount),
        note: order.note,
        createdByName: order.createdByName,
        createdAt: order.createdAt.toISOString(),
        lines: lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          productSku: l.productSku,
          productName: l.productName,
          unitName: l.unitName,
          quantity: l.quantity,
          unitPrice: Number(l.unitPrice),
          lineTotal: Number(l.lineTotal),
        })),
      };
    },
  };
}
