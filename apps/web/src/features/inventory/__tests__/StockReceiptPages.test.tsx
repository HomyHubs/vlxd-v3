import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import "../../../i18n.js";
import { CreateStockReceiptPage, StockReceiptDetailPage, StockReceiptListPage } from "../index.js";

vi.mock("../api/useStockReceipts.js", () => ({
  STOCK_RECEIPTS_QUERY_KEY: ["stock-receipts"],
  useStockReceipts: () => ({
    data: {
      items: [
        {
          id: "sr-test-1",
          receiptNumber: "PN-20260902-TEST",
          warehouseId: "wh-1",
          warehouseCode: "WH-1",
          warehouseName: "Kho Tổng",
          status: "completed",
          note: "Ghi chú nhập hàng",
          createdByName: "Chủ cửa hàng",
          createdAt: "2026-09-02T10:00:00.000Z",
          itemCount: 2,
          totalQuantity: 80,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    },
    isLoading: false,
  }),
  useStockReceipt: (id: string) => ({
    data: {
      id,
      receiptNumber: "PN-20260902-TEST",
      warehouseId: "wh-1",
      warehouseCode: "WH-1",
      warehouseName: "Kho Tổng",
      status: "completed",
      note: "Ghi chú nhập hàng",
      createdByName: "Chủ cửa hàng",
      createdAt: "2026-09-02T10:00:00.000Z",
      totalQuantity: 80,
      lines: [
        {
          id: "srl-1",
          productId: "prod-1",
          productSku: "XM-01",
          productName: "Xi măng Hà Tiên",
          unitName: "Bao",
          quantity: 50,
        },
        {
          id: "srl-2",
          productId: "prod-2",
          productSku: "GACH-01",
          productName: "Gạch ống 4 lỗ",
          unitName: "Viên",
          quantity: 30,
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
  useCreateStockReceipt: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: "sr-new-123" }),
    isPending: false,
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

vi.mock("../../auth/index.js", () => ({
  AppHeader: () => <div data-testid="app-header">Header Mock</div>,
  useCurrentUser: () => ({
    data: {
      user: {
        id: "u1",
        fullName: "Chủ cửa hàng",
        capabilities: ["inventory.manage", "inventory.view"],
      },
      tenant: { id: "t1", name: "Cửa hàng VLXD" },
    },
  }),
  useHasCapability: (cap: string) => ["inventory.manage", "inventory.view"].includes(cap),
  useLogout: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

describe("StockReceiptPages", () => {
  it("renders StockReceiptListPage with table and receipt data", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <StockReceiptListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: /phiếu nhập kho/i })).toBeInTheDocument();
    expect(screen.getByText("PN-20260902-TEST")).toBeInTheDocument();
    expect(screen.getByText("Kho Tổng")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /nhập kho mới/i })).toBeInTheDocument();
  });

  it("renders CreateStockReceiptPage with form controls", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <CreateStockReceiptPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: /tạo phiếu nhập kho/i })).toBeInTheDocument();
    expect(screen.getByTestId("warehouse-select")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /thêm mặt hàng/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /lưu phiếu nhập kho/i })).toBeInTheDocument();
  });

  it("renders StockReceiptDetailPage with lines breakdown", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/inventory/receipts/sr-test-1"]}>
          <Routes>
            <Route path="/inventory/receipts/:id" element={<StockReceiptDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: /chi tiết phiếu nhập kho/i })).toBeInTheDocument();
    expect(screen.getByText("PN-20260902-TEST")).toBeInTheDocument();
    expect(screen.getByText("Xi măng Hà Tiên")).toBeInTheDocument();
    expect(screen.getByText("Gạch ống 4 lỗ")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });
});
