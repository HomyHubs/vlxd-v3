import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  AuthErrorResponseSchema,
  AuthLogoutResponseSchema,
  AuthSessionResponseSchema,
  LoginRequestSchema,
} from "./schema.js";
import type { AuthService } from "./service.js";

export const SESSION_COOKIE_NAME = "vlxd_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface AuthRoutesOptions {
  authService: AuthService;
  secureCookies?: boolean | undefined;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = (server, options) => {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const isSecure = options.secureCookies ?? true;

  app.post(
    "/auth/login",
    {
      schema: {
        body: LoginRequestSchema,
        response: {
          200: AuthSessionResponseSchema,
          400: AuthErrorResponseSchema,
          401: AuthErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await options.authService.login(request.body, request.log);

      if (!result.success) {
        return reply.code(401).send({
          code: result.code,
          message: result.message,
        });
      }

      void reply.setCookie(SESSION_COOKIE_NAME, result.sessionToken, {
        path: "/",
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE_SECONDS,
      });

      return reply.code(200).send(result.sessionResponse);
    },
  );

  app.post(
    "/auth/logout",
    {
      schema: {
        response: {
          200: AuthLogoutResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const sessionToken = request.cookies[SESSION_COOKIE_NAME];
      if (sessionToken) {
        await options.authService.logout(sessionToken, request.log);
      }

      void reply.clearCookie(SESSION_COOKIE_NAME, {
        path: "/",
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
      });

      return reply.code(200).send({ success: true });
    },
  );

  app.get(
    "/auth/me",
    {
      schema: {
        response: {
          200: AuthSessionResponseSchema,
          401: AuthErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const sessionToken = request.cookies[SESSION_COOKIE_NAME];
      if (!sessionToken) {
        return reply.code(401).send({
          code: "UNAUTHORIZED",
          message: "Chưa đăng nhập",
        });
      }

      const session = await options.authService.getMe(sessionToken, request.log);
      if (!session) {
        void reply.clearCookie(SESSION_COOKIE_NAME, {
          path: "/",
          httpOnly: true,
          secure: isSecure,
          sameSite: "lax",
        });
        return reply.code(401).send({
          code: "UNAUTHORIZED",
          message: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ",
        });
      }

      return reply.code(200).send(session);
    },
  );

  return Promise.resolve();
};
