import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProtectedRoute } from "../components/ProtectedRoute.js";
import { ProductsPage } from "../../products/index.js";
import { WarehousesPage } from "../../warehouses/index.js";
import { StockReceiptListPage } from "../../inventory/index.js";
import { SalesOrderListPage } from "../../sales-orders/index.js";
import { UsersPage } from "../../users/index.js";
import { Button, Container, Stack } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useHasCapability } from "../api/useAuth.js";

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function MockDashboard() {
  const canViewProducts = useHasCapability("products.view");
  const canViewWarehouses = useHasCapability("inventory.view");
  const canViewInventory = useHasCapability("inventory.view");
  const canViewSales = useHasCapability("sales.view");
  const canManageUsers = useHasCapability("users.manage");

  return (
    <Container data-testid="dashboard-home">
      <Stack spacing={2} direction="row">
        {canViewProducts && (
          <Button component={RouterLink} to="/products" data-testid="nav-products-btn">
            Sản phẩm
          </Button>
        )}
        {canViewWarehouses && (
          <Button component={RouterLink} to="/warehouses" data-testid="nav-warehouses-btn">
            Kho hàng
          </Button>
        )}
        {canViewInventory && (
          <Button component={RouterLink} to="/inventory/receipts" data-testid="nav-receipts-btn">
            Nhập kho
          </Button>
        )}
        {canViewSales && (
          <Button component={RouterLink} to="/orders" data-testid="nav-orders-btn">
            Bán hàng
          </Button>
        )}
        {canManageUsers && (
          <Button component={RouterLink} to="/settings/users" data-testid="nav-settings-users-btn">
            Cài đặt nhân viên
          </Button>
        )}
      </Stack>
    </Container>
  );
}

