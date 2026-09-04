import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  CreateUserRequestSchema,
  TitleListResponseSchema,
  UserErrorResponseSchema,
  UserItemSchema,
  UserListResponseSchema,
} from "@vlxd/shared";

import { createRequireCapability, type AuthService } from "../auth/index.js";
import type { UsersService } from "./service.js";

export interface UsersRoutesOptions {
  authService: AuthService;
  usersService: UsersService;
}

export const usersRoutes: FastifyPluginAsync<UsersRoutesOptions> = (server, options) => {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const requireCap = createRequireCapability(options.authService);

  // GET /titles - List available titles (requires users.manage)
  app.get(
    "/titles",
    {
      preHandler: [requireCap("users.manage")],
      schema: {
        response: {
          200: TitleListResponseSchema,
          401: UserErrorResponseSchema,
          403: UserErrorResponseSchema,
          409: UserErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
      const items = await options.usersService.listTitles(session.tenant.id);
      return reply.code(200).send({ items });
    },
  );

  // GET /users - List users (requires users.manage)
  app.get(
    "/users",
    {
      preHandler: [requireCap("users.manage")],
      schema: {
        response: {
          200: UserListResponseSchema,
          401: UserErrorResponseSchema,
          403: UserErrorResponseSchema,
          409: UserErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
      const items = await options.usersService.listUsers(session.tenant.id);
      return reply.code(200).send({ items });
    },
  );

  // POST /users - Create user (requires users.manage)
  app.post(
    "/users",
    {
      preHandler: [requireCap("users.manage")],
      schema: {
        body: CreateUserRequestSchema,
        response: {
          201: UserItemSchema,
          400: UserErrorResponseSchema,
          401: UserErrorResponseSchema,
          403: UserErrorResponseSchema,
          409: UserErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
      const result = await options.usersService.createUser(session.tenant.id, request.body);

      if (!result.success) {
        if (result.code === "EMAIL_EXISTS") {
          return reply.code(409).send({ code: result.code, message: result.message });
        }
        return reply.code(400).send({ code: result.code, message: result.message });
      }

      return reply.code(201).send(result.user);
    },
  );

  return Promise.resolve();
};
