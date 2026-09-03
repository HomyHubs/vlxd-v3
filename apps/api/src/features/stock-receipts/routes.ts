import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  CreateStockReceiptRequestSchema,
  StockReceiptDetailResponseSchema,
  StockReceiptErrorResponseSchema,
  StockReceiptListResponseSchema,
} from "@vlxd/shared";

import { SESSION_COOKIE_NAME, type AuthService } from "../auth/index.js";
import type { StockReceiptService } from "./service.js";

export interface StockReceiptRoutesOptions {
  authService: AuthService;
  stockReceiptService: StockReceiptService;
}

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  warehouseId: z.string().optional(),
});

const IdParamSchema = z.object({
  id: z.string().min(1),
});

export const stockReceiptRoutes: FastifyPluginAsync<StockReceiptRoutesOptions> = (
  server,
  options,
) => {
  const app = server.withTypeProvider<ZodTypeProvider>();

  async function sessionFor(request: {
    cookies: Record<string, string | undefined>;
    log: Parameters<AuthService["getMe"]>[1];
  }) {
    const token = request.cookies[SESSION_COOKIE_NAME];
    return token ? options.authService.getMe(token, request.log) : null;
  }

  app.get(
    "/stock-receipts",
    {
      schema: {
        querystring: ListQuerySchema,
        response: {
          200: StockReceiptListResponseSchema,
          401: StockReceiptErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await sessionFor(request);
      if (!session) {
        return reply.code(401).send({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const result = await options.stockReceiptService.list(session.tenant.id, request.query);
      return reply.code(200).send(result);
    },
  );

  app.post(
    "/stock-receipts",
    {
      schema: {
        body: CreateStockReceiptRequestSchema,
        response: {
          201: StockReceiptDetailResponseSchema,
          400: StockReceiptErrorResponseSchema,
          401: StockReceiptErrorResponseSchema,
          404: StockReceiptErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await sessionFor(request);
      if (!session) {
        return reply.code(401).send({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const result = await options.stockReceiptService.create(
        session.tenant.id,
        session.user.id,
        request.body,
      );

      if (!result.success) {
        const statusCode = result.code === "INVALID_RECEIPT_LINES" ? 400 : 404;
        return reply.code(statusCode).send({ code: result.code, message: result.message });
      }

      return reply.code(201).send(result.receipt);
    },
  );

  app.get(
    "/stock-receipts/:id",
    {
      schema: {
        params: IdParamSchema,
        response: {
          200: StockReceiptDetailResponseSchema,
          401: StockReceiptErrorResponseSchema,
          404: StockReceiptErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await sessionFor(request);
      if (!session) {
        return reply.code(401).send({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const receipt = await options.stockReceiptService.getById(
        session.tenant.id,
        request.params.id,
      );

      if (!receipt) {
        return reply.code(404).send({
          code: "WAREHOUSE_NOT_FOUND",
          message: "Phiếu nhập kho không tồn tại",
        });
      }

      return reply.code(200).send(receipt);
    },
  );

  return Promise.resolve();
};
