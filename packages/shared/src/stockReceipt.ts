import { z } from "zod";

export const MAX_STOCK_RECEIPT_LINE_QUANTITY = 1_000_000;
export const MAX_STOCK_LEVEL_QUANTITY = 1_000_000_000;

export const CreateStockReceiptLineInputSchema = z.object({
  productId: z.string().min(1),
  quantity: z
    .number()
    .int("Số lượng phải là số nguyên")
    .positive("Số lượng phải lớn hơn 0")
    .max(
      MAX_STOCK_RECEIPT_LINE_QUANTITY,
      `Số lượng không được vượt quá ${MAX_STOCK_RECEIPT_LINE_QUANTITY.toLocaleString()}`,
    ),
});

export const CreateStockReceiptRequestSchema = z.object({
  warehouseId: z.string().min(1, "Vui lòng chọn kho nhập"),
  note: z.string().max(500).optional(),
  lines: z.array(CreateStockReceiptLineInputSchema).min(1, "Phiếu nhập phải có ít nhất 1 sản phẩm"),
});

export const StockReceiptLineSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productSku: z.string(),
  productName: z.string(),
  unitName: z.string(),
  quantity: z.number().int().positive(),
});

export const StockReceiptListItemSchema = z.object({
  id: z.string(),
  receiptNumber: z.string(),
  warehouseId: z.string(),
  warehouseCode: z.string(),
  warehouseName: z.string(),
  status: z.string(),
  note: z.string().nullable().optional(),
  createdByName: z.string(),
  createdAt: z.string().datetime(),
  itemCount: z.number().int(),
  totalQuantity: z.number().int(),
});

export const StockReceiptListResponseSchema = z.object({
  items: z.array(StockReceiptListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const StockReceiptDetailResponseSchema = z.object({
  id: z.string(),
  receiptNumber: z.string(),
  warehouseId: z.string(),
  warehouseCode: z.string(),
  warehouseName: z.string(),
  status: z.string(),
  note: z.string().nullable().optional(),
  createdByName: z.string(),
  createdAt: z.string().datetime(),
  totalQuantity: z.number().int(),
  lines: z.array(StockReceiptLineSchema),
});

export const StockReceiptErrorResponseSchema = z.object({
  code: z.enum([
    "UNAUTHORIZED",
    "FORBIDDEN",
    "WAREHOUSE_NOT_FOUND",
    "PRODUCT_NOT_FOUND",
    "INVALID_RECEIPT_LINES",
  ]),
  message: z.string(),
});

export type CreateStockReceiptLineInput = z.infer<typeof CreateStockReceiptLineInputSchema>;
export type CreateStockReceiptRequest = z.infer<typeof CreateStockReceiptRequestSchema>;
export type StockReceiptLine = z.infer<typeof StockReceiptLineSchema>;
export type StockReceiptListItem = z.infer<typeof StockReceiptListItemSchema>;
export type StockReceiptListResponse = z.infer<typeof StockReceiptListResponseSchema>;
export type StockReceiptDetailResponse = z.infer<typeof StockReceiptDetailResponseSchema>;
export type StockReceiptErrorResponse = z.infer<typeof StockReceiptErrorResponseSchema>;
