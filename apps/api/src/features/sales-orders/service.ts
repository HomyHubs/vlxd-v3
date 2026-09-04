import { randomBytes, randomUUID } from "node:crypto";

import {
  MAX_ORDER_LINE_QUANTITY,
  MAX_ORDER_TOTAL_AMOUNT,
  type CreateSalesOrderRequest,
  type OrderPaymentsListResponse,
  type PaymentItem,
  type RecordPaymentRequest,
  type RecordPaymentResponse,
  type SalesOrderDetailResponse,
  type SalesOrderLine,
  type SalesOrderListItem,
  type SalesOrderListResponse,
  type SalesOrderQuery,
} from "@vlxd/shared";
import { sql, type Kysely } from "kysely";

import type { Database } from "../../platform/database.js";

export class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

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

export type RecordPaymentResult =
  | { success: true; response: RecordPaymentResponse }
  | {
      success: false;
      code:
        | "ORDER_NOT_FOUND"
        | "AMOUNT_EXCEEDS_REMAINING"
        | "ORDER_ALREADY_PAID"
        | "INVALID_PAYMENT_AMOUNT";
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
  recordPayment(
    tenantId: string,
    userId: string,
    orderId: string,
    input: RecordPaymentRequest,
  ): Promise<RecordPaymentResult>;
  listPayments(tenantId: string, orderId: string): Promise<OrderPaymentsListResponse | null>;
}

export interface SalesOrderServiceDependencies {
  database: Kysely<Database>;
}

