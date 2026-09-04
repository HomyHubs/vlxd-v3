import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  CustomerListResponse,
  OrderPaymentsListResponse,
  RecordPaymentResponse,
  SalesOrderDetailResponse,
  SalesOrderListResponse,
} from "@vlxd/shared";

import { buildApp } from "../../../app.js";
import { createAuthService, SESSION_COOKIE_NAME } from "../../auth/index.js";
import { createProductService } from "../../products/index.js";
import { createWarehouseService } from "../../warehouses/index.js";
import { createStockReceiptService } from "../../stock-receipts/index.js";
import { createCustomerService } from "../../customers/index.js";
import { createSalesOrderService } from "../index.js";
import { createDatabase, createDatabasePool } from "../../../platform/database.js";

describe("sales orders integration tests (full flow, stock deduction & boundary checks)", () => {
  const container = new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("vlxd")
    .withUsername("vlxd")
    .withPassword("vlxd_test");
  let started: Awaited<ReturnType<typeof container.start>> | undefined;

  beforeAll(async () => {
    started = await container.start();
  }, 60000);

  afterAll(async () => {
    await started?.stop();
  });

  it("creates sales order, deducts stock, records movements, prevents overdraft and verifies queries", async () => {
    if (!started) throw new Error("PostgreSQL container did not start");

    const readMigration = async (name: string) =>
      readFile(resolve(process.cwd(), `../../db/migrations/${name}`), "utf8");
    const splitMigration = (sql: string): [string, string] => {
      const [, body] = sql.split("-- migrate:up");
      const [up, down] = body?.split("-- migrate:down") ?? [];
      if (!up || !down) throw new Error("Migration must contain up and down sections");
      return [up, down];
    };

    const appMeta = splitMigration(await readMigration("202608310001_create_app_meta.sql"));
    const auth = splitMigration(await readMigration("202609020001_create_auth_tables.sql"));
    const products = splitMigration(await readMigration("202609020002_create_product_tables.sql"));
    const inventory = splitMigration(
      await readMigration("202609020003_create_inventory_tables.sql"),
    );
    const stockReceipts = splitMigration(
      await readMigration("202609020004_create_stock_receipt_tables.sql"),
    );
    const salesOrders = splitMigration(
      await readMigration("202609030005_create_sales_order_tables.sql"),
    );
    const ceilingMigration = splitMigration(
      await readMigration("202609030006_add_stock_levels_ceiling.sql"),
    );
    const rbac = splitMigration(await readMigration("202609030007_create_rbac_tables.sql"));
    const payments = splitMigration(await readMigration("202609040008_create_payment_tables.sql"));
    const seed = await readFile(resolve(process.cwd(), "../../db/seeds/dev.sql"), "utf8");

    const pool = createDatabasePool(started.getConnectionUri());
    const database = createDatabase(pool);

    try {
      await pool.query(appMeta[0]);
      await pool.query(auth[0]);
      await pool.query(products[0]);
      await pool.query(seed);
      await pool.query(inventory[0]);
      await pool.query(stockReceipts[0]);
      await pool.query(salesOrders[0]);
      await pool.query(ceilingMigration[0]);
      await pool.query(rbac[0]);
      await pool.query(payments[0]);

      // Seed warehouse and product
      await database
        .insertInto("warehouses")
        .values({
          id: "wh-main-001",
          tenant_id: "tenant-dev-001",
          code: "KHO-TONG",
          name: "Kho Tổng",
        })
        .execute();

      await database
        .insertInto("products")
        .values({
          id: "prod-cement-001",
          tenant_id: "tenant-dev-001",
          unit_id: "unit-bao",
          sku: "XM-001",
          name: "Xi măng Hà Tiên PCB40",
        })
        .execute();

      const authService = createAuthService({ database });
      const productService = createProductService({ database });
      const warehouseService = createWarehouseService({ database });
      const stockReceiptService = createStockReceiptService({ database });
      const customerService = createCustomerService({ database });
      const salesOrderService = createSalesOrderService({ database });

      const app = await buildApp({
        authService,
        productService,
        warehouseService,
        stockReceiptService,
        customerService,
        salesOrderService,
        checkDatabase: () => Promise.resolve(true),
        logger: false,
        secureCookies: false,
      });

      // 1. Log in
      const loginRes = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "owner@vlxd.local",
          password: "MatKhau@123",
        },
      });
      expect(loginRes.statusCode).toBe(200);
      const sessionCookie = loginRes.cookies.find((c) => c.name === SESSION_COOKIE_NAME);
      expect(sessionCookie).toBeDefined();
      const cookies = { [SESSION_COOKIE_NAME]: sessionCookie!.value };
      const headers = { "x-expected-tenant-id": "tenant-dev-001" };

      // 2. Initial stock receipt: Inbound 50 bags of cement
      const receiptRes = await app.inject({
        method: "POST",
        url: "/stock-receipts",
        cookies,
        headers,
        payload: {
          warehouseId: "wh-main-001",
          note: "Nhập kho ban đầu 50 bao",
          lines: [{ productId: "prod-cement-001", quantity: 50 }],
        },
      });
      expect(receiptRes.statusCode).toBe(201);

      // Verify stock level is 50
      const stock50 = await database
        .selectFrom("stock_levels")
        .select("quantity")
        .where("warehouse_id", "=", "wh-main-001")
        .where("product_id", "=", "prod-cement-001")
        .executeTakeFirst();
      expect(stock50?.quantity).toBe(50);

      // 3. Check customer list (should contain seeded default retail customer)
      const custListRes = await app.inject({
        method: "GET",
        url: "/customers",
        cookies,
        headers,
      });
      expect(custListRes.statusCode).toBe(200);
      const custList = custListRes.json<CustomerListResponse>();
      expect(custList.items.length).toBeGreaterThanOrEqual(1);
      const defaultRetail = custList.items.find((c) => c.code === "KH-LE");
      expect(defaultRetail).toBeDefined();

      // 4. Create new customer
      const createCustRes = await app.inject({
        method: "POST",
        url: "/customers",
        cookies,
        headers,
        payload: {
          code: "KH-THAU-01",
          name: "Anh Hùng Thầu Xây Dựng",
          phone: "0912345678",
          address: "123 Đường Công Trình",
        },
      });
      expect(createCustRes.statusCode).toBe(201);
      const newCust = createCustRes.json<{ id: string; code: string }>();
      expect(newCust.code).toBe("KH-THAU-01");

      // 5. Attempt sale exceeding available stock (100 bags > 50 available) -> Expect 422
      const overdraftRes = await app.inject({
        method: "POST",
        url: "/sales-orders",
        cookies,
        headers,
        payload: {
          customerId: newCust.id,
          warehouseId: "wh-main-001",
          note: "Đơn bán vượt tồn",
          lines: [{ productId: "prod-cement-001", quantity: 100, unitPrice: 85000 }],
        },
      });
      expect(overdraftRes.statusCode).toBe(422);
      expect(overdraftRes.json()).toMatchObject({
        code: "INSUFFICIENT_STOCK",
      });

      // Verify stock remains 50 after rejected transaction
      const stockStill50 = await database
        .selectFrom("stock_levels")
        .select("quantity")
        .where("warehouse_id", "=", "wh-main-001")
        .where("product_id", "=", "prod-cement-001")
        .executeTakeFirst();
      expect(stockStill50?.quantity).toBe(50);

      // 6. Create valid sales order: 20 bags at 85,000 VND
      const validOrderRes = await app.inject({
        method: "POST",
        url: "/sales-orders",
        cookies,
        headers,
        payload: {
          customerId: newCust.id,
          warehouseId: "wh-main-001",
          note: "Giao công trình buổi sáng",
          lines: [{ productId: "prod-cement-001", quantity: 20, unitPrice: 85000 }],
        },
      });
      expect(validOrderRes.statusCode).toBe(201);
      const createdOrder = validOrderRes.json<SalesOrderDetailResponse>();
      expect(createdOrder.orderNumber).toMatch(/^DH-\d{8}-[A-Z0-9]{4,}$/);
      expect(createdOrder.totalAmount).toBe(1700000); // 20 * 85000
      expect(createdOrder.lines).toHaveLength(1);
      expect(createdOrder.lines[0]).toMatchObject({
        productId: "prod-cement-001",
        quantity: 20,
        unitPrice: 85000,
        lineTotal: 1700000,
      });

      // 7. Verify stock deduction in database: 50 - 20 = 30
      const stockAfterSale = await database
        .selectFrom("stock_levels")
        .select("quantity")
        .where("warehouse_id", "=", "wh-main-001")
        .where("product_id", "=", "prod-cement-001")
        .executeTakeFirst();
      expect(stockAfterSale?.quantity).toBe(30);

      // 8. Verify stock movement recorded with type = 'sales_issue' and negative quantity (-20)
      const movement = await database
        .selectFrom("stock_movements")
        .selectAll()
        .where("reference_id", "=", createdOrder.id)
        .where("type", "=", "sales_issue")
        .executeTakeFirst();
      expect(movement).toBeDefined();
      expect(movement?.quantity).toBe(-20);
      expect(movement?.product_id).toBe("prod-cement-001");

      // 9. List sales orders
      const listOrdersRes = await app.inject({
        method: "GET",
        url: "/sales-orders?page=1&pageSize=10",
        cookies,
        headers,
      });
      expect(listOrdersRes.statusCode).toBe(200);
      const orderList = listOrdersRes.json<SalesOrderListResponse>();
      expect(orderList.total).toBe(1);
      expect(orderList.items[0]).toMatchObject({
        id: createdOrder.id,
        orderNumber: createdOrder.orderNumber,
        customerName: "Anh Hùng Thầu Xây Dựng",
        warehouseName: "Kho Tổng",
        totalAmount: 1700000,
        itemCount: 1,
      });

      // 10. Get sales order detail by ID
      const detailRes = await app.inject({
        method: "GET",
        url: `/sales-orders/${createdOrder.id}`,
        cookies,
        headers,
      });
      expect(detailRes.statusCode).toBe(200);
      const detail = detailRes.json<SalesOrderDetailResponse>();
      expect(detail.id).toBe(createdOrder.id);
      expect(detail.customerCode).toBe("KH-THAU-01");
      expect(detail.lines[0]?.productSku).toBe("XM-001");
      expect(detail.paidAmount).toBe(0);
      expect(detail.remainingAmount).toBe(1700000);
      expect(detail.paymentStatus).toBe("unpaid");

      // 10a. Record partial payment (unpaid -> partial): 1,000,000 / 1,700,000 VND
      const partialPayRes = await app.inject({
        method: "POST",
        url: `/sales-orders/${createdOrder.id}/payments`,
        cookies,
        headers,
        payload: {
          amount: 1000000,
          paymentMethod: "bank_transfer",
          referenceCode: "UNC-20260904-001",
          note: "Chuyển khoản cọc đợt 1",
          idempotencyKey: "idem-so-001",
        },
      });
      expect(partialPayRes.statusCode).toBe(201);
      const partialPay = partialPayRes.json<RecordPaymentResponse>();
      expect(partialPay.payment.amount).toBe(1000000);
      expect(partialPay.payment.paymentMethod).toBe("bank_transfer");
      expect(partialPay.payment.idempotencyKey).toBe("idem-so-001");
      expect(partialPay.summary).toEqual({
        totalAmount: 1700000,
        paidAmount: 1000000,
        remainingAmount: 700000,
        paymentStatus: "partial",
      });

      // 10b. Idempotent replay: Resending exact request with same idempotencyKey returns original payment
      const replayPayRes = await app.inject({
        method: "POST",
        url: `/sales-orders/${createdOrder.id}/payments`,
        cookies,
        headers,
        payload: {
          amount: 1000000,
          paymentMethod: "bank_transfer",
          referenceCode: "UNC-20260904-001",
          note: "Chuyển khoản cọc đợt 1",
          idempotencyKey: "idem-so-001",
        },
      });
      expect([200, 201]).toContain(replayPayRes.statusCode);
      const replayPay = replayPayRes.json<RecordPaymentResponse>();
      expect(replayPay.payment.id).toBe(partialPay.payment.id);
      expect(replayPay.summary.paidAmount).toBe(1000000);

      // Verify DB row count: exactly 1 payment exists
      const paymentRows = await database
        .selectFrom("payments")
        .selectAll()
        .where("order_id", "=", createdOrder.id)
        .execute();
      expect(paymentRows).toHaveLength(1);

      // 10b-1. Reusing same idempotencyKey with different referenceCode returns 409 IDEMPOTENCY_CONFLICT
      const conflictRefRes = await app.inject({
        method: "POST",
        url: `/sales-orders/${createdOrder.id}/payments`,
        cookies,
        headers,
        payload: {
          amount: 1000000,
          paymentMethod: "bank_transfer",
          referenceCode: "UNC-DIFFERENT-REF",
          note: "Chuyển khoản cọc đợt 1",
          idempotencyKey: "idem-so-001",
        },
      });
      expect(conflictRefRes.statusCode).toBe(409);
      expect(conflictRefRes.json()).toMatchObject({
        code: "IDEMPOTENCY_CONFLICT",
      });

      // 10b-2. Reusing same idempotencyKey with different note returns 409 IDEMPOTENCY_CONFLICT
      const conflictNoteRes = await app.inject({
        method: "POST",
        url: `/sales-orders/${createdOrder.id}/payments`,
        cookies,
        headers,
        payload: {
          amount: 1000000,
          paymentMethod: "bank_transfer",
          referenceCode: "UNC-20260904-001",
          note: "Ghi chú đã bị thay đổi",
          idempotencyKey: "idem-so-001",
        },
      });
      expect(conflictNoteRes.statusCode).toBe(409);
      expect(conflictNoteRes.json()).toMatchObject({
        code: "IDEMPOTENCY_CONFLICT",
      });

      // 10c. Reject overpayment: remaining is 700,000 VND, attempting 800,000 VND
      const overPayRes = await app.inject({
        method: "POST",
        url: `/sales-orders/${createdOrder.id}/payments`,
        cookies,
        headers,
        payload: {
          amount: 800000,
          paymentMethod: "cash",
          idempotencyKey: "idem-overpay-001",
        },
      });
      expect(overPayRes.statusCode).toBe(422);
      expect(overPayRes.json()).toMatchObject({
        code: "AMOUNT_EXCEEDS_REMAINING",
      });

      // 10d. Record final payment (partial -> paid): pay remaining 700,000 VND
      const finalPayRes = await app.inject({
        method: "POST",
        url: `/sales-orders/${createdOrder.id}/payments`,
        cookies,
        headers,
        payload: {
          amount: 700000,
          paymentMethod: "cash",
          note: "Thanh toán nốt",
          idempotencyKey: "idem-so-002",
        },
      });
      expect(finalPayRes.statusCode).toBe(201);
      const finalPay = finalPayRes.json<RecordPaymentResponse>();
      expect(finalPay.summary).toEqual({
        totalAmount: 1700000,
        paidAmount: 1700000,
        remainingAmount: 0,
        paymentStatus: "paid",
      });

      // 10e. Reject payment on fully paid order
      const paidOrderRes = await app.inject({
        method: "POST",
        url: `/sales-orders/${createdOrder.id}/payments`,
        cookies,
        headers,
        payload: {
          amount: 50000,
          paymentMethod: "cash",
          idempotencyKey: "idem-already-paid-001",
        },
      });
      expect(paidOrderRes.statusCode).toBe(422);
      expect(paidOrderRes.json()).toMatchObject({
        code: "ORDER_ALREADY_PAID",
      });

      // 10f. List payments for order
      const listPayRes = await app.inject({
        method: "GET",
        url: `/sales-orders/${createdOrder.id}/payments`,
        cookies,
        headers,
      });
      expect(listPayRes.statusCode).toBe(200);
      const payList = listPayRes.json<OrderPaymentsListResponse>();
      expect(payList.payments).toHaveLength(2);
      expect(payList.summary.paymentStatus).toBe("paid");

      // 11. Concurrency test: Two competing orders requesting 20 bags when only 30 remain
      const concurrentOrderPayload = {
        customerId: newCust.id,
        warehouseId: "wh-main-001",
        note: "Đơn cạnh tranh tồn kho",
        lines: [{ productId: "prod-cement-001", quantity: 20, unitPrice: 85000 }],
      };

      const [orderA, orderB] = await Promise.all([
        app.inject({
          method: "POST",
          url: "/sales-orders",
          cookies,
          headers,
          payload: concurrentOrderPayload,
        }),
        app.inject({
          method: "POST",
          url: "/sales-orders",
          cookies,
          headers,
          payload: concurrentOrderPayload,
        }),
      ]);

      const statusCodes = [orderA.statusCode, orderB.statusCode].sort((a, b) => a - b);
      expect(statusCodes).toEqual([201, 422]);

      const failedOrder = orderA.statusCode === 422 ? orderA : orderB;
      expect(failedOrder.json()).toMatchObject({
        code: "INSUFFICIENT_STOCK",
      });

      // Stock must be exactly 30 - 20 = 10, never negative!
      const stockAfterConcurrent = await database
        .selectFrom("stock_levels")
        .select("quantity")
        .where("warehouse_id", "=", "wh-main-001")
        .where("product_id", "=", "prod-cement-001")
        .executeTakeFirst();
      expect(stockAfterConcurrent?.quantity).toBe(10);

      // 12. Concurrency test: Two concurrent customer creates with identical code
      const duplicateCustomerCode = "KH-CONCURRENT-01";
      const [custCreateA, custCreateB] = await Promise.all([
        app.inject({
          method: "POST",
          url: "/customers",
          cookies,
          headers,
          payload: {
            code: duplicateCustomerCode,
            name: "Khách hàng đồng thời A",
          },
        }),
        app.inject({
          method: "POST",
          url: "/customers",
          cookies,
          headers,
          payload: {
            code: duplicateCustomerCode,
            name: "Khách hàng đồng thời B",
          },
        }),
      ]);

      const custStatuses = [custCreateA.statusCode, custCreateB.statusCode].sort((a, b) => a - b);
      expect(custStatuses).toEqual([201, 409]);

      const failedCust = custCreateA.statusCode === 409 ? custCreateA : custCreateB;
      expect(failedCust.json()).toMatchObject({
        code: "CUSTOMER_CODE_EXISTS",
      });

      // 13. Concurrency test on payments: Two competing payments exceeding remaining debt
      // Order 2 cement bags at 100,000 VND = 200,000 VND total
      const concurrentPayOrderRes = await app.inject({
        method: "POST",
        url: "/sales-orders",
        cookies,
        headers,
        payload: {
          customerId: newCust.id,
          warehouseId: "wh-main-001",
          lines: [{ productId: "prod-cement-001", quantity: 2, unitPrice: 100000 }],
        },
      });
      expect(concurrentPayOrderRes.statusCode).toBe(201);
      const payOrderId = concurrentPayOrderRes.json<SalesOrderDetailResponse>().id;

      // Two concurrent payments each for 150,000 VND (total 300,000 VND > 200,000 VND)
      const [payA, payB] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/sales-orders/${payOrderId}/payments`,
          cookies,
          headers,
          payload: {
            amount: 150000,
            paymentMethod: "cash",
            idempotencyKey: "concurrent-pay-a",
          },
        }),
        app.inject({
          method: "POST",
          url: `/sales-orders/${payOrderId}/payments`,
          cookies,
          headers,
          payload: {
            amount: 150000,
            paymentMethod: "bank_transfer",
            idempotencyKey: "concurrent-pay-b",
          },
        }),
      ]);

      const payStatuses = [payA.statusCode, payB.statusCode].sort((a, b) => a - b);
      expect(payStatuses).toEqual([201, 422]);
      const failedPay = payA.statusCode === 422 ? payA : payB;
      expect(failedPay.json()).toMatchObject({
        code: "AMOUNT_EXCEEDS_REMAINING",
      });

      // Verify DB total paid is exactly 150,000 VND, never 300,000 VND
      const totalPaidDb = await database
        .selectFrom("payments")
        .select(({ fn }) => [fn.sum<number | string>("amount").as("total")])
        .where("order_id", "=", payOrderId)
        .executeTakeFirst();
      expect(Number(totalPaidDb?.total)).toBe(150000);

      await app.close();

      // Verify rollback of payment tables
      await pool.query(payments[1]);
      const tableCheck = await pool.query<{ tbl: string | null }>(
        "SELECT to_regclass('public.payments') as tbl",
      );
      expect(tableCheck.rows[0]?.tbl).toBeNull();
    } finally {
      await pool.end();
    }
  }, 45000);
});
