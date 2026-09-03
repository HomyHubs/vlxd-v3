import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CreateProductRequestSchema,
  ProductErrorResponseSchema,
  ProductListQuerySchema,
  ProductListResponseSchema,
  ProductSchema,
} from "@vlxd/shared";

import { createRequireCapability, type AuthService } from "../auth/index.js";
import type { ProductService } from "./service.js";

export interface ProductRoutesOptions {
  authService: AuthService;
  productService: ProductService;
}

export const productRoutes: FastifyPluginAsync<ProductRoutesOptions> = (server, options) => {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const requireCap = createRequireCapability(options.authService);

  app.get(
    "/products",
    {
      preHandler: [requireCap("products.view")],
      schema: {
        querystring: ProductListQuerySchema,
        response: {
          200: ProductListResponseSchema,
          401: ProductErrorResponseSchema,
          403: ProductErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
      return reply
        .code(200)
        .send(await options.productService.list(session.tenant.id, request.query));
    },
  );

  app.post(
    "/products",
    {
      preHandler: [requireCap("products.manage")],
      schema: {
        body: CreateProductRequestSchema,
        response: {
          201: ProductSchema,
          400: ProductErrorResponseSchema,
          401: ProductErrorResponseSchema,
          403: ProductErrorResponseSchema,
          409: ProductErrorResponseSchema,
          422: ProductErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
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
