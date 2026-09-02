import { z } from "zod";

export const WarehouseSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  createdAt: z.string().datetime(),
});

export const WarehouseListResponseSchema = z.object({
  items: z.array(WarehouseSchema),
  total: z.number().int(),
});

export const CreateWarehouseRequestSchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(120),
});

export const WarehouseErrorResponseSchema = z.object({
  code: z.enum(["UNAUTHORIZED", "WAREHOUSE_LIMIT_REACHED", "WAREHOUSE_CODE_EXISTS"]),
  message: z.string(),
});

export type Warehouse = z.infer<typeof WarehouseSchema>;
export type WarehouseListResponse = z.infer<typeof WarehouseListResponseSchema>;
export type CreateWarehouseRequest = z.infer<typeof CreateWarehouseRequestSchema>;
export type WarehouseErrorResponse = z.infer<typeof WarehouseErrorResponseSchema>;
