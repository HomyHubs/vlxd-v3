import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CreateProductRequestSchema,
  ProductErrorResponseSchema,
  ProductListQuerySchema,
  ProductListResponseSchema,
  ProductSchema,
} from "@vlxd/shared";

import { SESSION_COOKIE_NAME, type AuthService } from "../auth/index.js";
import type { ProductService } from "./service.js";

export interface ProductRoutesOptions {
  authService: AuthService;
  productService: ProductService;
}

export const productRoutes: FastifyPluginAsync<ProductRoutesOptions> = (server, options) => {
  const app = server.withTypeProvider<ZodTypeProvider>();

  async function sessionFor(request: {
    cookies: Record<string, string | undefined>;
    log: Parameters<AuthService["getMe"]>[1];
  }) {
    const token = request.cookies[SESSION_COOKIE_NAME];
    return token ? options.authService.getMe(token, request.log) : null;
  }

  app.get(
    "/products",
    {
      schema: {
        querystring: ProductListQuerySchema,
        response: { 200: ProductListResponseSchema, 401: ProductErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const session = await sessionFor(request);
      if (!session) {
        return reply.code(401).send({ code: "UNAUTHORIZED", message: "Chưa đăng nhập" });
      }
      return reply
        .code(200)
        .send(await options.productService.list(session.tenant.id, request.query));
    },
  );

  app.post(
    "/products",
    {
      schema: {
        body: CreateProductRequestSchema,
        response: {
          201: ProductSchema,
          400: ProductErrorResponseSchema,
          401: ProductErrorResponseSchema,
          409: ProductErrorResponseSchema,
          422: ProductErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await sessionFor(request);
      if (!session) {
        return reply.code(401).send({ code: "UNAUTHORIZED", message: "Chưa đăng nhập" });
      }
      const result = await options.productService.create(
        session.tenant.id,
        session.tenant.plan,
        request.body,
      );
      if (result.success) return reply.code(201).send(result.product);
      const status =
        result.code === "PRODUCT_LIMIT_REACHED"
          ? 422
          : result.code === "PRODUCT_SKU_EXISTS"
            ? 409
            : 400;
      return reply.code(status).send({ code: result.code, message: result.message });
    },
  );

  return Promise.resolve();
};
