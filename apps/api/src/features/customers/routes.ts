import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CreateCustomerRequestSchema,
  CustomerErrorResponseSchema,
  CustomerListResponseSchema,
  CustomerSchema,
} from "@vlxd/shared";

import { SESSION_COOKIE_NAME, type AuthService } from "../auth/index.js";
import type { CustomerService } from "./service.js";

export interface CustomerRoutesOptions {
  authService: AuthService;
  customerService: CustomerService;
}

export const customerRoutes: FastifyPluginAsync<CustomerRoutesOptions> = (server, options) => {
  const app = server.withTypeProvider<ZodTypeProvider>();

  async function sessionFor(request: {
    cookies: Record<string, string | undefined>;
    log: Parameters<AuthService["getMe"]>[1];
  }) {
    const token = request.cookies[SESSION_COOKIE_NAME];
    return token ? options.authService.getMe(token, request.log) : null;
  }

  app.get(
    "/customers",
    {
      schema: {
        response: {
          200: CustomerListResponseSchema,
          401: CustomerErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await sessionFor(request);
      if (!session) {
        return reply.code(401).send({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const items = await options.customerService.list(session.tenant.id);
      return reply.code(200).send({ items, total: items.length });
    },
  );

  app.post(
    "/customers",
    {
      schema: {
        body: CreateCustomerRequestSchema,
        response: {
          201: CustomerSchema,
          400: CustomerErrorResponseSchema,
          401: CustomerErrorResponseSchema,
          409: CustomerErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await sessionFor(request);
      if (!session) {
        return reply.code(401).send({ code: "UNAUTHORIZED", message: "Not authenticated" });
      }

      const result = await options.customerService.create(session.tenant.id, request.body);
      if (!result.success) {
        return reply.code(409).send({ code: result.code, message: result.message });
      }

      return reply.code(201).send(result.customer);
    },
  );

  return Promise.resolve();
};
