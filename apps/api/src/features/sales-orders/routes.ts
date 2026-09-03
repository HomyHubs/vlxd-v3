import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  CreateSalesOrderRequestSchema,
  SalesOrderDetailResponseSchema,
  SalesOrderErrorResponseSchema,
  SalesOrderListResponseSchema,
  SalesOrderQuerySchema,
} from "@vlxd/shared";

import { SESSION_COOKIE_NAME, type AuthService } from "../auth/index.js";
import type { SalesOrderService } from "./service.js";

export interface SalesOrderRoutesOptions {
  authService: AuthService;
  salesOrderService: SalesOrderService;
}

const IdParamSchema = z.object({
  id: z.string().min(1),
});

export const salesOrderRoutes: FastifyPluginAsync<SalesOrderRoutesOptions> = (server, options) => {
  const app = server.withTypeProvider<ZodTypeProvider>();

  async function sessionFor(request: {
    cookies: Record<string, string | undefined>;
    log: Parameters<AuthService["getMe"]>[1];
  }) {
    const token = request.cookies[SESSION_COOKIE_NAME];
    return token ? options.authService.getMe(token, request.log) : null;
  }

  app.get(
    "/sales-orders",
    {
      schema: {
        querystring: SalesOrderQuerySchema,
        response: {
          200: SalesOrderListResponseSchema,
          401: SalesOrderErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await sessionFor(request);
      if (!session) {
        return reply.code(401).send({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const result = await options.salesOrderService.list(session.tenant.id, request.query);
      return reply.code(200).send(result);
    },
  );

  app.post(
    "/sales-orders",
    {
      schema: {
        body: CreateSalesOrderRequestSchema,
        response: {
          201: SalesOrderDetailResponseSchema,
          400: SalesOrderErrorResponseSchema,
          401: SalesOrderErrorResponseSchema,
          404: SalesOrderErrorResponseSchema,
          422: SalesOrderErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await sessionFor(request);
      if (!session) {
        return reply.code(401).send({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const result = await options.salesOrderService.create(
        session.tenant.id,
        session.user.id,
        request.body,
      );

      if (!result.success) {
        let statusCode: 400 | 404 | 422 = 400;
        if (result.code === "INSUFFICIENT_STOCK") {
          statusCode = 422;
        } else if (
          result.code === "CUSTOMER_NOT_FOUND" ||
          result.code === "WAREHOUSE_NOT_FOUND" ||
          result.code === "PRODUCT_NOT_FOUND"
        ) {
          statusCode = 404;
        }

        return reply.code(statusCode).send({ code: result.code, message: result.message });
      }

      return reply.code(201).send(result.order);
    },
  );

  app.get(
    "/sales-orders/:id",
    {
      schema: {
        params: IdParamSchema,
        response: {
          200: SalesOrderDetailResponseSchema,
          401: SalesOrderErrorResponseSchema,
          404: SalesOrderErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await sessionFor(request);
      if (!session) {
        return reply.code(401).send({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const order = await options.salesOrderService.getById(session.tenant.id, request.params.id);
      if (!order) {
        return reply.code(404).send({
          code: "ORDER_NOT_FOUND",
          message: "Đơn hàng không tồn tại hoặc không thuộc quyền quản lý",
        });
      }

      return reply.code(200).send(order);
    },
  );

  return Promise.resolve();
};
