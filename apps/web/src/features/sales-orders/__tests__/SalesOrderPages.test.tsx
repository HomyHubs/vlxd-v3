import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import "../../../i18n.js";
import { CreateSalesOrderPage, SalesOrderDetailPage, SalesOrderListPage } from "../index.js";

type MockRecordPaymentArg = {
  amount: number;
  paymentMethod: "cash" | "bank_transfer";
  referenceCode?: string;
  note?: string;
  idempotencyKey?: string;
};

const mockRecordPayment = vi
  .fn<(data: MockRecordPaymentArg) => Promise<unknown>>()
  .mockResolvedValue({
    payment: {
      id: "pmt-new",
      orderId: "order-test-1",
      customerId: "cust-1",
      amount: 1000000,
      paymentMethod: "bank_transfer",
      referenceCode: "MB-12345",
      note: "Khách chuyển nốt",
      createdByName: "Chủ cửa hàng",
      createdAt: new Date().toISOString(),
    },
    summary: {
      totalAmount: 1700000,
      paidAmount: 1700000,
      remainingAmount: 0,
      paymentStatus: "paid",
    },
  });

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
          paidAmount: 700000,
          remainingAmount: 1000000,
          paymentStatus: "partial",
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
      paidAmount: 700000,
      remainingAmount: 1000000,
      paymentStatus: "partial",
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
      payments: [
        {
          id: "pmt-1",
          orderId: id,
          customerId: "cust-1",
          amount: 700000,
          paymentMethod: "cash",
          referenceCode: null,
          note: "Khách cọc tiền mặt",
          createdByName: "Chủ cửa hàng",
          createdAt: "2026-09-03T08:30:00.000Z",
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
  useRecordPayment: () => ({
    mutateAsync: mockRecordPayment,
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
      user: {
        id: "u1",
        fullName: "Chủ cửa hàng",
        capabilities: ["sales.create", "sales.view"],
      },
      tenant: { id: "t1", name: "Cửa hàng VLXD" },
    },
  }),
  useHasCapability: (cap: string) => ["sales.create", "sales.view"].includes(cap),
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
  it("renders SalesOrderListPage with table of orders and payment status", () => {
    renderWithProviders(
      <MemoryRouter>
        <SalesOrderListPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("DH-20260903-TEST")).toBeInTheDocument();
    expect(screen.getByText("Anh Hùng Thầu")).toBeInTheDocument();
    expect(screen.getByText("Kho Tổng")).toBeInTheDocument();
    expect(screen.getByText(/1\.700\.000/)).toBeInTheDocument();
    expect(screen.getByText("Thanh toán một phần")).toBeInTheDocument();
    expect(screen.getAllByText(/700\.000/).length).toBeGreaterThanOrEqual(1);
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

  it("renders SalesOrderDetailPage with order info, payment badge, debt amounts, and payment history", () => {
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

    // Payment badge and debt breakdown
    expect(screen.getByText("Thanh toán một phần")).toBeInTheDocument();
    expect(screen.getByText("Đã thanh toán:")).toBeInTheDocument();
    expect(screen.getByText("Còn nợ:")).toBeInTheDocument();
    expect(screen.getByText(/1\.000\.000/)).toBeInTheDocument();

    // Payment history table
    expect(screen.getByText("Lịch sử thanh toán")).toBeInTheDocument();
    expect(screen.getByText("Khách cọc tiền mặt")).toBeInTheDocument();
    expect(screen.getByText("Tiền mặt")).toBeInTheDocument();

    // Record payment button visible
    expect(screen.getAllByText("Ghi nhận thanh toán").length).toBeGreaterThanOrEqual(1);
  });

  it("opens payment dialog, supports pay full, and submits payment", async () => {
    renderWithProviders(
      <MemoryRouter initialEntries={["/orders/order-test-1"]}>
        <Routes>
          <Route path="/orders/:id" element={<SalesOrderDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const recordButtons = screen.getAllByText("Ghi nhận thanh toán");
    fireEvent.click(recordButtons[0]!);

    // Dialog should be open
    expect(
      screen.getByText("Ghi nhận thu tiền cho đơn hàng", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText("Xác nhận thu tiền")).toBeInTheDocument();

    // Test Pay Full button
    const payFullBtn = screen.getByText("Trả hết");
    fireEvent.click(payFullBtn);

    const amountInput = screen.getByLabelText(/Số tiền/);
    expect((amountInput as HTMLInputElement).value).toBe("1000000");

    // Fill note
    const noteInput = screen.getByPlaceholderText(/VD: Khách chuyển đợt 1/);
    fireEvent.change(noteInput, { target: { value: "Khách chuyển nốt" } });

    // Submit form
    const submitBtn = screen.getByText("Xác nhận thu tiền");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockRecordPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1000000,
          paymentMethod: "cash",
          note: "Khách chuyển nốt",
        }),
      );
    });

    const firstCallKey = mockRecordPayment.mock.calls[0]?.[0]?.idempotencyKey;
    expect(firstCallKey).toBeDefined();
    expect(firstCallKey).toMatch(/^pmt_req_[0-9a-f-]{36}$/);

    // Click submit again without closing dialog, key must stay stable
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(mockRecordPayment).toHaveBeenCalledTimes(2);
    });
    const secondCallKey = mockRecordPayment.mock.calls[1]?.[0]?.idempotencyKey;
    expect(secondCallKey).toBe(firstCallKey);
  });
});
