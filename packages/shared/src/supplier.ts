import { z } from "zod";

export const CreateSupplierRequestSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(300).optional(),
  note: z.string().trim().max(500).optional(),
});
export const SupplierSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export const SupplierListResponseSchema = z.object({
  items: z.array(SupplierSchema),
  total: z.number().int(),
});
export const SupplierErrorResponseSchema = z.object({
  code: z.enum([
    "UNAUTHORIZED",
    "FORBIDDEN",
    "SUPPLIER_CODE_EXISTS",
    "VALIDATION_ERROR",
    "AUTH_CONTEXT_CHANGED",
  ]),
  message: z.string(),
});
export type CreateSupplierRequest = z.infer<typeof CreateSupplierRequestSchema>;
export type Supplier = z.infer<typeof SupplierSchema>;
