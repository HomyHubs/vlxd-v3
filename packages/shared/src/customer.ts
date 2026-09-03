import { z } from "zod";

export const CustomerSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});

export const CreateCustomerRequestSchema = z.object({
  code: z.string().min(1, "Mã khách hàng không được để trống"),
  name: z.string().min(1, "Tên khách hàng không được để trống"),
  phone: z.string().max(50).optional(),
  address: z.string().max(255).optional(),
});

export const CustomerListResponseSchema = z.object({
  items: z.array(CustomerSchema),
  total: z.number().int(),
});

export const CustomerErrorResponseSchema = z.object({
  code: z.enum(["UNAUTHORIZED", "CUSTOMER_CODE_EXISTS", "INVALID_CUSTOMER_DATA"]),
  message: z.string(),
});

export type Customer = z.infer<typeof CustomerSchema>;
export type CreateCustomerRequest = z.infer<typeof CreateCustomerRequestSchema>;
export type CustomerListResponse = z.infer<typeof CustomerListResponseSchema>;
export type CustomerErrorResponse = z.infer<typeof CustomerErrorResponseSchema>;
