import { z } from "zod";

export const MAX_ORDER_LINE_QUANTITY = 1_000_000;
export const MAX_ORDER_UNIT_PRICE = 100_000_000_000; // 100 billion VND
export const MAX_ORDER_TOTAL_AMOUNT = 1_000_000_000_000; // 1 trillion VND

export const CreateSalesOrderLineInputSchema = z.object({
  productId: z.string().min(1),
  quantity: z
    .number()
    .int("Số lượng phải là số nguyên")
    .positive("Số lượng phải lớn hơn 0")
    .max(
      MAX_ORDER_LINE_QUANTITY,
      `Số lượng không được vượt quá ${MAX_ORDER_LINE_QUANTITY.toLocaleString()}`,
    ),
  unitPrice: z
    .number()
    .int("Đơn giá phải là số nguyên")
    .nonnegative("Đơn giá không được âm")
    .max(MAX_ORDER_UNIT_PRICE, "Đơn giá không được vượt quá 100.000.000.000 đ"),
});

export const CreateSalesOrderRequestSchema = z.object({
  customerId: z.string().min(1, "Vui lòng chọn khách hàng"),
  warehouseId: z.string().min(1, "Vui lòng chọn kho xuất"),
  note: z.string().max(500).optional(),
  lines: z.array(CreateSalesOrderLineInputSchema).min(1, "Đơn hàng phải có ít nhất 1 sản phẩm"),
});

export const SalesOrderLineSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productSku: z.string(),
  productName: z.string(),
  unitName: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  lineTotal: z.number().int().nonnegative(),
});

export const SalesOrderListItemSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  warehouseId: z.string(),
  warehouseName: z.string(),
  status: z.string(),
  totalAmount: z.number().int().nonnegative(),
  itemCount: z.number().int(),
  note: z.string().nullable().optional(),
  createdByName: z.string(),
  createdAt: z.string().datetime(),
});

export const SalesOrderListResponseSchema = z.object({
  items: z.array(SalesOrderListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const SalesOrderDetailResponseSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  customerId: z.string(),
  customerCode: z.string(),
  customerName: z.string(),
  customerPhone: z.string().nullable().optional(),
  customerAddress: z.string().nullable().optional(),
  warehouseId: z.string(),
  warehouseCode: z.string(),
  warehouseName: z.string(),
  status: z.string(),
  totalAmount: z.number().int().nonnegative(),
  note: z.string().nullable().optional(),
  createdByName: z.string(),
  createdAt: z.string().datetime(),
  lines: z.array(SalesOrderLineSchema),
});

export const SalesOrderErrorResponseSchema = z.object({
  code: z.enum([
    "UNAUTHORIZED",
    "ORDER_NOT_FOUND",
    "CUSTOMER_NOT_FOUND",
    "WAREHOUSE_NOT_FOUND",
    "PRODUCT_NOT_FOUND",
    "INSUFFICIENT_STOCK",
    "INVALID_ORDER_LINES",
  ]),
  message: z.string(),
});

export const SalesOrderQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
  customerId: z.string().optional(),
  warehouseId: z.string().optional(),
});

export type CreateSalesOrderLineInput = z.infer<typeof CreateSalesOrderLineInputSchema>;
export type CreateSalesOrderRequest = z.infer<typeof CreateSalesOrderRequestSchema>;
export type SalesOrderLine = z.infer<typeof SalesOrderLineSchema>;
export type SalesOrderListItem = z.infer<typeof SalesOrderListItemSchema>;
export type SalesOrderListResponse = z.infer<typeof SalesOrderListResponseSchema>;
export type SalesOrderDetailResponse = z.infer<typeof SalesOrderDetailResponseSchema>;
export type SalesOrderErrorResponse = z.infer<typeof SalesOrderErrorResponseSchema>;
export type SalesOrderQuery = z.infer<typeof SalesOrderQuerySchema>;
