import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import "../../../i18n.js";
import {
  CreatePurchaseOrderPage,
  PurchaseOrderDetailPage,
  PurchaseOrderListPage,
  PurchasingPage,
} from "../index.js";

const mockCreatePurchaseOrder = vi
  .fn<(data: unknown) => Promise<{ id: string }>>()
  .mockResolvedValue({ id: "po-new-123" });
const mockCreateSupplier = vi
  .fn<(data: unknown) => Promise<unknown>>()
  .mockResolvedValue({ id: "sup-new", code: "NCC-9", name: "NCC mới" });

vi.mock("../api/usePurchaseOrders.js", () => ({
  SUPPLIERS_QUERY_KEY: ["suppliers"],
  PURCHASE_ORDERS_QUERY_KEY: ["purchase-orders"],
  useSuppliers: () => ({
    data: {
      items: [
        {
          id: "sup-1",
          code: "NCC-01",
          name: "Công ty Xi măng Hà Tiên",
          phone: "0909123456",
          address: "Kiên Giang",
          note: null,
          createdAt: "2026-09-11T00:00:00.000Z",
        },
      ],
      total: 1,
    },
    isLoading: false,
    isError: false,
  }),
  useCreateSupplier: () => ({
    mutateAsync: mockCreateSupplier,
    isPending: false,
  }),
  usePurchaseOrders: () => ({
    data: {
      items: [
        {
          id: "po-test-1",
          orderNumber: "PO-20260911-ABCD1234",
          supplierId: "sup-1",
          supplierCode: "NCC-01",
          supplierName: "Công ty Xi măng Hà Tiên",
          warehouseId: "wh-1",
          warehouseCode: "KHO-TONG",
          warehouseName: "Kho Tổng",
          status: "ordered",
          totalAmount: 1700000,
          note: "Nhập hàng đợt 1",
          createdByName: "Chủ cửa hàng",
          createdAt: "2026-09-11T08:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    },
    isLoading: false,
    isError: false,
  }),
  usePurchaseOrder: (id: string) => ({
    data: {
      id,
      orderNumber: "PO-20260911-ABCD1234",
      supplierId: "sup-1",
      supplierCode: "NCC-01",
      supplierName: "Công ty Xi măng Hà Tiên",
      warehouseId: "wh-1",
      warehouseCode: "KHO-TONG",
      warehouseName: "Kho Tổng",
      status: "ordered",
      totalAmount: 1700000,
      note: "Nhập hàng đợt 1",
      createdByName: "Chủ cửa hàng",
      createdAt: "2026-09-11T08:00:00.000Z",
      lines: [
        {
          id: "pol-1",
          productId: "prod-1",
          productSku: "XM-001",
          productName: "Xi măng Hà Tiên PCB40",
          unitName: "Bao",
          quantity: 20,
          unitCost: 85000,
          lineTotal: 1700000,
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
  useCreatePurchaseOrder: () => ({
    mutateAsync: mockCreatePurchaseOrder,
    isPending: false,
  }),
}));

vi.mock("../../warehouses/index.js", () => ({
  useWarehouses: () => ({
    data: {
      items: [
        { id: "wh-1", code: "KHO-TONG", name: "Kho Tổng", createdAt: "2026-09-02T00:00:00Z" },
      ],
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
          sku: "XM-001",
          name: "Xi măng Hà Tiên PCB40",
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
  getCurrentSessionKey: () => "session-key-1",
  useCurrentUser: () => ({
    data: {
      user: {
        id: "u1",
        fullName: "Chủ cửa hàng",
        capabilities: ["purchasing.view", "purchasing.manage"],
      },
      tenant: { id: "t1", name: "Cửa hàng VLXD" },
    },
  }),
  useHasCapability: (cap: string) => ["purchasing.view", "purchasing.manage"].includes(cap),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("Purchasing Pages", () => {
  it("renders PurchasingPage supplier directory with the add-supplier form and list", () => {
    renderWithProviders(
      <MemoryRouter>
        <PurchasingPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Nhà cung cấp & mua hàng")).toBeInTheDocument();
    expect(screen.getByText("Thêm nhà cung cấp")).toBeInTheDocument();
    expect(screen.getByText("Công ty Xi măng Hà Tiên")).toBeInTheDocument();
    expect(screen.getByTestId("nav-purchase-orders-btn")).toBeInTheDocument();
  });

  it("creates a supplier through the directory form", async () => {
    renderWithProviders(
      <MemoryRouter>
        <PurchasingPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByTestId("supplier-code-input").querySelector("input")!, {
      target: { value: "NCC-9" },
    });
    fireEvent.change(screen.getByTestId("supplier-name-input").querySelector("input")!, {
      target: { value: "NCC mới" },
    });
    fireEvent.click(screen.getByTestId("submit-supplier-btn"));

    await waitFor(() => {
      expect(mockCreateSupplier).toHaveBeenCalledWith(
        expect.objectContaining({ code: "NCC-9", name: "NCC mới" }),
      );
    });
  });

  it("renders PurchaseOrderListPage with a table of orders", () => {
    renderWithProviders(
      <MemoryRouter>
        <PurchaseOrderListPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Quản lý đơn mua hàng")).toBeInTheDocument();
    expect(screen.getByText("PO-20260911-ABCD1234")).toBeInTheDocument();
    expect(screen.getByText("Công ty Xi măng Hà Tiên")).toBeInTheDocument();
    expect(screen.getByText("Kho Tổng")).toBeInTheDocument();
    expect(screen.getByText(/1\.700\.000/)).toBeInTheDocument();
    expect(screen.getByTestId("new-purchase-order-btn")).toBeInTheDocument();
  });

  it("renders CreatePurchaseOrderPage with form controls", () => {
    renderWithProviders(
      <MemoryRouter>
        <CreatePurchaseOrderPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Tạo đơn mua hàng")).toBeInTheDocument();
    expect(screen.getByText("Thêm sản phẩm")).toBeInTheDocument();
    expect(screen.getByText("Xác nhận tạo đơn")).toBeInTheDocument();
    expect(screen.getByTestId("po-supplier-select")).toBeInTheDocument();
    expect(screen.getByTestId("po-warehouse-select")).toBeInTheDocument();
  });

  it("submits a purchase order and maps line items to the create request", async () => {
    renderWithProviders(
      <MemoryRouter>
        <CreatePurchaseOrderPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("submit-po-button"));

    await waitFor(() => {
      expect(mockCreatePurchaseOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: "sup-1",
          warehouseId: "wh-1",
          lines: [expect.objectContaining({ productId: "prod-1", quantity: 1 })],
        }),
      );
    });
  });

  it("renders PurchaseOrderDetailPage with supplier info and line items", () => {
    renderWithProviders(
      <MemoryRouter initialEntries={["/purchasing/orders/po-test-1"]}>
        <Routes>
          <Route path="/purchasing/orders/:id" element={<PurchaseOrderDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("PO-20260911-ABCD1234")).toBeInTheDocument();
    expect(screen.getByText("Công ty Xi măng Hà Tiên")).toBeInTheDocument();
    expect(screen.getByText("Xi măng Hà Tiên PCB40")).toBeInTheDocument();
    expect(screen.getByText("XM-001")).toBeInTheDocument();
    expect(screen.getByText("Bao")).toBeInTheDocument();
    expect(screen.getByText("Tổng tiền nhập:")).toBeInTheDocument();
  });
});
