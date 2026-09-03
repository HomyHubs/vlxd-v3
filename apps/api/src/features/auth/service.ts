import { createHash, randomBytes } from "node:crypto";

import { verify } from "@node-rs/argon2";
import type { AuthSessionResponse, LoginRequest } from "@vlxd/shared";
import type { Kysely } from "kysely";

import type { Database } from "../../platform/database.js";

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

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

async function getUserTitlesAndCapabilities(
  db: Kysely<Database>,
  userId: string,
): Promise<{ titles: string[]; capabilities: string[] }> {
  try {
    const userTitleRows = await db
      .selectFrom("user_titles")
      .innerJoin("titles", "titles.id", "user_titles.title_id")
      .select(["titles.name as titleName", "titles.id as titleId"])
      .where("user_titles.user_id", "=", userId)
      .execute();

    const titles = userTitleRows.map((t) => t.titleName);
    const titleIds = userTitleRows.map((t) => t.titleId);

    if (titleIds.length === 0) {
      return { titles: [], capabilities: [] };
    }

    const capRows = await db
      .selectFrom("title_role_groups")
      .innerJoin(
        "role_group_capabilities",
        "role_group_capabilities.role_group_id",
        "title_role_groups.role_group_id",
      )
      .select("role_group_capabilities.capability_id as capabilityId")
      .where("title_role_groups.title_id", "in", titleIds)
      .execute();

    const capabilities = Array.from(new Set(capRows.map((c) => c.capabilityId)));
    return { titles, capabilities };
  } catch {
    return { titles: [], capabilities: [] };
  }
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

      if (!user || user.status !== "active") {
        if (logger?.warn) {
          logger.warn({ email }, "login failed: user not found or inactive");
        }
        return {
          success: false,
          code: "INVALID_CREDENTIALS",
          message: "Email hoặc mật khẩu không chính xác",
        };
      }

      const isPasswordValid = await verify(user.password_hash, credentials.password);
      if (!isPasswordValid) {
        if (logger?.warn) {
          logger.warn({ email }, "login failed: invalid password");
        }
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
        if (logger?.error) {
          logger.error({ email, tenantId: user.tenant_id }, "login failed: tenant not found");
        }
        return {
          success: false,
          code: "UNAUTHORIZED",
          message: "Tài khoản không thuộc tổ chức hợp lệ",
        };
      }

      // Generate opaque cryptographically random session token
      const sessionToken = randomBytes(32).toString("base64url");
      const hashedSessionToken = hashSessionToken(sessionToken);
      const expiresAt = new Date(Date.now() + sessionDurationMs);

      await db
        .insertInto("sessions")
        .values({
          id: hashedSessionToken,
          user_id: user.id,
          tenant_id: tenant.id,
          expires_at: expiresAt,
        })
        .execute();

      const { titles, capabilities } = await getUserTitlesAndCapabilities(db, user.id);

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
            titles,
            capabilities,
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
      const hashedSessionToken = hashSessionToken(sessionToken);
      await db.deleteFrom("sessions").where("id", "=", hashedSessionToken).execute();
    },

    async getMe(sessionToken) {
      if (!sessionToken) return null;
      const hashedSessionToken = hashSessionToken(sessionToken);

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
        .where("sessions.id", "=", hashedSessionToken)
        .where("sessions.expires_at", ">", now)
        .where("users.status", "=", "active")
        .whereRef("users.tenant_id", "=", "sessions.tenant_id")
        .executeTakeFirst();

      if (!session) {
        return null;
      }

      const { titles, capabilities } = await getUserTitlesAndCapabilities(db, session.userId);

      return {
        user: {
          id: session.userId,
          email: session.userEmail,
          fullName: session.userFullName,
          tenantId: session.userTenantId,
          status: session.userStatus,
          titles,
          capabilities,
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
