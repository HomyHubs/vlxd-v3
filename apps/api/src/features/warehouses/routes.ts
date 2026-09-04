import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CreateWarehouseRequestSchema,
  WarehouseErrorResponseSchema,
  WarehouseListResponseSchema,
  WarehouseSchema,
} from "@vlxd/shared";

import { createRequireCapability, type AuthService } from "../auth/index.js";
import type { WarehouseService } from "./service.js";

export interface WarehouseRoutesOptions {
  authService: AuthService;
  warehouseService: WarehouseService;
}

export const warehouseRoutes: FastifyPluginAsync<WarehouseRoutesOptions> = (server, options) => {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const requireCap = createRequireCapability(options.authService);

  app.get(
    "/warehouses",
    {
      preHandler: [requireCap("inventory.view")],
      schema: {
        response: {
          200: WarehouseListResponseSchema,
          401: WarehouseErrorResponseSchema,
          403: WarehouseErrorResponseSchema,
          409: WarehouseErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
      return reply.code(200).send(await options.warehouseService.list(session.tenant.id));
    },
  );

  app.post(
    "/warehouses",
    {
      preHandler: [requireCap("inventory.manage")],
      schema: {
        body: CreateWarehouseRequestSchema,
        response: {
          201: WarehouseSchema,
          400: WarehouseErrorResponseSchema,
          401: WarehouseErrorResponseSchema,
          403: WarehouseErrorResponseSchema,
          409: WarehouseErrorResponseSchema,
          422: WarehouseErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
      const result = await options.warehouseService.create(
        session.tenant.id,
        session.tenant.plan,
        request.body,
      );
      if (result.success) return reply.code(201).send(result.warehouse);
      const status = result.code === "WAREHOUSE_LIMIT_REACHED" ? 422 : 409;
      return reply.code(status).send({ code: result.code, message: result.message });
    },
  );

  return Promise.resolve();
};
