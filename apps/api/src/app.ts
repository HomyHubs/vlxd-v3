import fastifyCookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";

import { type AuthService, authRoutes } from "./features/auth/index.js";
import { createHealthService, type HealthLogger, healthRoutes } from "./features/health/index.js";
import { productRoutes, type ProductService } from "./features/products/index.js";

export interface BuildAppOptions {
  authService?: AuthService | undefined;
  productService?: ProductService | undefined;
  checkDatabase: (logger?: HealthLogger) => Promise<boolean>;
  logger?: boolean | undefined;
  logLevel?: string | undefined;
  secureCookies?: boolean | undefined;
  trustProxy?: boolean | string | string[] | undefined;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const server: FastifyInstance = Fastify({
    trustProxy: options.trustProxy ?? false,
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

  await server.register(fastifyCookie);
  await server.register(helmet);
  await server.register(cors, { origin: false });
  await server.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    allowList: (req) => {
      const pathname = req.url.split("?")[0];
      return pathname === "/health" || pathname === "/healthz" || pathname === "/readyz";
    },
    keyGenerator: (req) => req.ip || req.socket.remoteAddress || "127.0.0.1",
  });
  await server.register(healthRoutes, {
    healthService: createHealthService({
      checkDatabase: (logger) => options.checkDatabase(logger),
    }),
  });
  if (options.authService) {
    await server.register(authRoutes, {
      authService: options.authService,
      secureCookies: options.secureCookies,
    });
  }
  if (options.authService && options.productService) {
    await server.register(productRoutes, {
      authService: options.authService,
      productService: options.productService,
    });
  }

  return server;
}
