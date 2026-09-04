import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProtectedRoute } from "../components/ProtectedRoute.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProtectedRoute", () => {
  it("redirects unauthenticated users to /login", async () => {
    const fetchMock = vi.fn().mockImplementation((req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      if (url.includes("/auth/me")) {
        return Promise.resolve(new Response(null, { status: 401 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
            <Route element={<ProtectedRoute />}>
              <Route
                path="/dashboard"
                element={<div data-testid="dashboard">Protected Dashboard</div>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("login-page")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard")).not.toBeInTheDocument();
  });

  it("renders protected content when user is authenticated", async () => {
    const fetchMock = vi.fn().mockImplementation((req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      if (url.includes("/auth/me")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
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
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
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

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
            <Route element={<ProtectedRoute />}>
              <Route
                path="/dashboard"
                element={<div data-testid="dashboard">Protected Dashboard</div>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("dashboard")).toBeInTheDocument();
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });

  it("redirects to / when user lacks requiredCapability", async () => {
    const fetchMock = vi.fn().mockImplementation((req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      if (url.includes("/auth/me")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: {
                id: "user-1",
                email: "sales@vlxd.local",
                fullName: "Nhân viên",
                tenantId: "tenant-1",
                status: "active",
                titles: ["Nhân viên"],
                capabilities: ["sales.create"],
              },
              tenant: {
                id: "tenant-1",
                name: "Cửa hàng VLXD Homy",
                code: "vlxd-homy",
                plan: "free",
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
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

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/settings/users"]}>
          <Routes>
            <Route path="/" element={<div data-testid="home-page">Home Page</div>} />
            <Route element={<ProtectedRoute requiredCapability="users.manage" />}>
              <Route
                path="/settings/users"
                element={<div data-testid="users-settings">Users Settings</div>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("home-page")).toBeInTheDocument();
    expect(screen.queryByTestId("users-settings")).not.toBeInTheDocument();
  });
});
