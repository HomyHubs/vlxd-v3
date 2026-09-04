import { z } from "zod";

export const MAX_STOCK_TRANSFER_LINE_QUANTITY = 1_000_000;

export const CreateStockTransferLineInputSchema = z.object({
  productId: z.string().min(1, "Vui lòng chọn sản phẩm"),
  quantity: z
    .number()
    .int("Số lượng phải là số nguyên")
    .positive("Số lượng phải lớn hơn 0")
    .max(
      MAX_STOCK_TRANSFER_LINE_QUANTITY,
      `Số lượng không được vượt quá ${MAX_STOCK_TRANSFER_LINE_QUANTITY.toLocaleString()}`,
    ),
});

export const CreateStockTransferRequestSchema = z
  .object({
    sourceWarehouseId: z.string().min(1, "Vui lòng chọn kho xuất"),
    destinationWarehouseId: z.string().min(1, "Vui lòng chọn kho nhập"),
    note: z.string().max(500).optional(),
    lines: z
      .array(CreateStockTransferLineInputSchema)
      .min(1, "Phiếu chuyển kho phải có ít nhất 1 sản phẩm"),
  })
  .refine((data) => data.sourceWarehouseId !== data.destinationWarehouseId, {
    message: "Kho xuất và kho nhập không được trùng nhau",
    path: ["destinationWarehouseId"],
  });

export const StockTransferLineSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productSku: z.string(),
  productName: z.string(),
  unitName: z.string(),
  quantity: z.number().int().positive(),
});

export const StockTransferListItemSchema = z.object({
  id: z.string(),
  transferNumber: z.string(),
  sourceWarehouseId: z.string(),
  sourceWarehouseCode: z.string(),
  sourceWarehouseName: z.string(),
  destinationWarehouseId: z.string(),
  destinationWarehouseCode: z.string(),
  destinationWarehouseName: z.string(),
  status: z.string(),
  note: z.string().nullable().optional(),
  createdByName: z.string(),
  createdAt: z.string().datetime(),
  itemCount: z.number().int(),
  totalQuantity: z.number().int(),
});

export const StockTransferListResponseSchema = z.object({
  items: z.array(StockTransferListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const StockTransferDetailResponseSchema = z.object({
  id: z.string(),
  transferNumber: z.string(),
  sourceWarehouseId: z.string(),
  sourceWarehouseCode: z.string(),
  sourceWarehouseName: z.string(),
  destinationWarehouseId: z.string(),
  destinationWarehouseCode: z.string(),
  destinationWarehouseName: z.string(),
  status: z.string(),
  note: z.string().nullable().optional(),
  createdByName: z.string(),
  createdAt: z.string().datetime(),
  totalQuantity: z.number().int(),
  lines: z.array(StockTransferLineSchema),
});

export const StockTransferErrorResponseSchema = z.object({
  code: z.enum([
    "UNAUTHORIZED",
    "FORBIDDEN",
    "VALIDATION_ERROR",
    "SAME_WAREHOUSE_NOT_ALLOWED",
    "WAREHOUSE_NOT_FOUND",
    "PRODUCT_NOT_FOUND",
    "INSUFFICIENT_STOCK",
    "STOCK_TRANSFER_NOT_FOUND",
    "INVALID_TRANSFER_LINES",
    "AUTH_CONTEXT_CHANGED",
  ]),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type CreateStockTransferLineInput = z.infer<typeof CreateStockTransferLineInputSchema>;
export type CreateStockTransferRequest = z.infer<typeof CreateStockTransferRequestSchema>;
export type StockTransferLine = z.infer<typeof StockTransferLineSchema>;
export type StockTransferListItem = z.infer<typeof StockTransferListItemSchema>;
export type StockTransferListResponse = z.infer<typeof StockTransferListResponseSchema>;
export type StockTransferDetailResponse = z.infer<typeof StockTransferDetailResponseSchema>;
export type StockTransferErrorResponse = z.infer<typeof StockTransferErrorResponseSchema>;
