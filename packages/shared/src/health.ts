import { z } from "zod";

export const HealthStatusSchema = z.object({
  status: z.literal("ok"),
  db: z.literal("ok"),
});

export const HealthUnavailableSchema = z.object({
  status: z.literal("unavailable"),
  db: z.literal("unavailable"),
  code: z.literal("DATABASE_UNAVAILABLE"),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type HealthUnavailable = z.infer<typeof HealthUnavailableSchema>;
