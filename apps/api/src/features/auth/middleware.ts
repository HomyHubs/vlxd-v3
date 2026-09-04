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

      // Precondition checks: X-Expected-Tenant-Id and X-Session-Context
      const expectedTenantId = (request.headers["x-expected-tenant-id"] ??
        request.headers["X-Expected-Tenant-Id"]) as string | undefined;
      const expectedSessionContext = (request.headers["x-session-context"] ??
        request.headers["X-Session-Context"]) as string | undefined;

      if (!expectedTenantId || expectedTenantId !== session.tenant.id) {
        return reply.code(409).send({
          code: "AUTH_CONTEXT_CHANGED",
          message: !expectedTenantId
            ? "Header 'x-expected-tenant-id' là bắt buộc để xác thực ngữ cảnh tenant"
            : "Ngữ cảnh tenant đã thay đổi trên phiên đăng nhập hiện tại",
        });
      }

      if (expectedSessionContext) {
        const currentSessionContext = `${session.tenant.id}:${session.user.id}`;
        if (expectedSessionContext !== currentSessionContext) {
          return reply.code(409).send({
            code: "AUTH_CONTEXT_CHANGED",
            message: "Ngữ cảnh phiên đăng nhập đã thay đổi",
          });
        }
      }

      request.session = session;

      const userCaps = session.user.capabilities ?? [];
      if (!userCaps.includes(capability)) {
        return reply.code(403).send({
          code: "FORBIDDEN",
          message: `Bạn không có quyền thực hiện thao tác này (yêu cầu quyền: ${capability})`,
        });
      }
    };
  };
}
