import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTH_QUERY_KEY } from "../api/useAuth.js";
import { AppHeader } from "../components/AppHeader.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AppHeader", () => {
  it("displays user name and tenant name when authenticated, and calls logout on click", async () => {
    const fetchMock = vi.fn().mockImplementation((req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      if (url.includes("/auth/logout")) {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    queryClient.setQueryData(AUTH_QUERY_KEY, {
      user: {
        id: "user-1",
        email: "owner@vlxd.local",
        fullName: "Chủ cửa hàng",
        tenantId: "tenant-1",
        status: "active",
      },
      tenant: {
        id: "tenant-1",
        name: "Cửa hàng VLXD Homy",
        code: "vlxd-homy",
        plan: "free",
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AppHeader />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Cửa hàng VLXD Homy")).toBeInTheDocument();
    expect(screen.getByTestId("header-user-name")).toHaveTextContent("Chủ cửa hàng");
    expect(screen.getByTestId("logout-button")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("logout-button"));

    const calledUrl =
      fetchMock.mock.calls[0]?.[0] instanceof Request
        ? fetchMock.mock.calls[0][0].url
        : String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("/api/auth/logout");
  });
});
