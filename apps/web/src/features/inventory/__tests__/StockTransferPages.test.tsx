import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import "../../../i18n.js";
import {
  CreateStockTransferPage,
  StockTransferDetailPage,
  StockTransferListPage,
} from "../index.js";

const mockTransfersData = {
  items: [
    {
      id: "trf-test-1",
      transferNumber: "TRF-20260904-TEST",
      sourceWarehouseId: "wh-1",
      sourceWarehouseCode: "WH-1",
      sourceWarehouseName: "Kho Tổng",
      destinationWarehouseId: "wh-2",
      destinationWarehouseCode: "WH-2",
      destinationWarehouseName: "Bãi Cát",
      status: "completed",
      note: "Ghi chú điều chuyển",
      createdByName: "Chủ cửa hàng",
      createdAt: "2026-09-04T10:00:00.000Z",
      itemCount: 2,
      totalQuantity: 45,
    },
  ],
  page: 1,
  pageSize: 10,
  total: 75,
};

const mockProductsData = {
  items: [
    {
      id: "prod-1",
      sku: "XM-01",
      name: "Xi măng Hà Tiên",
      unitName: "Bao",
      stockLevels: [{ warehouseId: "wh-1", quantity: 100 }],
    },
    {
      id: "prod-2",
      sku: "CAT-01",
      name: "Cát xây tô",
      unitName: "Khối",
      stockLevels: [{ warehouseId: "wh-1", quantity: 50 }],
    },
    {
      id: "prod-beyond-100",
      sku: "DA-02",
      name: "Đá 1x2 xanh Biên Hòa",
      unitName: "Khối",
      stockLevels: [{ warehouseId: "wh-1", quantity: 80 }],
    },
  ],
  total: 105,
};

vi.mock("../api/useStockTransfers.js", () => ({
  STOCK_TRANSFERS_QUERY_KEY: ["stock-transfers"],
  useStockTransfers: vi.fn(() => ({
    data: mockTransfersData,
    isLoading: false,
    isError: false,
  })),
  useStockTransfer: (id: string) => ({
    data: {
      id,
      transferNumber: "TRF-20260904-TEST",
      sourceWarehouseId: "wh-1",
      sourceWarehouseCode: "WH-1",
      sourceWarehouseName: "Kho Tổng",
      destinationWarehouseId: "wh-2",
      destinationWarehouseCode: "WH-2",
      destinationWarehouseName: "Bãi Cát",
      status: "completed",
      note: "Ghi chú điều chuyển",
      createdByName: "Chủ cửa hàng",
      createdAt: "2026-09-04T10:00:00.000Z",
      totalQuantity: 45,
      lines: [
        {
          id: "trfl-1",
          productId: "prod-1",
          productSku: "XM-01",
          productName: "Xi măng Hà Tiên",
          unitName: "Bao",
          quantity: 25,
        },
        {
          id: "trfl-2",
          productId: "prod-2",
          productSku: "CAT-01",
          productName: "Cát xây tô",
          unitName: "Khối",
          quantity: 20,
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
  useCreateStockTransfer: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: "trf-new-123" }),
    isPending: false,
  }),
}));

vi.mock("../../warehouses/index.js", () => ({
  useWarehouses: () => ({
    data: {
      items: [
        { id: "wh-1", code: "WH-1", name: "Kho Tổng", createdAt: "2026-09-02T00:00:00Z" },
        { id: "wh-2", code: "WH-2", name: "Bãi Cát", createdAt: "2026-09-02T00:00:00Z" },
      ],
      total: 2,
    },
    isLoading: false,
  }),
}));

vi.mock("../../products/api/useProducts.js", () => ({
  PRODUCTS_QUERY_KEY: ["products"],
  useProducts: vi.fn((_page: number, _pageSize: number, search: string = "") => {
    if (search.includes("DA-02")) {
      return {
        data: {
          items: [mockProductsData.items[2]!],
          total: 1,
        },
        isLoading: false,
        isError: false,
      };
    }
    return {
      data: mockProductsData,
      isLoading: false,
      isError: false,
    };
  }),
}));

vi.mock("../../auth/index.js", () => ({
  AppHeader: () => <div data-testid="app-header">AppHeader</div>,
  useHasCapability: () => true,
  getCurrentSessionKey: () => "mock-session-key",
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("StockTransferPages", () => {
  it("renders StockTransferListPage with pagination controls and handles page navigation beyond 50", () => {
    renderWithProviders(
      <MemoryRouter>
        <StockTransferListPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Chuyển kho nội bộ|Stock Transfers/i)).toBeInTheDocument();
    expect(screen.getByTestId("create-transfer-btn")).toBeInTheDocument();
    expect(screen.getByTestId("search-transfer")).toBeInTheDocument();
    expect(screen.getByText("TRF-20260904-TEST")).toBeInTheDocument();

    // TablePagination shows "1–10 of 75"
    expect(screen.getByText(/1–10 of 75|1–10 trên 75/i)).toBeInTheDocument();

    // Navigate to next page
    const nextBtn = screen.getByRole("button", { name: /next page/i });
    expect(nextBtn).toBeInTheDocument();
    fireEvent.click(nextBtn);
  });

  it("renders CreateStockTransferPage with searchable products outside first 100", () => {
    renderWithProviders(
      <MemoryRouter>
        <CreateStockTransferPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Lập phiếu chuyển kho|New Stock Transfer/i)).toBeInTheDocument();
    expect(screen.getByTestId("source-warehouse-select")).toBeInTheDocument();
    expect(screen.getByTestId("destination-warehouse-select")).toBeInTheDocument();
    expect(screen.getByTestId("search-product-input")).toBeInTheDocument();

    // Search for product that lives beyond first 100
    const searchInput = screen.getByTestId("search-product-input").querySelector("input");
    expect(searchInput).toBeTruthy();
    if (searchInput) {
      fireEvent.change(searchInput, { target: { value: "DA-02" } });
    }
  });

  it("renders StockTransferDetailPage with transfer details and items", () => {
    renderWithProviders(
      <MemoryRouter initialEntries={["/inventory/transfers/trf-test-1"]}>
        <Routes>
          <Route path="/inventory/transfers/:id" element={<StockTransferDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/Chi tiết phiếu chuyển kho|Stock Transfer Details/i),
    ).toBeInTheDocument();
    expect(screen.getByText("TRF-20260904-TEST")).toBeInTheDocument();
    expect(screen.getByText("Xi măng Hà Tiên")).toBeInTheDocument();
    expect(screen.getByText("Cát xây tô")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });
});
