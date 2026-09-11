import { randomUUID } from "node:crypto";
import type { CreateSupplierRequest, Supplier } from "@vlxd/shared";
import type { Kysely } from "kysely";
import type { Database } from "../../platform/database.js";

export interface SupplierService {
  list(tenantId: string): Promise<Supplier[]>;
  create(
    tenantId: string,
    input: CreateSupplierRequest,
  ): Promise<
    | { success: true; supplier: Supplier }
    | { success: false; code: "SUPPLIER_CODE_EXISTS"; message: string }
  >;
}
export interface SupplierServiceDependencies {
  database: Kysely<Database>;
}

export function createSupplierService({
  database: db,
}: SupplierServiceDependencies): SupplierService {
  return {
    async list(tenantId) {
      const rows = await db
        .selectFrom("suppliers")
        .selectAll()
        .where("tenant_id", "=", tenantId)
        .orderBy("name", "asc")
        .execute();
      return rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        phone: r.phone,
        address: r.address,
        note: r.note,
        createdAt: r.created_at.toISOString(),
      }));
    },
    async create(tenantId, input) {
      try {
        const id = `sup-${randomUUID()}`;
        await db
          .insertInto("suppliers")
          .values({
            id,
            tenant_id: tenantId,
            code: input.code,
            name: input.name,
            phone: input.phone ?? null,
            address: input.address ?? null,
            note: input.note ?? null,
          })
          .execute();
        return {
          success: true,
          supplier: {
            id,
            code: input.code,
            name: input.name,
            phone: input.phone ?? null,
            address: input.address ?? null,
            note: input.note ?? null,
            createdAt: new Date().toISOString(),
          },
        };
      } catch (error: unknown) {
        const e = error as { code?: string; constraint?: string };
        if (e.code === "23505" && e.constraint === "suppliers_tenant_code_unique")
          return {
            success: false,
            code: "SUPPLIER_CODE_EXISTS",
            message: `Mã nhà cung cấp "${input.code}" đã tồn tại`,
          };
        throw error;
      }
    },
  };
}
