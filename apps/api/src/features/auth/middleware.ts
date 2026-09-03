import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthSessionResponse } from "@vlxd/shared";

import { SESSION_COOKIE_NAME } from "./routes.js";
import type { AuthService } from "./service.js";

declare module "fastify" {
  interface FastifyRequest {
    session?: AuthSessionResponse;
  }
}

export function createRequireCapability(authService: AuthService) {
  return (capability: string) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const cookies = (request.cookies ?? {}) as Record<string, string | undefined>;
      const token = cookies[SESSION_COOKIE_NAME];
      if (!token) {
        return reply.code(401).send({ code: "UNAUTHORIZED", message: "Yêu cầu đăng nhập" });
      }

      const session = await authService.getMe(token, request.log);
      if (!session) {
        return reply
          .code(401)
          .send({ code: "UNAUTHORIZED", message: "Phiên đăng nhập không hợp lệ" });
      }

      request.session = session;

      if (!session.user.capabilities.includes(capability)) {
        return reply.code(403).send({
          code: "FORBIDDEN",
          message: `Bạn không có quyền thực hiện thao tác này (yêu cầu quyền: ${capability})`,
        });
      }
    };
  };
}
