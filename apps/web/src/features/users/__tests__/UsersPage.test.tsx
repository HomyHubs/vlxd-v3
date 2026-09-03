import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTH_QUERY_KEY, resetTenantTracker } from "../../auth/index.js";
import { UsersPage } from "../pages/UsersPage.js";

afterEach(() => {
  vi.unstubAllGlobals();
  resetTenantTracker(null);
});

describe("UsersPage", () => {
  const mockTitles = {
    items: [
      { id: "title-owner", code: "OWNER", name: "Chủ cửa hàng" },
      { id: "title-sales", code: "SALES", name: "Nhân viên bán hàng" },
    ],
  };

  const mockUsers = {
    items: [
      {
        id: "user-1",
        email: "owner@vlxd.local",
        fullName: "Chủ cửa hàng",
        status: "active" as const,
        titles: ["Chủ cửa hàng"],
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ],
  };

  const mockSession = {
    user: {
      id: "user-1",
      email: "owner@vlxd.local",
      fullName: "Chủ cửa hàng",
      status: "active" as const,
      titles: ["Chủ cửa hàng"],
      capabilities: ["users.manage"],
    },
    tenant: {
      id: "tenant-dev-001",
      name: "Cửa hàng VLXD",
      code: "vlxd",
      plan: "free" as const,
    },
  };

  it("renders users table with full name, email, titles, and status", async () => {
    const fetchMock = vi.fn().mockImplementation((req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      if (url.includes("/auth/me")) {
        return Promise.resolve(
          new Response(JSON.stringify(mockSession), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("/users")) {
        return Promise.resolve(
          new Response(JSON.stringify(mockUsers), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("/titles")) {
        return Promise.resolve(
          new Response(JSON.stringify(mockTitles), {
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
    queryClient.setQueryData(AUTH_QUERY_KEY, mockSession);
    resetTenantTracker("tenant-dev-001:user-1");

    render(
      <QueryClientProvider client={queryClient}>
        <UsersPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Quản lý nhân viên")).toBeInTheDocument();
    expect(await screen.findByText("owner@vlxd.local")).toBeInTheDocument();
    expect(screen.getAllByText("Chủ cửa hàng").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Hoạt động")).toBeInTheDocument();
  });

  it("allows opening dialog and submitting new employee", async () => {
    let createdUserEmail = "";
    const fetchMock = vi
      .fn()
      .mockImplementation(async (req: Request | string, init?: RequestInit) => {
        const url = typeof req === "string" ? req : req.url;
        const method = typeof req === "string" ? init?.method : req.method;

        if (url.includes("/auth/me")) {
          return Promise.resolve(
            new Response(JSON.stringify(mockSession), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        if (url.includes("/users") && method === "POST") {
          let bodyStr = "";
          if (req instanceof Request) {
            bodyStr = await req.clone().text();
          } else if (init?.body) {
            bodyStr = typeof init.body === "string" ? init.body : "";
          }
          if (bodyStr) {
            const parsed = JSON.parse(bodyStr) as { email: string };
            createdUserEmail = parsed.email;
          }
          return new Response(
            JSON.stringify({
              id: "user-new",
              email: "new-staff@vlxd.local",
              fullName: "Nhân viên Mới",
              status: "active",
              titles: ["Nhân viên bán hàng"],
              createdAt: new Date().toISOString(),
            }),
            {
              status: 201,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (url.includes("/users")) {
          return Promise.resolve(
            new Response(JSON.stringify(mockUsers), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }
        if (url.includes("/titles")) {
          return Promise.resolve(
            new Response(JSON.stringify(mockTitles), {
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
    queryClient.setQueryData(AUTH_QUERY_KEY, mockSession);
    resetTenantTracker("tenant-dev-001:user-1");

    render(
      <QueryClientProvider client={queryClient}>
        <UsersPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Quản lý nhân viên")).toBeInTheDocument();

    const addBtn = screen.getByTestId("add-user-btn");
    await userEvent.click(addBtn);

    const nameInput = await screen.findByTestId("user-fullname-input");
    expect(nameInput).toBeInTheDocument();

    await userEvent.type(nameInput, "Nhân viên Mới");
    await userEvent.type(screen.getByTestId("user-email-input"), "new-staff@vlxd.local");
    await userEvent.type(screen.getByTestId("user-password-input"), "MatKhau@123");

    await userEvent.click(screen.getByTestId("submit-user-btn"));

    await waitFor(() => {
      expect(createdUserEmail).toBe("new-staff@vlxd.local");
    });
  }, 15000);

  it("displays forbidden alert when API returns 403", async () => {
    const fetchMock = vi.fn().mockImplementation((req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      if (url.includes("/auth/me")) {
        return Promise.resolve(
          new Response(JSON.stringify(mockSession), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("/users")) {
        return Promise.resolve(
          new Response(JSON.stringify({ code: "FORBIDDEN", message: "Forbidden" }), {
            status: 403,
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
    queryClient.setQueryData(AUTH_QUERY_KEY, mockSession);
    resetTenantTracker("tenant-dev-001:user-1");

    render(
      <QueryClientProvider client={queryClient}>
        <UsersPage />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("Bạn không có quyền truy cập trang quản lý người dùng"),
    ).toBeInTheDocument();
  });
});
