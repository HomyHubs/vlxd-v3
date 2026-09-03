import { randomUUID } from "node:crypto";

import type { CreateCustomerRequest, Customer } from "@vlxd/shared";
import type { Kysely } from "kysely";

import type { Database } from "../../platform/database.js";

export type CreateCustomerResult =
  | { success: true; customer: Customer }
  | { success: false; code: "CUSTOMER_CODE_EXISTS"; message: string };

export interface CustomerService {
  list(tenantId: string): Promise<Customer[]>;
  create(tenantId: string, input: CreateCustomerRequest): Promise<CreateCustomerResult>;
}

export interface CustomerServiceDependencies {
  database: Kysely<Database>;
}

export function createCustomerService(dependencies: CustomerServiceDependencies): CustomerService {
  const db = dependencies.database;

  return {
    async list(tenantId) {
      const rows = await db
        .selectFrom("customers")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .orderBy("created_at", "asc")
        .execute();

      return rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        phone: r.phone,
        address: r.address,
        createdAt: r.created_at.toISOString(),
      }));
    },

    async create(tenantId, input) {
      const existing = await db
        .selectFrom("customers")
        .select("id")
        .where("tenant_id", "=", tenantId)
        .where("code", "=", input.code)
        .executeTakeFirst();

      if (existing) {
        return {
          success: false,
          code: "CUSTOMER_CODE_EXISTS",
          message: `Mã khách hàng "${input.code}" đã tồn tại`,
        };
      }

      const id = `cust-${randomUUID()}`;
      const now = new Date();

      await db
        .insertInto("customers")
        .values({
          id,
          tenant_id: tenantId,
          code: input.code,
          name: input.name,
          phone: input.phone ?? null,
          address: input.address ?? null,
        })
        .execute();

      return {
        success: true,
        customer: {
          id,
          code: input.code,
          name: input.name,
          phone: input.phone ?? null,
          address: input.address ?? null,
          createdAt: now.toISOString(),
        },
      };
    },
  };
}
