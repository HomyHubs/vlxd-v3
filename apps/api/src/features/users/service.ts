import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import type { CreateUserRequest, TitleItem, UserItem } from "@vlxd/shared";
import type { Kysely } from "kysely";

import type { Database } from "../../platform/database.js";

export type CreateUserResult =
  | { success: true; user: UserItem }
  | { success: false; code: "TITLE_NOT_FOUND" | "EMAIL_EXISTS" | "INVALID_INPUT"; message: string };

export interface UsersService {
  listTitles(tenantId: string): Promise<TitleItem[]>;
  listUsers(tenantId: string): Promise<UserItem[]>;
  createUser(tenantId: string, input: CreateUserRequest): Promise<CreateUserResult>;
}

export function createUsersService(db: Kysely<Database>): UsersService {
  return {
    async listTitles(tenantId: string): Promise<TitleItem[]> {
      const titles = await db
        .selectFrom("titles")
        .select(["id", "code", "name"])
        .where("tenant_id", "=", tenantId)
        .orderBy("name", "asc")
        .execute();

      return titles;
    },

    async listUsers(tenantId: string): Promise<UserItem[]> {
      const users = await db
        .selectFrom("users")
        .select(["id", "email", "full_name as fullName", "status", "created_at as createdAt"])
        .where("tenant_id", "=", tenantId)
        .orderBy("created_at", "desc")
        .execute();

      if (users.length === 0) {
        return [];
      }

      const userIds = users.map((u) => u.id);

      const userTitles = await db
        .selectFrom("user_titles")
        .innerJoin("titles", "titles.id", "user_titles.title_id")
        .select(["user_titles.user_id as userId", "titles.name as titleName"])
        .where("user_titles.user_id", "in", userIds)
        .execute();

      const userTitleMap = new Map<string, string[]>();
      for (const ut of userTitles) {
        const list = userTitleMap.get(ut.userId) ?? [];
        list.push(ut.titleName);
        userTitleMap.set(ut.userId, list);
      }

      return users.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        status: u.status,
        titles: userTitleMap.get(u.id) ?? [],
        createdAt: u.createdAt.toISOString(),
      }));
    },

    async createUser(tenantId: string, input: CreateUserRequest): Promise<CreateUserResult> {
      const email = input.email.trim().toLowerCase();
      const fullName = input.fullName.trim();

      if (!email || !fullName || input.password.length < 6) {
        return {
          success: false,
          code: "INVALID_INPUT",
          message: "Dữ liệu người dùng không hợp lệ hoặc mật khẩu dưới 6 ký tự",
        };
      }

      // Verify title exists in this tenant
      const title = await db
        .selectFrom("titles")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .where("id", "=", input.titleId)
        .executeTakeFirst();

      if (!title) {
        return {
          success: false,
          code: "TITLE_NOT_FOUND",
          message: "Chức danh được chọn không tồn tại",
        };
      }

      // Check existing email
      const existingUser = await db
        .selectFrom("users")
        .select("id")
        .where("email", "=", email)
        .executeTakeFirst();

      if (existingUser) {
        return {
          success: false,
          code: "EMAIL_EXISTS",
          message: "Email này đã được sử dụng trong hệ thống",
        };
      }

      const passwordHash = await hash(input.password);
      const userId = `user-${randomUUID()}`;
      const now = new Date();

      try {
        await db.transaction().execute(async (trx) => {
          await trx
            .insertInto("users")
            .values({
              id: userId,
              tenant_id: tenantId,
              email,
              full_name: fullName,
              password_hash: passwordHash,
              status: "active",
            })
            .execute();

          await trx
            .insertInto("user_titles")
            .values({
              user_id: userId,
              title_id: title.id,
              tenant_id: tenantId,
            })
            .execute();
        });

        return {
          success: true,
          user: {
            id: userId,
            email,
            fullName,
            status: "active",
            titles: [title.name],
            createdAt: now.toISOString(),
          },
        };
      } catch (error: unknown) {
        const isUniqueViolation =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: string }).code === "23505";

        if (isUniqueViolation) {
          return {
            success: false,
            code: "EMAIL_EXISTS",
            message: "Email này đã được sử dụng trong hệ thống",
          };
        }
        throw error;
      }
    },
  };
}
