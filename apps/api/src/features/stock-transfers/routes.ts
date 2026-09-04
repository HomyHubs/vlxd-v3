import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  CreateStockTransferRequestSchema,
  StockTransferDetailResponseSchema,
  StockTransferErrorResponseSchema,
  StockTransferListResponseSchema,
} from "@vlxd/shared";

import { createRequireCapability, type AuthService } from "../auth/index.js";
import type { StockTransferService } from "./service.js";

export interface StockTransferRoutesOptions {
  authService: AuthService;
  stockTransferService: StockTransferService;
}

const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sourceWarehouseId: z.string().optional(),
  destinationWarehouseId: z.string().optional(),
});

const IdParamSchema = z.object({
  id: z.string().min(1),
});

export const stockTransferRoutes: FastifyPluginAsync<StockTransferRoutesOptions> = async (
  server,
  options,
) => {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const requireCap = createRequireCapability(options.authService);

  app.get(
    "/stock-transfers",
    {
      preHandler: [requireCap("inventory.view")],
      schema: {
        querystring: ListQuerySchema,
        response: {
          200: StockTransferListResponseSchema,
          401: StockTransferErrorResponseSchema,
          403: StockTransferErrorResponseSchema,
          409: StockTransferErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
      const result = await options.stockTransferService.list(session.tenant.id, request.query);
      return reply.code(200).send(result);
    },
  );

  app.post(
    "/stock-transfers",
    {
      preHandler: [requireCap("inventory.manage")],
      schema: {
        body: CreateStockTransferRequestSchema,
        response: {
          201: StockTransferDetailResponseSchema,
          400: StockTransferErrorResponseSchema,
          401: StockTransferErrorResponseSchema,
          403: StockTransferErrorResponseSchema,
          404: StockTransferErrorResponseSchema,
          409: StockTransferErrorResponseSchema,
          422: StockTransferErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
      const result = await options.stockTransferService.create(
        session.tenant.id,
        session.user.id,
        request.body,
      );

      if (!result.success) {
        let statusCode: 400 | 404 | 422 = 400;
        if (result.code === "WAREHOUSE_NOT_FOUND" || result.code === "PRODUCT_NOT_FOUND") {
          statusCode = 404;
        } else if (result.code === "INSUFFICIENT_STOCK") {
          statusCode = 422;
        }

        return reply
          .code(statusCode)
          .send({ code: result.code, message: result.message, details: result.details });
      }

      return reply.code(201).send(result.transfer);
    },
  );

  app.get(
    "/stock-transfers/:id",
    {
      preHandler: [requireCap("inventory.view")],
      schema: {
        params: IdParamSchema,
        response: {
          200: StockTransferDetailResponseSchema,
          401: StockTransferErrorResponseSchema,
          403: StockTransferErrorResponseSchema,
          404: StockTransferErrorResponseSchema,
          409: StockTransferErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
      const transfer = await options.stockTransferService.getById(
        session.tenant.id,
        request.params.id,
      );

      if (!transfer) {
        return reply.code(404).send({
          code: "STOCK_TRANSFER_NOT_FOUND",
          message: "Phiếu chuyển kho không tồn tại hoặc không thuộc quyền quản lý",
        });
      }

      return reply.code(200).send(transfer);
    },
  );
};
