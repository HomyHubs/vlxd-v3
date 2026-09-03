import { z } from "zod";

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  tenantId: z.string(),
  status: z.enum(["active", "inactive"]),
  titles: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
});

export const AuthTenantSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  plan: z.string(),
});

export const AuthSessionResponseSchema = z.object({
  user: AuthUserSchema,
  tenant: AuthTenantSchema,
});

export const AuthLogoutResponseSchema = z.object({
  success: z.boolean(),
});

export const AuthErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthTenant = z.infer<typeof AuthTenantSchema>;
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;
export type AuthLogoutResponse = z.infer<typeof AuthLogoutResponseSchema>;
export type AuthErrorResponse = z.infer<typeof AuthErrorResponseSchema>;
