import {
  getPlanPolicy,
  type SalesSummaryResponse,
  type TenantPlanUsageResponse,
} from "@vlxd/shared";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../../../app.js";
import { SESSION_COOKIE_NAME, type AuthService } from "../../auth/index.js";
import { calculateCalendarStartDate, type ReportService } from "../service.js";

async function buildTestServer(authService: AuthService, reportService: ReportService) {
  return buildApp({
    authService,
    reportService,
    checkDatabase: () => Promise.resolve(true),
    logger: false,
    secureCookies: false,
  });
}

describe("reports routes", () => {
  const mockOwnerSession = {
    user: {
      id: "u-owner",
      email: "owner@vlxd.local",
      fullName: "Chủ cửa hàng",
      tenantId: "t-001",
      status: "active" as const,
      titles: ["Chủ cửa hàng"],
      capabilities: ["users.manage", "sales.view", "sales.create", "inventory.view"],
    },
    tenant: {
      id: "t-001",
      name: "VLXD Test",
      code: "vlxd-test",
      plan: "free",
    },
  };

  const mockSalesSession = {
    user: {
      id: "u-sales",
      email: "sales@vlxd.local",
      fullName: "Nhân viên bán hàng",
      tenantId: "t-001",
      status: "active" as const,
      titles: ["Nhân viên bán hàng"],
      capabilities: ["sales.view", "sales.create"],
    },
    tenant: {
      id: "t-001",
      name: "VLXD Test",
      code: "vlxd-test",
      plan: "free",
    },
  };

  const mockWarehouseSession = {
    user: {
      id: "u-wh",
      email: "wh@vlxd.local",
      fullName: "Thủ kho",
      tenantId: "t-001",
      status: "active" as const,
      titles: ["Thủ kho"],
      capabilities: ["inventory.view", "inventory.manage"],
    },
    tenant: {
      id: "t-001",
      name: "VLXD Test",
      code: "vlxd-test",
      plan: "free",
    },
  };

  const mockSalesSummaryData: SalesSummaryResponse = {
    period: "month",
    summary: {
      totalRevenue: 10000000,
      totalPaid: 7000000,
      totalDebt: 3000000,
      orderCount: 5,
      paidOrderCount: 3,
      partialOrderCount: 1,
      unpaidOrderCount: 1,
    },
    chartData: [
      { date: "2026-09-01", revenue: 5000000, orderCount: 2 },
      { date: "2026-09-02", revenue: 5000000, orderCount: 3 },
    ],
    topProducts: [
      {
        productId: "p-1",
        productSku: "XM-HT",
        productName: "Xi măng Hà Tiên",
        unitName: "Bao",
        quantitySold: 50,
        totalSales: 4500000,
      },
    ],
  };

  const mockPlanUsageData: TenantPlanUsageResponse = {
    plan: "free",
    planName: "Gói Miễn phí (Free)",
    limits: {
      products: 80,
      warehouses: 3,
    },
    usage: {
      products: 15,
      warehouses: 1,
      orders: 20,
      users: 2,
    },
  };

  it("GET /reports/sales-summary returns 401 when unauthenticated", async () => {
    const authService: AuthService = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(null),
    };
    const reportService: ReportService = {
      getSalesSummary: vi.fn(),
      getPlanUsage: vi.fn(),
    };
    const app = await buildTestServer(authService, reportService);

    const res = await app.inject({
      method: "GET",
      url: "/reports/sales-summary",
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("GET /reports/sales-summary returns 403 when user lacks sales.view", async () => {
    const authService: AuthService = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(mockWarehouseSession),
    };
    const reportService: ReportService = {
      getSalesSummary: vi.fn(),
      getPlanUsage: vi.fn(),
    };
    const app = await buildTestServer(authService, reportService);

    const res = await app.inject({
      method: "GET",
      url: "/reports/sales-summary",
      cookies: { [SESSION_COOKIE_NAME]: "mock-session" },
      headers: {
        "x-expected-tenant-id": "t-001",
      },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("GET /reports/sales-summary returns 200 with data for user with sales.view (SALES)", async () => {
    const authService: AuthService = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(mockSalesSession),
    };
    const getSalesSummary = vi.fn().mockResolvedValue(mockSalesSummaryData);
    const reportService: ReportService = {
      getSalesSummary,
      getPlanUsage: vi.fn(),
    };
    const app = await buildTestServer(authService, reportService);

    const res = await app.inject({
      method: "GET",
      url: "/reports/sales-summary?period=month",
      cookies: { [SESSION_COOKIE_NAME]: "mock-session" },
      headers: {
        "x-expected-tenant-id": "t-001",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(mockSalesSummaryData);
    expect(getSalesSummary).toHaveBeenCalledWith("t-001", { period: "month" });
    await app.close();
  });

  it("GET /reports/sales-summary returns 400 VALIDATION_ERROR on invalid period", async () => {
    const authService: AuthService = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(mockSalesSession),
    };
    const reportService: ReportService = {
      getSalesSummary: vi.fn(),
      getPlanUsage: vi.fn(),
    };
    const app = await buildTestServer(authService, reportService);

    const res = await app.inject({
      method: "GET",
      url: "/reports/sales-summary?period=invalid-period",
      cookies: { [SESSION_COOKIE_NAME]: "mock-session" },
      headers: {
        "x-expected-tenant-id": "t-001",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ code: string }>();
    expect(body.code).toBe("VALIDATION_ERROR");
    await app.close();
  });

  it("GET /tenants/usage returns 401 when unauthenticated", async () => {
    const authService: AuthService = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(null),
    };
    const reportService: ReportService = {
      getSalesSummary: vi.fn(),
      getPlanUsage: vi.fn(),
    };
    const app = await buildTestServer(authService, reportService);

    const res = await app.inject({
      method: "GET",
      url: "/tenants/usage",
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("GET /tenants/usage returns 403 when user lacks users.manage (SALES)", async () => {
    const authService: AuthService = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(mockSalesSession),
    };
    const reportService: ReportService = {
      getSalesSummary: vi.fn(),
      getPlanUsage: vi.fn(),
    };
    const app = await buildTestServer(authService, reportService);

    const res = await app.inject({
      method: "GET",
      url: "/tenants/usage",
      cookies: { [SESSION_COOKIE_NAME]: "mock-session" },
      headers: {
        "x-expected-tenant-id": "t-001",
      },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("GET /tenants/usage returns 200 for user with users.manage (OWNER)", async () => {
    const authService: AuthService = {
      login: vi.fn(),
      logout: vi.fn(),
      getMe: vi.fn().mockResolvedValue(mockOwnerSession),
    };
    const getPlanUsage = vi.fn().mockResolvedValue(mockPlanUsageData);
    const reportService: ReportService = {
      getSalesSummary: vi.fn(),
      getPlanUsage,
    };
    const app = await buildTestServer(authService, reportService);

    const res = await app.inject({
      method: "GET",
      url: "/tenants/usage",
      cookies: { [SESSION_COOKIE_NAME]: "mock-session" },
      headers: {
        "x-expected-tenant-id": "t-001",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(mockPlanUsageData);
    expect(getPlanUsage).toHaveBeenCalledWith("t-001");
    await app.close();
  });
});

describe("calculateCalendarStartDate", () => {
  // Reference instant: 2026-09-04T13:30:00.000Z -> 20:30:00 on Friday, 04/09/2026 in VN (+07:00)
  const refDate = new Date("2026-09-04T13:30:00.000Z");

  it("calculates correct start date for 'day' (midnight of current day in VN)", () => {
    const start = calculateCalendarStartDate("day", refDate);
    expect(start).not.toBeNull();
    // 00:00:00 on 04/09/2026 VN = 17:00:00 on 03/09/2026 UTC
    expect(start?.toISOString()).toBe("2026-09-03T17:00:00.000Z");
  });

  it("calculates correct start date for 'week' (midnight of Monday in VN)", () => {
    const start = calculateCalendarStartDate("week", refDate);
    expect(start).not.toBeNull();
    // Monday of this week is 31/08/2026 00:00:00 VN = 30/08/2026 17:00:00 UTC
    expect(start?.toISOString()).toBe("2026-08-30T17:00:00.000Z");
  });

  it("calculates correct start date for 'month' (midnight of 1st day of month in VN)", () => {
    const start = calculateCalendarStartDate("month", refDate);
    expect(start).not.toBeNull();
    // 1st of September 2026 00:00:00 VN = 31/08/2026 17:00:00 UTC
    expect(start?.toISOString()).toBe("2026-08-31T17:00:00.000Z");
  });

  it("returns null for 'all' period", () => {
    const start = calculateCalendarStartDate("all", refDate);
    expect(start).toBeNull();
  });
});

describe("getPlanPolicy", () => {
  it("returns strict quota for Free plan", () => {
    const policy = getPlanPolicy("free");
    expect(policy.plan).toBe("free");
    expect(policy.limits.products).toBe(80);
    expect(policy.limits.warehouses).toBe(3);
  });

  it("returns unlimited quota for Pro and other plans", () => {
    const proPolicy = getPlanPolicy("pro");
    expect(proPolicy.limits.products).toBeNull();
    expect(proPolicy.limits.warehouses).toBeNull();

    const customPolicy = getPlanPolicy("enterprise");
    expect(customPolicy.limits.products).toBeNull();
    expect(customPolicy.limits.warehouses).toBeNull();
  });
});
