import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import "../../../i18n.js";
import { ProductsPage } from "../index.js";

vi.mock("../api/useProducts.js", () => ({
  PRODUCTS_QUERY_KEY: ["products"],
  useProducts: () => ({ data: { items: [], page: 1, pageSize: 20, total: 0 }, isLoading: false }),
  useCreateProduct: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("ProductsPage", () => {
  it("renders the product table and opens the create dialog", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ProductsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: /sản phẩm/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /thêm sản phẩm/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: /mã sản phẩm/i })).toBeInTheDocument();
  });
});
