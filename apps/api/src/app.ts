import fastifyCookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";

import { type AuthService, authRoutes } from "./features/auth/index.js";
import { createHealthService, type HealthLogger, healthRoutes } from "./features/health/index.js";
import { productRoutes, type ProductService } from "./features/products/index.js";
import { type WarehouseService, warehouseRoutes } from "./features/warehouses/index.js";
import { type StockReceiptService, stockReceiptRoutes } from "./features/stock-receipts/index.js";
import { type CustomerService, customerRoutes } from "./features/customers/index.js";
import { type SalesOrderService, salesOrderRoutes } from "./features/sales-orders/index.js";

export interface BuildAppOptions {
  authService?: AuthService | undefined;
  productService?: ProductService | undefined;
  warehouseService?: WarehouseService | undefined;
  stockReceiptService?: StockReceiptService | undefined;
  customerService?: CustomerService | undefined;
  salesOrderService?: SalesOrderService | undefined;
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

  server.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      const code = request.url.startsWith("/sales-orders")
        ? "INVALID_ORDER_LINES"
        : request.url.startsWith("/stock-receipts")
          ? "INVALID_RECEIPT_LINES"
          : "VALIDATION_ERROR";

      return reply.code(400).send({
        code,
        message: error.message,
      });
    }
    return reply.send(error);
  });

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
  if (options.authService && options.warehouseService) {
    await server.register(warehouseRoutes, {
      authService: options.authService,
      warehouseService: options.warehouseService,
    });
  }
  if (options.authService && options.stockReceiptService) {
    await server.register(stockReceiptRoutes, {
      authService: options.authService,
      stockReceiptService: options.stockReceiptService,
    });
  }
  if (options.authService && options.customerService) {
    await server.register(customerRoutes, {
      authService: options.authService,
      customerService: options.customerService,
    });
  }
  if (options.authService && options.salesOrderService) {
    await server.register(salesOrderRoutes, {
      authService: options.authService,
      salesOrderService: options.salesOrderService,
    });
  }

  return server;
}
