import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import "../../../i18n.js";
import { WarehousesPage } from "../index.js";

vi.mock("../api/useWarehouses.js", () => ({
  WAREHOUSES_QUERY_KEY: ["warehouses"],
  useWarehouses: () => ({ data: { items: [], total: 0 }, isLoading: false }),
  useCreateWarehouse: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

describe("WarehousesPage", () => {
  it("opens the create warehouse dialog", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <WarehousesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /thêm kho/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /mã kho/i })).toBeInTheDocument();
  });
});
