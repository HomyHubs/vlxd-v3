import { randomBytes } from "node:crypto";

import { verify } from "@node-rs/argon2";
import type { AuthSessionResponse, LoginRequest } from "@vlxd/shared";
import type { Kysely } from "kysely";

import type { Database } from "../../platform/database.js";

export interface AuthLogger {
  error(obj: unknown, msg?: string): void;
  warn?(obj: unknown, msg?: string): void;
  info?(obj: unknown, msg?: string): void;
}

export type LoginResult =
  | { success: true; sessionToken: string; sessionResponse: AuthSessionResponse }
  | { success: false; code: "INVALID_CREDENTIALS" | "UNAUTHORIZED"; message: string };

export interface AuthService {
  login(credentials: LoginRequest, logger?: AuthLogger): Promise<LoginResult>;
  logout(sessionToken: string, logger?: AuthLogger): Promise<void>;
  getMe(sessionToken: string, logger?: AuthLogger): Promise<AuthSessionResponse | null>;
}

export interface AuthServiceDependencies {
  database: Kysely<Database>;
  sessionDurationMs?: number;
}

export function createAuthService(dependencies: AuthServiceDependencies): AuthService {
  const sessionDurationMs = dependencies.sessionDurationMs ?? 7 * 24 * 60 * 60 * 1000;
  const db = dependencies.database;

  return {
    async login(credentials, logger) {
      const email = credentials.email.trim().toLowerCase();

      const user = await db
        .selectFrom("users")
        .selectAll()
        .where("email", "=", email)
        .executeTakeFirst();

      if (!user) {
        return {
          success: false,
          code: "INVALID_CREDENTIALS",
          message: "Email hoặc mật khẩu không chính xác",
        };
      }

      if (user.status !== "active") {
        return {
          success: false,
          code: "INVALID_CREDENTIALS",
          message: "Tài khoản đã bị vô hiệu hoá",
        };
      }

      const isPasswordValid = await verify(user.password_hash, credentials.password);
      if (!isPasswordValid) {
        return {
          success: false,
          code: "INVALID_CREDENTIALS",
          message: "Email hoặc mật khẩu không chính xác",
        };
      }

      const tenant = await db
        .selectFrom("tenants")
        .selectAll()
        .where("id", "=", user.tenant_id)
        .executeTakeFirst();

      if (!tenant) {
        if (logger) {
          logger.error({ userId: user.id, tenantId: user.tenant_id }, "Tenant not found for user");
        }
        return {
          success: false,
          code: "INVALID_CREDENTIALS",
          message: "Không tìm thấy thông tin cửa hàng",
        };
      }

      // Generate opaque cryptographically random session token
      const sessionToken = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + sessionDurationMs);

      await db
        .insertInto("sessions")
        .values({
          id: sessionToken,
          user_id: user.id,
          tenant_id: tenant.id,
          expires_at: expiresAt,
        })
        .execute();

      return {
        success: true,
        sessionToken,
        sessionResponse: {
          user: {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            tenantId: user.tenant_id,
            status: user.status,
          },
          tenant: {
            id: tenant.id,
            name: tenant.name,
            code: tenant.code,
            plan: tenant.plan,
          },
        },
      };
    },

    async logout(sessionToken) {
      if (!sessionToken) return;
      await db.deleteFrom("sessions").where("id", "=", sessionToken).execute();
    },

    async getMe(sessionToken) {
      if (!sessionToken) return null;

      const now = new Date();
      const session = await db
        .selectFrom("sessions")
        .innerJoin("users", "users.id", "sessions.user_id")
        .innerJoin("tenants", "tenants.id", "sessions.tenant_id")
        .select([
          "sessions.id as sessionId",
          "sessions.expires_at as expiresAt",
          "users.id as userId",
          "users.email as userEmail",
          "users.full_name as userFullName",
          "users.tenant_id as userTenantId",
          "users.status as userStatus",
          "tenants.id as tenantId",
          "tenants.name as tenantName",
          "tenants.code as tenantCode",
          "tenants.plan as tenantPlan",
        ])
        .where("sessions.id", "=", sessionToken)
        .where("sessions.expires_at", ">", now)
        .where("users.status", "=", "active")
        .executeTakeFirst();

      if (!session) {
        return null;
      }

      return {
        user: {
          id: session.userId,
          email: session.userEmail,
          fullName: session.userFullName,
          tenantId: session.userTenantId,
          status: session.userStatus,
        },
        tenant: {
          id: session.tenantId,
          name: session.tenantName,
          code: session.tenantCode,
          plan: session.tenantPlan,
        },
      };
    },
  };
}
