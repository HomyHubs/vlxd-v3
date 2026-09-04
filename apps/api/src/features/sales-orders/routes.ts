import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  CreateSalesOrderRequestSchema,
  OrderPaymentsListResponseSchema,
  PaymentErrorResponseSchema,
  RecordPaymentRequestSchema,
  RecordPaymentResponseSchema,
  SalesOrderDetailResponseSchema,
  SalesOrderErrorResponseSchema,
  SalesOrderListResponseSchema,
  SalesOrderQuerySchema,
} from "@vlxd/shared";

import { createRequireCapability, type AuthService } from "../auth/index.js";
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
  const requireCap = createRequireCapability(options.authService);

  app.get(
    "/sales-orders",
    {
      preHandler: [requireCap("sales.view")],
      schema: {
        querystring: SalesOrderQuerySchema,
        response: {
          200: SalesOrderListResponseSchema,
          401: SalesOrderErrorResponseSchema,
          403: SalesOrderErrorResponseSchema,
          409: SalesOrderErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
      const result = await options.salesOrderService.list(session.tenant.id, request.query);
      return reply.code(200).send(result);
    },
  );

  app.post(
    "/sales-orders",
    {
      preHandler: [requireCap("sales.create")],
      schema: {
        body: CreateSalesOrderRequestSchema,
        response: {
          201: SalesOrderDetailResponseSchema,
          400: SalesOrderErrorResponseSchema,
          401: SalesOrderErrorResponseSchema,
          403: SalesOrderErrorResponseSchema,
          404: SalesOrderErrorResponseSchema,
          409: SalesOrderErrorResponseSchema,
          422: SalesOrderErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
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
      preHandler: [requireCap("sales.view")],
      schema: {
        params: IdParamSchema,
        response: {
          200: SalesOrderDetailResponseSchema,
          401: SalesOrderErrorResponseSchema,
          403: SalesOrderErrorResponseSchema,
          404: SalesOrderErrorResponseSchema,
          409: SalesOrderErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
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

  app.post(
    "/sales-orders/:id/payments",
    {
      preHandler: [requireCap("sales.create")],
      schema: {
        params: IdParamSchema,
        body: RecordPaymentRequestSchema,
        response: {
          201: RecordPaymentResponseSchema,
          400: PaymentErrorResponseSchema,
          401: PaymentErrorResponseSchema,
          403: PaymentErrorResponseSchema,
          404: PaymentErrorResponseSchema,
          409: PaymentErrorResponseSchema,
          422: PaymentErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
      const result = await options.salesOrderService.recordPayment(
        session.tenant.id,
        session.user.id,
        request.params.id,
        request.body,
      );

      if (!result.success) {
        let statusCode: 400 | 404 | 422 = 400;
        if (result.code === "AMOUNT_EXCEEDS_REMAINING" || result.code === "ORDER_ALREADY_PAID") {
          statusCode = 422;
        } else if (result.code === "ORDER_NOT_FOUND") {
          statusCode = 404;
        }

        return reply.code(statusCode).send({ code: result.code, message: result.message });
      }

      return reply.code(201).send(result.response);
    },
  );

  app.get(
    "/sales-orders/:id/payments",
    {
      preHandler: [requireCap("sales.view")],
      schema: {
        params: IdParamSchema,
        response: {
          200: OrderPaymentsListResponseSchema,
          401: PaymentErrorResponseSchema,
          403: PaymentErrorResponseSchema,
          404: PaymentErrorResponseSchema,
          409: PaymentErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
      const result = await options.salesOrderService.listPayments(
        session.tenant.id,
        request.params.id,
      );

      if (!result) {
        return reply.code(404).send({
          code: "ORDER_NOT_FOUND",
          message: "Đơn hàng không tồn tại hoặc không thuộc quyền quản lý",
        });
      }

      return reply.code(200).send(result);
    },
  );

  return Promise.resolve();
};
