import { z } from "zod";

export const UnitCodeSchema = z.enum(["vien", "bao", "tan", "kg", "m3", "cay", "tam", "thung"]);

export const ProductSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  unitCode: UnitCodeSchema,
  unitName: z.string(),
  createdAt: z.string().datetime(),
  stockLevels: z.array(
    z.object({
      warehouseId: z.string(),
      warehouseCode: z.string(),
      quantity: z.number().int().nonnegative(),
    }),
  ),
});

export const ProductListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

export const ProductListResponseSchema = z.object({
  items: z.array(ProductSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const CreateProductRequestSchema = z.object({
  sku: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  unitCode: UnitCodeSchema,
});

export const ProductErrorResponseSchema = z.object({
  code: z.enum([
    "UNAUTHORIZED",
    "FORBIDDEN",
    "VALIDATION_ERROR",
    "PRODUCT_LIMIT_REACHED",
    "PRODUCT_SKU_EXISTS",
    "UNIT_NOT_FOUND",
  ]),
  message: z.string(),
});

export type UnitCode = z.infer<typeof UnitCodeSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;
export type ProductListResponse = z.infer<typeof ProductListResponseSchema>;
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;
export type ProductErrorResponse = z.infer<typeof ProductErrorResponseSchema>;