function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const timeSuffix = Date.now().toString(36).slice(-4).toUpperCase();
  const randomSuffix = randomBytes(3).toString("hex").toUpperCase();
  return `DH-${dateStr}-${timeSuffix}${randomSuffix}`;
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

      // Aggregate requested quantities per product and validate safe integer / domain bounds
      const requestedQuantities = new Map<string, number>();
      for (const line of input.lines) {
        const nextQty = (requestedQuantities.get(line.productId) ?? 0) + line.quantity;
        if (!Number.isSafeInteger(nextQty) || nextQty > MAX_ORDER_LINE_QUANTITY) {
          return {
            success: false,
            code: "INVALID_ORDER_LINES",
            message: `Tổng số lượng sản phẩm không được vượt quá ${MAX_ORDER_LINE_QUANTITY.toLocaleString()}`,
          };
        }
        requestedQuantities.set(line.productId, nextQty);
      }

      // Calculate total amount and validate safe integer bounds
      let totalAmount = 0;
      for (const line of input.lines) {
        const lineTotal = line.quantity * line.unitPrice;
        if (!Number.isSafeInteger(lineTotal) || lineTotal > MAX_ORDER_TOTAL_AMOUNT) {
          return {
            success: false,
            code: "INVALID_ORDER_LINES",
            message: "Thành tiền của sản phẩm vượt quá giới hạn tính toán cho phép",
          };
        }
        totalAmount += lineTotal;
        if (!Number.isSafeInteger(totalAmount) || totalAmount > MAX_ORDER_TOTAL_AMOUNT) {
          return {
            success: false,
            code: "INVALID_ORDER_LINES",
            message: "Tổng giá trị đơn hàng vượt quá giới hạn tính toán cho phép",
          };
        }
      }

      // Sort product IDs for deterministic locking order across concurrent transactions
      const sortedProductIds = Array.from(requestedQuantities.keys()).sort();

      // Get user name for response
      const user = await db
        .selectFrom("users")
        .select(["full_name as fullName"])
        .where("id", "=", userId)
        .executeTakeFirst();

      const createdByName = user?.fullName ?? "Người dùng";

      // Execute transaction with collision retry for order_number
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          return await db.transaction().execute(async (trx) => {
            const orderId = `so-${randomUUID()}`;
            const orderNumber = generateOrderNumber();
            const now = new Date();

            // Atomically deduct stock levels with non-negative postcondition
            for (const productId of sortedProductIds) {
              const reqQty = requestedQuantities.get(productId)!;
              const updateResult = await trx
                .updateTable("stock_levels")
                .set((eb) => ({
                  quantity: eb("stock_levels.quantity", "-", reqQty),
                  updated_at: now,
                }))
                .where("warehouse_id", "=", input.warehouseId)
                .where("product_id", "=", productId)
                .where("quantity", ">=", reqQty)
                .executeTakeFirst();

              if (Number(updateResult.numUpdatedRows ?? 0) === 0) {
                const currentStockRow = await trx
                  .selectFrom("stock_levels")
                  .select("quantity")
                  .where("warehouse_id", "=", input.warehouseId)
                  .where("product_id", "=", productId)
                  .executeTakeFirst();
                const currentStock = currentStockRow?.quantity ?? 0;
                const prod = productMap.get(productId);
                throw new InsufficientStockError(
                  `Sản phẩm "${prod?.name ?? productId}" không đủ tồn kho (cần ${reqQty}, hiện có ${currentStock})`,
                );
              }
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
                paidAmount: 0,
                remainingAmount: totalAmount,
                paymentStatus: "unpaid",
                note: input.note ?? null,
                createdByName,
                createdAt: now.toISOString(),
                lines: createdLines,
                payments: [],
              },
            };
          });
        } catch (err: unknown) {
          if (err instanceof InsufficientStockError) {
            return {
              success: false,
              code: "INSUFFICIENT_STOCK",
              message: err.message,
            };
          }

          const error = err as { code?: string; constraint?: string; message?: string };
          const isDuplicateOrderNumber =
            error?.code === "23505" &&
            (error?.constraint === "sales_orders_tenant_number_unique" ||
              String(error?.message).includes("sales_orders_tenant_number_unique"));

          if (isDuplicateOrderNumber && attempt < MAX_ATTEMPTS) {
            continue;
          }

          throw err;
        }
      }

      return {
        success: false,
        code: "INVALID_ORDER_LINES",
        message: "Không thể khởi tạo mã đơn hàng sau nhiều lần thử",
      };
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

      const paymentStats = await db
        .selectFrom("payments")
        .select([
          "order_id as orderId",
          ({ fn }) => fn.coalesce(fn.sum<number | string>("amount"), sql`0`).as("totalPaid"),
        ])
        .where("order_id", "in", orderIds)
        .where("tenant_id", "=", tenantId)
        .groupBy("order_id")
        .execute();

      const paymentMap = new Map(paymentStats.map((s) => [s.orderId, Number(s.totalPaid ?? 0)]));

      const items: SalesOrderListItem[] = rows.map((r) => {
        const total = Number(r.totalAmount);
        const paid = paymentMap.get(r.id) ?? 0;
        const remaining = Math.max(0, total - paid);
        const paymentStatus: "unpaid" | "partial" | "paid" =
          paid === 0 ? "unpaid" : remaining === 0 ? "paid" : "partial";

        return {
          id: r.id,
          orderNumber: r.orderNumber,
          customerId: r.customerId,
          customerName: r.customerName,
          warehouseId: r.warehouseId,
          warehouseName: r.warehouseName,
          status: r.status,
          totalAmount: total,
          paidAmount: paid,
          remainingAmount: remaining,
          paymentStatus,
          itemCount: statsMap.get(r.id) ?? 0,
          note: r.note,
          createdByName: r.createdByName,
          createdAt: r.createdAt.toISOString(),
        };
      });

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

      const payments = await db
        .selectFrom("payments")
        .innerJoin("users", "users.id", "payments.created_by")
        .select([
          "payments.id as id",
          "payments.order_id as orderId",
          "payments.customer_id as customerId",
          "payments.amount as amount",
          "payments.payment_method as paymentMethod",
          "payments.reference_code as referenceCode",
          "payments.note as note",
          "users.full_name as createdByName",
          "payments.created_at as createdAt",
        ])
        .where("payments.order_id", "=", id)
        .where("payments.tenant_id", "=", tenantId)
        .orderBy("payments.created_at", "asc")
        .execute();

      const totalAmount = Number(order.totalAmount);
      const paidAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const remainingAmount = Math.max(0, totalAmount - paidAmount);
      const paymentStatus: "unpaid" | "partial" | "paid" =
        paidAmount === 0 ? "unpaid" : remainingAmount === 0 ? "paid" : "partial";

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
        totalAmount,
        paidAmount,
        remainingAmount,
        paymentStatus,
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
        payments: payments.map((p) => ({
          id: p.id,
          orderId: p.orderId,
          customerId: p.customerId,
          amount: Number(p.amount),
          paymentMethod: p.paymentMethod,
          referenceCode: p.referenceCode,
          note: p.note,
          createdByName: p.createdByName,
          createdAt: p.createdAt.toISOString(),
        })),
      };
    },

    async recordPayment(tenantId, userId, orderId, input) {
      if (!input.amount || input.amount <= 0 || input.amount > 1_000_000_000_000) {
        return {
          success: false,
          code: "INVALID_PAYMENT_AMOUNT",
          message: "Số tiền thanh toán không hợp lệ",
        };
      }

      return await db.transaction().execute(async (trx) => {
        // Lock the sales order row to prevent race condition overpayments
        const order = await trx
          .selectFrom("sales_orders")
          .select(["id", "order_number", "customer_id", "total_amount", "status"])
          .where("id", "=", orderId)
          .where("tenant_id", "=", tenantId)
          .forUpdate()
          .executeTakeFirst();

        if (!order) {
          return {
            success: false,
            code: "ORDER_NOT_FOUND",
            message: "Đơn hàng không tồn tại hoặc không thuộc quyền quản lý",
          };
        }

        const totalAmount = Number(order.total_amount);

        // Calculate current total paid
        const currentPaidRow = await trx
          .selectFrom("payments")
          .select(({ fn }) => [
            fn.coalesce(fn.sum<number | string>("amount"), sql`0`).as("totalPaid"),
          ])
          .where("order_id", "=", orderId)
          .where("tenant_id", "=", tenantId)
          .executeTakeFirst();

        const currentPaid = Number(currentPaidRow?.totalPaid ?? 0);
        const remainingAmount = Math.max(0, totalAmount - currentPaid);

        if (remainingAmount <= 0) {
          return {
            success: false,
            code: "ORDER_ALREADY_PAID",
            message: "Đơn hàng đã được thanh toán đầy đủ",
          };
        }

        if (input.amount > remainingAmount) {
          return {
            success: false,
            code: "AMOUNT_EXCEEDS_REMAINING",
            message: `Số tiền thanh toán (${input.amount.toLocaleString("vi-VN")} đ) vượt quá số tiền còn nợ (${remainingAmount.toLocaleString("vi-VN")} đ)`,
          };
        }

        const paymentId = `pmt_${randomBytes(12).toString("hex")}`;
        const newPaidAmount = currentPaid + input.amount;
        const newRemainingAmount = Math.max(0, totalAmount - newPaidAmount);
        const newStatus: "unpaid" | "partial" | "paid" =
          newPaidAmount === 0 ? "unpaid" : newRemainingAmount === 0 ? "paid" : "partial";

        await trx
          .insertInto("payments")
          .values({
            id: paymentId,
            tenant_id: tenantId,
            order_id: orderId,
            customer_id: order.customer_id,
            amount: input.amount,
            payment_method: input.paymentMethod,
            reference_code: input.referenceCode ?? null,
            note: input.note ?? null,
            created_by: userId,
          })
          .execute();

        const user = await trx
          .selectFrom("users")
          .select(["full_name"])
          .where("id", "=", userId)
          .executeTakeFirst();

        const paymentRow = await trx
          .selectFrom("payments")
          .select(["created_at"])
          .where("id", "=", paymentId)
          .executeTakeFirstOrThrow();

        const paymentItem: PaymentItem = {
          id: paymentId,
          orderId,
          customerId: order.customer_id,
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          referenceCode: input.referenceCode ?? null,
          note: input.note ?? null,
          createdByName: user?.full_name ?? "Người dùng",
          createdAt: paymentRow.created_at.toISOString(),
        };

        return {
          success: true,
          response: {
            payment: paymentItem,
            summary: {
              totalAmount,
              paidAmount: newPaidAmount,
              remainingAmount: newRemainingAmount,
              paymentStatus: newStatus,
            },
          },
        };
      });
    },

    async listPayments(tenantId, orderId) {
      const order = await db
        .selectFrom("sales_orders")
        .select(["id", "total_amount"])
        .where("id", "=", orderId)
        .where("tenant_id", "=", tenantId)
        .executeTakeFirst();

      if (!order) {
        return null;
      }

      const totalAmount = Number(order.total_amount);

      const payments = await db
        .selectFrom("payments")
        .innerJoin("users", "users.id", "payments.created_by")
        .select([
          "payments.id as id",
          "payments.order_id as orderId",
          "payments.customer_id as customerId",
          "payments.amount as amount",
          "payments.payment_method as paymentMethod",
          "payments.reference_code as referenceCode",
          "payments.note as note",
          "users.full_name as createdByName",
          "payments.created_at as createdAt",
        ])
        .where("payments.order_id", "=", orderId)
        .where("payments.tenant_id", "=", tenantId)
        .orderBy("payments.created_at", "asc")
        .execute();

      const paidAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const remainingAmount = Math.max(0, totalAmount - paidAmount);
      const paymentStatus: "unpaid" | "partial" | "paid" =
        paidAmount === 0 ? "unpaid" : remainingAmount === 0 ? "paid" : "partial";

      return {
        payments: payments.map((p) => ({
          id: p.id,
          orderId: p.orderId,
          customerId: p.customerId,
          amount: Number(p.amount),
          paymentMethod: p.paymentMethod,
          referenceCode: p.referenceCode,
          note: p.note,
          createdByName: p.createdByName,
          createdAt: p.createdAt.toISOString(),
        })),
        summary: {
          totalAmount,
          paidAmount,
          remainingAmount,
          paymentStatus,
        },
      };
    },
  };
}
