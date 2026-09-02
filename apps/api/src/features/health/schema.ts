import { HealthStatusSchema, HealthUnavailableSchema } from "@vlxd/shared";
import { z } from "zod";

export const LivenessStatusSchema = z.object({
  status: z.literal("ok"),
});

export { HealthStatusSchema, HealthUnavailableSchema };