function renderAppWithRole(capabilities: string[], initialEntry = "/") {
  const fetchMock = vi.fn().mockImplementation((req: Request | string) => {
    const url = typeof req === "string" ? req : req.url;
    if (url.includes("/auth/me")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            user: {
              id: "user-test",
              email: "test@vlxd.local",
              fullName: "Người dùng Test",
              tenantId: "tenant-test",
              status: "active",
              capabilities,
            },
            tenant: {
              id: "tenant-test",
              name: "Cửa hàng VLXD Homy",
              code: "vlxd-homy",
              plan: "free",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    if (url.includes("/products")) {
      return Promise.resolve(
        new Response(JSON.stringify({ items: [], total: 0, page: 1, limit: 20 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/warehouses")) {
      return Promise.resolve(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/inventory/receipts")) {
      return Promise.resolve(
        new Response(JSON.stringify({ items: [], total: 0, page: 1, limit: 50 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/sales-orders")) {
      return Promise.resolve(
        new Response(JSON.stringify({ items: [], total: 0, page: 1, limit: 10 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/customers")) {
      return Promise.resolve(
        new Response(JSON.stringify({ items: [], total: 0, page: 1, limit: 100 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/users")) {
      return Promise.resolve(
        new Response(JSON.stringify({ items: [], total: 0, page: 1, limit: 50 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/titles")) {
      return Promise.resolve(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  vi.stubGlobal("fetch", fetchMock);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={<MockDashboard />} />
          <Route element={<ProtectedRoute requiredCapability="products.view" />}>
            <Route path="/products" element={<ProductsPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredCapability="inventory.view" />}>
            <Route path="/warehouses" element={<WarehousesPage />} />
            <Route path="/inventory/receipts" element={<StockReceiptListPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredCapability="inventory.manage" />}>
            <Route
              path="/inventory/receipts/new"
              element={<div data-testid="create-receipt-page">New Receipt</div>}
            />
          </Route>
          <Route element={<ProtectedRoute requiredCapability="sales.view" />}>
            <Route path="/orders" element={<SalesOrderListPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredCapability="sales.create" />}>
            <Route
              path="/orders/new"
              element={<div data-testid="create-order-page">New Order</div>}
            />
          </Route>
          <Route element={<ProtectedRoute requiredCapability="users.manage" />}>
            <Route path="/settings/users" element={<UsersPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Role-Matrix UI Visibility and Route Guards", () => {
  const OWNER_CAPS = [
    "products.view",
    "products.manage",
    "inventory.view",
    "inventory.manage",
    "sales.view",
    "sales.create",
    "customers.manage",
    "users.manage",
  ];

  const SALES_CAPS = [
    "products.view",
    "inventory.view",
    "sales.view",
    "sales.create",
    "customers.manage",
  ];

  const READ_ONLY_SALES_CAPS = ["products.view", "inventory.view", "sales.view"];

  const WAREHOUSE_CAPS = ["products.view", "inventory.view", "inventory.manage"];

  describe("OWNER Role", () => {
    it("renders all dashboard navigation links", async () => {
      renderAppWithRole(OWNER_CAPS, "/");

      expect(await screen.findByTestId("nav-products-btn")).toBeInTheDocument();
      expect(screen.getByTestId("nav-warehouses-btn")).toBeInTheDocument();
      expect(screen.getByTestId("nav-receipts-btn")).toBeInTheDocument();
      expect(screen.getByTestId("nav-orders-btn")).toBeInTheDocument();
      expect(screen.getByTestId("nav-settings-users-btn")).toBeInTheDocument();
    });

    it("renders Add Product button on ProductsPage for OWNER", async () => {
      renderAppWithRole(OWNER_CAPS, "/products");
      expect(await screen.findByTestId("add-product-btn")).toBeInTheDocument();
    });

    it("renders Add Warehouse button on WarehousesPage for OWNER", async () => {
      renderAppWithRole(OWNER_CAPS, "/warehouses");
      expect(await screen.findByTestId("add-warehouse-btn")).toBeInTheDocument();
    });

    it("renders New Receipt button on StockReceiptListPage for OWNER", async () => {
      renderAppWithRole(OWNER_CAPS, "/inventory/receipts");
      expect(await screen.findByTestId("create-receipt-btn")).toBeInTheDocument();
    });

    it("renders New Order and empty state buttons on SalesOrderListPage for OWNER", async () => {
      renderAppWithRole(OWNER_CAPS, "/orders");
      expect(await screen.findByTestId("new-sales-order-btn")).toBeInTheDocument();
      expect(await screen.findByTestId("create-first-order-btn")).toBeInTheDocument();
    });
  });

  describe("SALES Role (Full Sales with inventory.view, sales.create, customers.manage)", () => {
    it("renders Products, Warehouses, Receipts, and Orders navigation links, but hides Users Settings", async () => {
      renderAppWithRole(SALES_CAPS, "/");

      expect(await screen.findByTestId("nav-products-btn")).toBeInTheDocument();
      expect(screen.getByTestId("nav-warehouses-btn")).toBeInTheDocument();
      expect(screen.getByTestId("nav-receipts-btn")).toBeInTheDocument();
      expect(screen.getByTestId("nav-orders-btn")).toBeInTheDocument();
      expect(screen.queryByTestId("nav-settings-users-btn")).not.toBeInTheDocument();
    });

    it("renders New Order and empty state buttons on SalesOrderListPage for SALES", async () => {
      renderAppWithRole(SALES_CAPS, "/orders");
      expect(await screen.findByTestId("new-sales-order-btn")).toBeInTheDocument();
      expect(await screen.findByTestId("create-first-order-btn")).toBeInTheDocument();
    });

    it("hides Add Product button on ProductsPage for SALES", async () => {
      renderAppWithRole(SALES_CAPS, "/products");
      expect(await screen.findByRole("heading", { name: /sản phẩm/i })).toBeInTheDocument();
      expect(screen.queryByTestId("add-product-btn")).not.toBeInTheDocument();
    });

    it("hides Add Warehouse button on WarehousesPage for SALES", async () => {
      renderAppWithRole(SALES_CAPS, "/warehouses");
      expect(await screen.findByRole("heading", { name: /kho/i })).toBeInTheDocument();
      expect(screen.queryByTestId("add-warehouse-btn")).not.toBeInTheDocument();
    });

    it("hides New Receipt button on StockReceiptListPage for SALES", async () => {
      renderAppWithRole(SALES_CAPS, "/inventory/receipts");
      expect(await screen.findByRole("heading", { name: /nhập kho/i })).toBeInTheDocument();
      expect(screen.queryByTestId("create-receipt-btn")).not.toBeInTheDocument();
    });

    it("redirects direct access to /inventory/receipts/new to / for SALES", async () => {
      renderAppWithRole(SALES_CAPS, "/inventory/receipts/new");
      expect(await screen.findByTestId("dashboard-home")).toBeInTheDocument();
      expect(screen.queryByTestId("create-receipt-page")).not.toBeInTheDocument();
    });

    it("redirects direct access to /settings/users to / for SALES", async () => {
      renderAppWithRole(SALES_CAPS, "/settings/users");
      expect(await screen.findByTestId("dashboard-home")).toBeInTheDocument();
    });
  });

  describe("READ-ONLY SALES Role (sales.view without sales.create)", () => {
    it("hides both header New Order and empty-state Create First Order buttons on SalesOrderListPage", async () => {
      renderAppWithRole(READ_ONLY_SALES_CAPS, "/orders");
      expect(await screen.findByRole("heading", { name: /đơn bán hàng/i })).toBeInTheDocument();
      expect(screen.queryByTestId("new-sales-order-btn")).not.toBeInTheDocument();
      expect(screen.queryByTestId("create-first-order-btn")).not.toBeInTheDocument();
    });

    it("redirects direct access to /orders/new to / for read-only sales", async () => {
      renderAppWithRole(READ_ONLY_SALES_CAPS, "/orders/new");
      expect(await screen.findByTestId("dashboard-home")).toBeInTheDocument();
      expect(screen.queryByTestId("create-order-page")).not.toBeInTheDocument();
    });
  });

  describe("WAREHOUSE Role", () => {
    it("renders only Products, Warehouses, and Receipts navigation links, hiding Orders and Users", async () => {
      renderAppWithRole(WAREHOUSE_CAPS, "/");

      expect(await screen.findByTestId("nav-products-btn")).toBeInTheDocument();
      expect(screen.getByTestId("nav-warehouses-btn")).toBeInTheDocument();
      expect(screen.getByTestId("nav-receipts-btn")).toBeInTheDocument();
      expect(screen.queryByTestId("nav-orders-btn")).not.toBeInTheDocument();
      expect(screen.queryByTestId("nav-settings-users-btn")).not.toBeInTheDocument();
    });

    it("renders Add Warehouse on WarehousesPage for WAREHOUSE", async () => {
      renderAppWithRole(WAREHOUSE_CAPS, "/warehouses");
      expect(await screen.findByTestId("add-warehouse-btn")).toBeInTheDocument();
    });

    it("renders New Receipt on StockReceiptListPage for WAREHOUSE", async () => {
      renderAppWithRole(WAREHOUSE_CAPS, "/inventory/receipts");
      expect(await screen.findByTestId("create-receipt-btn")).toBeInTheDocument();
    });

    it("hides Add Product on ProductsPage for WAREHOUSE", async () => {
      renderAppWithRole(WAREHOUSE_CAPS, "/products");
      expect(await screen.findByRole("heading", { name: /sản phẩm/i })).toBeInTheDocument();
      expect(screen.queryByTestId("add-product-btn")).not.toBeInTheDocument();
    });

    it("redirects direct access to /orders/new to / for WAREHOUSE", async () => {
      renderAppWithRole(WAREHOUSE_CAPS, "/orders/new");
      expect(await screen.findByTestId("dashboard-home")).toBeInTheDocument();
      expect(screen.queryByTestId("create-order-page")).not.toBeInTheDocument();
    });

    it("redirects direct access to /settings/users to / for WAREHOUSE", async () => {
      renderAppWithRole(WAREHOUSE_CAPS, "/settings/users");
      expect(await screen.findByTestId("dashboard-home")).toBeInTheDocument();
    });
  });
});
