import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import "../../../i18n.js";
import { CreateSalesOrderPage, SalesOrderDetailPage, SalesOrderListPage } from "../index.js";

vi.mock("../api/useSalesOrders.js", () => ({
  SALES_ORDERS_QUERY_KEY: ["sales-orders"],
  useSalesOrders: () => ({
    data: {
      items: [
        {
          id: "order-test-1",
          orderNumber: "DH-20260903-TEST",
          customerId: "cust-1",
          customerName: "Anh Hùng Thầu",
          warehouseId: "wh-1",
          warehouseName: "Kho Tổng",
          status: "confirmed",
          totalAmount: 1700000,
          itemCount: 1,
          note: "Giao gấp buổi sáng",
          createdByName: "Chủ cửa hàng",
          createdAt: "2026-09-03T08:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    },
    isLoading: false,
    isError: false,
  }),
  useSalesOrder: (id: string) => ({
    data: {
      id,
      orderNumber: "DH-20260903-TEST",
      customerId: "cust-1",
      customerCode: "KH-THAU-01",
      customerName: "Anh Hùng Thầu",
      customerPhone: "0912345678",
      customerAddress: "123 Đường Công Trình",
      warehouseId: "wh-1",
      warehouseCode: "WH-1",
      warehouseName: "Kho Tổng",
      status: "confirmed",
      totalAmount: 1700000,
      note: "Giao gấp buổi sáng",
      createdByName: "Chủ cửa hàng",
      createdAt: "2026-09-03T08:00:00.000Z",
      lines: [
        {
          id: "sol-1",
          productId: "prod-1",
          productSku: "XM-01",
          productName: "Xi măng Hà Tiên",
          unitName: "Bao",
          quantity: 20,
          unitPrice: 85000,
          lineTotal: 1700000,
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
  useCreateSalesOrder: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: "order-new-123" }),
    isPending: false,
  }),
}));

vi.mock("../../customers/index.js", () => ({
  CUSTOMERS_QUERY_KEY: ["customers"],
  useCustomers: () => ({
    data: {
      items: [
        {
          id: "cust-1",
          code: "KH-LE",
          name: "Khách lẻ",
          phone: "0901234567",
          address: "Tại cửa hàng",
          createdAt: "2026-09-03T00:00:00Z",
        },
        {
          id: "cust-2",
          code: "KH-THAU-01",
          name: "Anh Hùng Thầu",
          phone: "0912345678",
          address: "123 Đường Công Trình",
          createdAt: "2026-09-03T00:00:00Z",
        },
      ],
      total: 2,
    },
    isLoading: false,
  }),
}));

vi.mock("../../warehouses/index.js", () => ({
  useWarehouses: () => ({
    data: {
      items: [{ id: "wh-1", code: "WH-1", name: "Kho Tổng", createdAt: "2026-09-02T00:00:00Z" }],
      total: 1,
    },
    isLoading: false,
  }),
}));

vi.mock("../../products/api/useProducts.js", () => ({
  PRODUCTS_QUERY_KEY: ["products"],
  useProducts: () => ({
    data: {
      items: [
        {
          id: "prod-1",
          sku: "XM-01",
          name: "Xi măng Hà Tiên",
          unitCode: "bao",
          unitName: "Bao",
          createdAt: "2026-09-02T00:00:00Z",
          stockLevels: [],
        },
      ],
      total: 1,
    },
    isLoading: false,
  }),
}));

vi.mock("../../auth/index.js", () => ({
  AppHeader: () => <div data-testid="app-header">Header Mock</div>,
  useCurrentUser: () => ({
    data: {
      user: { id: "u1", fullName: "Chủ cửa hàng" },
      tenant: { id: "t1", name: "Cửa hàng VLXD" },
    },
  }),
  useLogout: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("Sales Orders Pages", () => {
  it("renders SalesOrderListPage with table of orders", () => {
    renderWithProviders(
      <MemoryRouter>
        <SalesOrderListPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("DH-20260903-TEST")).toBeInTheDocument();
    expect(screen.getByText("Anh Hùng Thầu")).toBeInTheDocument();
    expect(screen.getByText("Kho Tổng")).toBeInTheDocument();
    expect(screen.getByText(/1.700.000/)).toBeInTheDocument();
  });

  it("renders CreateSalesOrderPage with form controls", () => {
    renderWithProviders(
      <MemoryRouter>
        <CreateSalesOrderPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Tạo đơn bán hàng")).toBeInTheDocument();
    expect(screen.getByText("Thêm sản phẩm")).toBeInTheDocument();
    expect(screen.getByText("Xác nhận tạo đơn")).toBeInTheDocument();
  });

  it("renders SalesOrderDetailPage with order info and line items", () => {
    renderWithProviders(
      <MemoryRouter initialEntries={["/orders/order-test-1"]}>
        <Routes>
          <Route path="/orders/:id" element={<SalesOrderDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("DH-20260903-TEST")).toBeInTheDocument();
    expect(screen.getByText("Anh Hùng Thầu")).toBeInTheDocument();
    expect(screen.getByText("KH-THAU-01", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Xi măng Hà Tiên")).toBeInTheDocument();
    expect(screen.getAllByText(/1.700.000/).length).toBeGreaterThanOrEqual(1);
  });
});
