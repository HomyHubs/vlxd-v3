import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CreatePurchaseOrderRequestSchema,
  PurchaseOrderErrorResponseSchema,
  PurchaseOrderListResponseSchema,
  PurchaseOrderSchema,
} from "@vlxd/shared";
import { createRequireCapability, type AuthService } from "../auth/index.js";
import type { PurchaseOrderService } from "./service.js";
import { z } from "zod";
export interface PurchaseOrderRoutesOptions {
  authService: AuthService;
  purchaseOrderService: PurchaseOrderService;
}
const Query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const Id = z.object({ id: z.string().min(1) });
export const purchaseOrderRoutes: FastifyPluginAsync<PurchaseOrderRoutesOptions> = (
  server,
  options,
) => {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const cap = createRequireCapability(options.authService);
  app.get(
    "/purchase-orders",
    {
      preHandler: [cap("purchasing.view")],
      schema: {
        querystring: Query,
        response: {
          200: PurchaseOrderListResponseSchema,
          401: PurchaseOrderErrorResponseSchema,
          403: PurchaseOrderErrorResponseSchema,
        },
      },
    },
    async (req, rep) =>
      rep.send(await options.purchaseOrderService.list(req.session!.tenant.id, req.query)),
  );
  app.post(
    "/purchase-orders",
    {
      preHandler: [cap("purchasing.manage")],
      schema: {
        body: CreatePurchaseOrderRequestSchema,
        response: {
          201: PurchaseOrderSchema,
          400: PurchaseOrderErrorResponseSchema,
          401: PurchaseOrderErrorResponseSchema,
          403: PurchaseOrderErrorResponseSchema,
          404: PurchaseOrderErrorResponseSchema,
        },
      },
    },
    async (req, rep) => {
      const r = await options.purchaseOrderService.create(
        req.session!.tenant.id,
        req.session!.user.id,
        req.body,
      );
      if (!r.success)
        return rep
          .code(r.code === "INVALID_ORDER_LINES" ? 400 : 404)
          .send({ code: r.code, message: r.message });
      return rep.code(201).send(r.order);
    },
  );
  app.get(
    "/purchase-orders/:id",
    {
      preHandler: [cap("purchasing.view")],
      schema: {
        params: Id,
        response: {
          200: PurchaseOrderSchema,
          401: PurchaseOrderErrorResponseSchema,
          403: PurchaseOrderErrorResponseSchema,
          404: PurchaseOrderErrorResponseSchema,
        },
      },
    },
    async (req, rep) => {
      const r = await options.purchaseOrderService.getById(req.session!.tenant.id, req.params.id);
      if (!r)
        return rep.code(404).send({ code: "PRODUCT_NOT_FOUND", message: "Đơn mua không tồn tại" });
      return rep.send(r);
    },
  );
  return Promise.resolve();
};
