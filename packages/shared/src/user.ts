import { z } from "zod";

export const TitleItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
});

export const TitleListResponseSchema = z.object({
  items: z.array(TitleItemSchema),
});

export const UserItemSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  status: z.enum(["active", "inactive"]),
  titles: z.array(z.string()),
  createdAt: z.string(),
});

export const UserListResponseSchema = z.object({
  items: z.array(UserItemSchema),
});

export const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(100),
  password: z.string().min(6).max(100),
  titleId: z.string().min(1),
});

export const UserErrorResponseSchema = z.object({
  code: z.enum([
    "UNAUTHORIZED",
    "FORBIDDEN",
    "VALIDATION_ERROR",
    "TITLE_NOT_FOUND",
    "EMAIL_EXISTS",
    "INVALID_INPUT",
    "AUTH_CONTEXT_CHANGED",
  ]),
  message: z.string(),
});

export type TitleItem = z.infer<typeof TitleItemSchema>;
export type TitleListResponse = z.infer<typeof TitleListResponseSchema>;
export type UserItem = z.infer<typeof UserItemSchema>;
export type UserListResponse = z.infer<typeof UserListResponseSchema>;
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;
export type UserErrorResponse = z.infer<typeof UserErrorResponseSchema>;
