import { z } from "zod";
import { MAX_STOCK_RECEIPT_LINE_QUANTITY } from "./stockReceipt.js";

export const CreatePurchaseOrderLineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive().max(MAX_STOCK_RECEIPT_LINE_QUANTITY),
  unitCost: z.number().int().nonnegative().safe(),
});
export const CreatePurchaseOrderRequestSchema = z.object({
  supplierId: z.string().min(1),
  warehouseId: z.string().min(1),
  note: z.string().max(500).optional(),
  lines: z.array(CreatePurchaseOrderLineSchema).min(1),
});
export const PurchaseOrderLineSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productSku: z.string(),
  productName: z.string(),
  unitName: z.string(),
  quantity: z.number().int(),
  unitCost: z.number().int(),
  lineTotal: z.number().int(),
});
export const PurchaseOrderSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  supplierId: z.string(),
  supplierCode: z.string(),
  supplierName: z.string(),
  warehouseId: z.string(),
  warehouseCode: z.string(),
  warehouseName: z.string(),
  status: z.string(),
  totalAmount: z.number().int(),
  note: z.string().nullable(),
  createdByName: z.string(),
  createdAt: z.string().datetime(),
  lines: z.array(PurchaseOrderLineSchema),
});
export const PurchaseOrderListResponseSchema = z.object({
  items: z.array(PurchaseOrderSchema.omit({ lines: true })),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export const PurchaseOrderErrorResponseSchema = z.object({
  code: z.enum([
    "UNAUTHORIZED",
    "FORBIDDEN",
    "SUPPLIER_NOT_FOUND",
    "WAREHOUSE_NOT_FOUND",
    "PRODUCT_NOT_FOUND",
    "INVALID_ORDER_LINES",
    "AUTH_CONTEXT_CHANGED",
  ]),
  message: z.string(),
});
export type CreatePurchaseOrderRequest = z.infer<typeof CreatePurchaseOrderRequestSchema>;
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;
export type PurchaseOrderLine = z.infer<typeof PurchaseOrderLineSchema>;
export type PurchaseOrderListResponse = z.infer<typeof PurchaseOrderListResponseSchema>;
