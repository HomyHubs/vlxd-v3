import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";

import { createHealthService, healthRoutes } from "./features/health/index.js";

export interface BuildAppOptions {
  checkDatabase(): Promise<boolean>;
  logger?: boolean;
  logLevel?: string;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const server = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: options.logLevel ?? "info",
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "res.headers['set-cookie']",
              ],
              censor: "[REDACTED]",
            },
          },
    requestIdHeader: "x-request-id",
  });

  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  await server.register(helmet);
  await server.register(cors, { origin: false });
  await server.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await server.register(healthRoutes, {
    healthService: createHealthService({
      checkDatabase: options.checkDatabase,
    }),
  });

  return server;
}
