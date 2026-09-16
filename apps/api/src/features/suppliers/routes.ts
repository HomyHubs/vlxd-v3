import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CreateSupplierRequestSchema,
  SupplierErrorResponseSchema,
  SupplierListResponseSchema,
  SupplierSchema,
} from "@vlxd/shared";
import { createRequireCapability, type AuthService } from "../auth/index.js";
import type { SupplierService } from "./service.js";
export interface SupplierRoutesOptions {
  authService: AuthService;
  supplierService: SupplierService;
}
export const supplierRoutes: FastifyPluginAsync<SupplierRoutesOptions> = (server, options) => {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const requireCap = createRequireCapability(options.authService);
  app.get(
    "/suppliers",
    {
      preHandler: [requireCap("purchasing.view")],
      schema: {
        response: {
          200: SupplierListResponseSchema,
          401: SupplierErrorResponseSchema,
          403: SupplierErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const items = await options.supplierService.list(request.session!.tenant.id);
      return reply.send({ items, total: items.length });
    },
  );
  app.post(
    "/suppliers",
    {
      preHandler: [requireCap("purchasing.manage")],
      schema: {
        body: CreateSupplierRequestSchema,
        response: {
          201: SupplierSchema,
          400: SupplierErrorResponseSchema,
          401: SupplierErrorResponseSchema,
          403: SupplierErrorResponseSchema,
          409: SupplierErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await options.supplierService.create(request.session!.tenant.id, request.body);
      if (!result.success)
        return reply.code(409).send({ code: result.code, message: result.message });
      return reply.code(201).send(result.supplier);
    },
  );
  return Promise.resolve();
};
