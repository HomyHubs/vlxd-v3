import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CreateCustomerRequestSchema,
  CustomerErrorResponseSchema,
  CustomerListResponseSchema,
  CustomerSchema,
} from "@vlxd/shared";

import { createRequireCapability, type AuthService } from "../auth/index.js";
import type { CustomerService } from "./service.js";

export interface CustomerRoutesOptions {
  authService: AuthService;
  customerService: CustomerService;
}

export const customerRoutes: FastifyPluginAsync<CustomerRoutesOptions> = (server, options) => {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const requireCap = createRequireCapability(options.authService);

  app.get(
    "/customers",
    {
      preHandler: [requireCap("customers.manage")],
      schema: {
        response: {
          200: CustomerListResponseSchema,
          401: CustomerErrorResponseSchema,
          403: CustomerErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
      const items = await options.customerService.list(session.tenant.id);
      return reply.code(200).send({ items, total: items.length });
    },
  );

  app.post(
    "/customers",
    {
      preHandler: [requireCap("customers.manage")],
      schema: {
        body: CreateCustomerRequestSchema,
        response: {
          201: CustomerSchema,
          400: CustomerErrorResponseSchema,
          401: CustomerErrorResponseSchema,
          403: CustomerErrorResponseSchema,
          409: CustomerErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
      const result = await options.customerService.create(session.tenant.id, request.body);
      if (!result.success) {
        return reply.code(409).send({ code: result.code, message: result.message });
      }

      return reply.code(201).send(result.customer);
    },
  );

  return Promise.resolve();
};
