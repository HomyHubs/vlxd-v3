import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import "../../../i18n.js";
import { PlanUsagePage, ReportsPage } from "../index.js";

const mockSalesSummary = {
  period: "month",
  summary: {
    totalRevenue: 15000000,
    totalPaid: 10000000,
    totalDebt: 5000000,
    orderCount: 12,
    paidOrderCount: 8,
    partialOrderCount: 3,
    unpaidOrderCount: 1,
  },
  chartData: [
    { date: "2026-09-01", revenue: 5000000, orderCount: 4 },
    { date: "2026-09-02", revenue: 10000000, orderCount: 8 },
  ],
  topProducts: [
    {
      productId: "p1",
      productSku: "XM-HOANGTHACH",
      productName: "Xi măng Hoàng Thạch PCB40",
      unitName: "Bao",
      quantitySold: 120,
      totalSales: 10800000,
    },
  ],
};

const mockPlanUsage = {
  plan: "free",
  planName: "Gói Miễn phí (Free)",
  limits: {
    products: 80,
    warehouses: 3,
  },
  usage: {
    products: 25,
    warehouses: 2,
    orders: 45,
    users: 3,
  },
};

vi.mock("../api/useReports.js", () => ({
  REPORTS_QUERY_KEY: ["reports"],
  PLAN_USAGE_QUERY_KEY: ["plan-usage"],
  useSalesSummary: vi.fn(() => ({
    data: mockSalesSummary,
    isLoading: false,
    isError: false,
  })),
  usePlanUsage: vi.fn(() => ({
    data: mockPlanUsage,
    isLoading: false,
    isError: false,
  })),
}));

vi.mock("../../auth/index.js", () => ({
  AppHeader: () => <div data-testid="app-header">Header Mock</div>,
  useCurrentUser: () => ({
    data: {
      user: {
        id: "u1",
        fullName: "Chủ cửa hàng",
        capabilities: ["sales.view", "users.manage"],
      },
      tenant: { id: "t1", name: "Cửa hàng VLXD" },
    },
  }),
  useHasCapability: (cap: string) => ["sales.view", "users.manage"].includes(cap),
  useLogout: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("ReportsPage", () => {
  it("renders financial KPI cards, top products and timeline table", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ReportsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: /báo cáo bán hàng/i })).toBeInTheDocument();
    expect(screen.getByTestId("kpi-total-revenue")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-total-paid")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-total-debt")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-order-count")).toHaveTextContent("12");

    // Top products table
    expect(screen.getByTestId("top-products-table")).toBeInTheDocument();
    expect(screen.getByText("XM-HOANGTHACH")).toBeInTheDocument();
    expect(screen.getByText("Xi măng Hoàng Thạch PCB40")).toBeInTheDocument();

    // Daily timeline table
    expect(screen.getByTestId("daily-timeline-table")).toBeInTheDocument();
    expect(screen.getByText("2026-09-01")).toBeInTheDocument();
  });
});

describe("PlanUsagePage", () => {
  it("renders plan info and usage progress correctly", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <PlanUsagePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("heading", { name: /hạn mức gói cước & tài nguyên/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("plan-tier-chip")).toHaveTextContent("Gói Miễn phí (Free)");
    expect(screen.getByTestId("plan-product-ratio")).toHaveTextContent("25 / 80 (31%)");
    expect(screen.getByTestId("plan-warehouse-ratio")).toHaveTextContent("2 / 3 (67%)");
    expect(screen.getByTestId("plan-orders-count")).toHaveTextContent("45");
    expect(screen.getByTestId("plan-users-count")).toHaveTextContent("3");
  });
});
