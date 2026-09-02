import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CreateWarehouseRequestSchema,
  WarehouseErrorResponseSchema,
  WarehouseListResponseSchema,
  WarehouseSchema,
} from "@vlxd/shared";

import { SESSION_COOKIE_NAME, type AuthService } from "../auth/index.js";
import type { WarehouseService } from "./service.js";

export interface WarehouseRoutesOptions {
  authService: AuthService;
  warehouseService: WarehouseService;
}

export const warehouseRoutes: FastifyPluginAsync<WarehouseRoutesOptions> = (server, options) => {
  const app = server.withTypeProvider<ZodTypeProvider>();

  async function sessionFor(request: {
    cookies: Record<string, string | undefined>;
    log: Parameters<AuthService["getMe"]>[1];
  }) {
    const token = request.cookies[SESSION_COOKIE_NAME];
    return token ? options.authService.getMe(token, request.log) : null;
  }

  app.get(
    "/warehouses",
    {
      schema: { response: { 200: WarehouseListResponseSchema, 401: WarehouseErrorResponseSchema } },
    },
    async (request, reply) => {
      const session = await sessionFor(request);
      if (!session) {
        return reply.code(401).send({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }
      return reply.code(200).send(await options.warehouseService.list(session.tenant.id));
    },
  );

  app.post(
    "/warehouses",
    {
      schema: {
        body: CreateWarehouseRequestSchema,
        response: {
          201: WarehouseSchema,
          400: WarehouseErrorResponseSchema,
          401: WarehouseErrorResponseSchema,
          409: WarehouseErrorResponseSchema,
          422: WarehouseErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await sessionFor(request);
      if (!session) {
        return reply.code(401).send({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }
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
