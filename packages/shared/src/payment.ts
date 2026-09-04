import { z } from "zod";

export const PaymentMethodSchema = z.enum(["cash", "bank_transfer"]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const PaymentStatusSchema = z.enum(["unpaid", "partial", "paid"]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const RecordPaymentRequestSchema = z.object({
  amount: z
    .number()
    .int("Số tiền thanh toán phải là số nguyên")
    .positive("Số tiền thanh toán phải lớn hơn 0")
    .max(1_000_000_000_000, "Số tiền thanh toán không được vượt quá 1.000.000.000.000 đ"),
  paymentMethod: PaymentMethodSchema,
  referenceCode: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  idempotencyKey: z
    .string({ message: "Mã idempotency key là bắt buộc" })
    .trim()
    .min(1, "Mã idempotency key không được để trống")
    .max(100),
});
export type RecordPaymentRequest = z.infer<typeof RecordPaymentRequestSchema>;

export const PaymentItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  customerId: z.string(),
  amount: z.number().int().positive(),
  paymentMethod: PaymentMethodSchema,
  referenceCode: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
  createdByName: z.string(),
  createdAt: z.string().datetime(),
});
export type PaymentItem = z.infer<typeof PaymentItemSchema>;

export const OrderPaymentSummarySchema = z.object({
  totalAmount: z.number().int().nonnegative(),
  paidAmount: z.number().int().nonnegative(),
  remainingAmount: z.number().int().nonnegative(),
  paymentStatus: PaymentStatusSchema,
});
export type OrderPaymentSummary = z.infer<typeof OrderPaymentSummarySchema>;

export const RecordPaymentResponseSchema = z.object({
  payment: PaymentItemSchema,
  summary: OrderPaymentSummarySchema,
});
export type RecordPaymentResponse = z.infer<typeof RecordPaymentResponseSchema>;

export const OrderPaymentsListResponseSchema = z.object({
  payments: z.array(PaymentItemSchema),
  summary: OrderPaymentSummarySchema,
});
export type OrderPaymentsListResponse = z.infer<typeof OrderPaymentsListResponseSchema>;

export const PaymentErrorResponseSchema = z.object({
  code: z.enum([
    "UNAUTHORIZED",
    "FORBIDDEN",
    "ORDER_NOT_FOUND",
    "AMOUNT_EXCEEDS_REMAINING",
    "ORDER_ALREADY_PAID",
    "INVALID_PAYMENT_AMOUNT",
    "AUTH_CONTEXT_CHANGED",
    "IDEMPOTENCY_CONFLICT",
    "VALIDATION_ERROR",
  ]),
  message: z.string(),
});
export type PaymentErrorResponse = z.infer<typeof PaymentErrorResponseSchema>;
