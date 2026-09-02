import { z } from "zod";

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  COOKIE_SECURE: z
    .enum(["true", "false", "1", "0"])
    .default("true")
    .transform((val) => val === "true" || val === "1"),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export function parseEnvironment(source: NodeJS.ProcessEnv): Environment {
  return EnvironmentSchema.parse(source);
}
