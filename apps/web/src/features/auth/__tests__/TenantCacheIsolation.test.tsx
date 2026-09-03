import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductsPage } from "../../products/pages/ProductsPage.js";
import { UsersPage } from "../../users/pages/UsersPage.js";
import {
  AUTH_QUERY_KEY,
  clearTenantCache,
  resetTenantTracker,
  useCurrentUser,
  useLogin,
  useLogout,
} from "../api/useAuth.js";

afterEach(() => {
  vi.unstubAllGlobals();
  resetTenantTracker(null);
});

describe("Cross-tenant cache isolation", () => {
  it("does not leak cached tenant A roster to tenant B when second response is deliberately delayed", async () => {
    let currentTenant: "tenant-a" | "tenant-b" = "tenant-a";
    let resolveTenantBUsers: ((value: Response) => void) | null = null;

    const tenantAUser = {
      id: "user-a",
      email: "alice@tenant-a.local",
      fullName: "Alice A (Tenant A)",
      status: "active" as const,
      titles: ["Chủ cửa hàng"],
      createdAt: "2026-09-01T00:00:00.000Z",
    };

    const tenantBUser = {
      id: "user-b",
      email: "bob@tenant-b.local",
      fullName: "Bob B (Tenant B)",
      status: "active" as const,
      titles: ["Chủ cửa hàng"],
      createdAt: "2026-09-02T00:00:00.000Z",
    };

    const fetchMock = vi.fn().mockImplementation((req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;

      if (url.includes("/auth/me")) {
        const tenantId = currentTenant;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: {
                id: tenantId === "tenant-a" ? "user-a" : "user-b",
                email: tenantId === "tenant-a" ? "alice@tenant-a.local" : "bob@tenant-b.local",
                fullName: tenantId === "tenant-a" ? "Alice A (Tenant A)" : "Bob B (Tenant B)",
                status: "active",
                titles: ["Chủ cửa hàng"],
                capabilities: ["users.manage"],
              },
              tenant: {
                id: tenantId,
                name: tenantId === "tenant-a" ? "Cửa Hàng A" : "Cửa Hàng B",
                code: tenantId,
                plan: "free",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url.includes("/users")) {
        if (currentTenant === "tenant-a") {
          return Promise.resolve(
            new Response(JSON.stringify({ items: [tenantAUser] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }

        // tenant-b: deliberately delayed response
        return new Promise<Response>((resolve) => {
          resolveTenantBUsers = resolve;
        });
      }

      if (url.includes("/titles")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [{ id: "t-owner", code: "OWNER", name: "Chủ cửa hàng" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });

    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    // 1. Initial render under tenant-a
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <UsersPage />
      </QueryClientProvider>,
    );

    // Wait for Tenant A data to be visible
    await waitFor(() => {
      expect(screen.getByText("Alice A (Tenant A)")).toBeInTheDocument();
      expect(screen.getByText("alice@tenant-a.local")).toBeInTheDocument();
    });

    // 2. Switch identity to tenant-b with clearTenantCache
    currentTenant = "tenant-b";
    clearTenantCache(queryClient);
    queryClient.setQueryData(AUTH_QUERY_KEY, {
      user: {
        id: "user-b",
        email: "bob@tenant-b.local",
        fullName: "Bob B (Tenant B)",
        status: "active",
        titles: ["Chủ cửa hàng"],
        capabilities: ["users.manage"],
      },
      tenant: {
        id: "tenant-b",
        name: "Cửa Hàng B",
        code: "tenant-b",
        plan: "free",
      },
    });

    // Re-render UsersPage under tenant-b
    rerender(
      <QueryClientProvider client={queryClient}>
        <UsersPage />
      </QueryClientProvider>,
    );

    // 3. While tenant-b's /users request is in-flight (delayed),
    // verify tenant A data is NOT rendered or leaked!
    expect(screen.queryByText("Alice A (Tenant A)")).not.toBeInTheDocument();
    expect(screen.queryByText("alice@tenant-a.local")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    // 4. Resolve tenant-b's delayed response
    resolveTenantBUsers!(
      new Response(JSON.stringify({ items: [tenantBUser] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // 5. Verify tenant B data is now rendered
    await waitFor(() => {
      expect(screen.getByText("Bob B (Tenant B)")).toBeInTheDocument();
      expect(screen.getByText("bob@tenant-b.local")).toBeInTheDocument();
    });
    expect(screen.queryByText("Alice A (Tenant A)")).not.toBeInTheDocument();
  });

  it("production path: refetching AUTH_QUERY_KEY with Tenant B replaces auth cache and purges Tenant A non-auth queries without self-cancellation", async () => {
    function AuthConsumer() {
      const { data: session, isLoading } = useCurrentUser();
      if (isLoading) return <div>Loading...</div>;
      if (!session) return <div>Unauthenticated</div>;
      return (
        <div>
          <div data-testid="user-name">{session.user.fullName}</div>
          <div data-testid="tenant-name">{session.tenant.name}</div>
        </div>
      );
    }

    const tenantASession = {
      user: {
        id: "user-a",
        email: "alice@tenant-a.local",
        fullName: "Alice A (Tenant A)",
        status: "active" as const,
        titles: ["Chủ cửa hàng"],
        capabilities: ["users.manage"],
      },
      tenant: {
        id: "tenant-a",
        name: "Cửa Hàng A",
        code: "tenant-a",
        plan: "free" as const,
      },
    };

    const tenantBSession = {
      user: {
        id: "user-b",
        email: "bob@tenant-b.local",
        fullName: "Bob B (Tenant B)",
        status: "active" as const,
        titles: ["Nhân viên bán hàng"],
        capabilities: ["sales.view"],
      },
      tenant: {
        id: "tenant-b",
        name: "Cửa Hàng B",
        code: "tenant-b",
        plan: "free" as const,
      },
    };

    let authResponse = tenantASession;

    const fetchMock = vi.fn().mockImplementation((req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      if (url.includes("/auth/me")) {
        return Promise.resolve(
          new Response(JSON.stringify(authResponse), {
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

    resetTenantTracker("tenant-a:user-a");
    queryClient.setQueryData(AUTH_QUERY_KEY, tenantASession);
    queryClient.setQueryData(["users", "tenant-a"], { items: [{ id: "user-a" }] });
    queryClient.setQueryData(["titles", "tenant-a"], { items: [{ id: "t-owner" }] });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthConsumer />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("user-name")).toHaveTextContent("Alice A (Tenant A)");
    expect(screen.getByTestId("tenant-name")).toHaveTextContent("Cửa Hàng A");
    expect(queryClient.getQueryData(["users", "tenant-a"])).toBeDefined();

    // Trigger production refetch with Tenant B
    authResponse = tenantBSession;
    await queryClient.refetchQueries({ queryKey: AUTH_QUERY_KEY });

    // Verify auth query successfully committed Tenant B without self-cancellation
    await waitFor(() => {
      expect(screen.getByTestId("user-name")).toHaveTextContent("Bob B (Tenant B)");
      expect(screen.getByTestId("tenant-name")).toHaveTextContent("Cửa Hàng B");
    });

    const cachedAuth = queryClient.getQueryData(AUTH_QUERY_KEY);
    expect(cachedAuth).toEqual(tenantBSession);

    // Verify Tenant A non-auth queries were cleanly purged
    expect(queryClient.getQueryData(["users", "tenant-a"])).toBeUndefined();
    expect(queryClient.getQueryData(["titles", "tenant-a"])).toBeUndefined();
  });

  it("production path: refetching AUTH_QUERY_KEY with 401 clears auth cache to null and purges non-auth queries", async () => {
    function AuthConsumer() {
      const { data: session, isLoading } = useCurrentUser();
      if (isLoading) return <div>Loading...</div>;
      if (!session) return <div>Unauthenticated</div>;
      return (
        <div>
          <div data-testid="user-name">{session.user.fullName}</div>
          <div data-testid="tenant-name">{session.tenant.name}</div>
        </div>
      );
    }

    const tenantASession = {
      user: {
        id: "user-a",
        email: "alice@tenant-a.local",
        fullName: "Alice A (Tenant A)",
        status: "active" as const,
        titles: ["Chủ cửa hàng"],
        capabilities: ["users.manage"],
      },
      tenant: {
        id: "tenant-a",
        name: "Cửa Hàng A",
        code: "tenant-a",
        plan: "free" as const,
      },
    };

    let is401 = false;

    const fetchMock = vi.fn().mockImplementation((req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      if (url.includes("/auth/me")) {
        if (is401) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }),
              {
                status: 401,
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify(tenantASession), {
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

    resetTenantTracker("tenant-a:user-a");
    queryClient.setQueryData(AUTH_QUERY_KEY, tenantASession);
    queryClient.setQueryData(["users", "tenant-a"], { items: [{ id: "user-a" }] });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthConsumer />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("user-name")).toHaveTextContent("Alice A (Tenant A)");
    expect(queryClient.getQueryData(["users", "tenant-a"])).toBeDefined();

    // Trigger production refetch with 401
    is401 = true;
    await queryClient.refetchQueries({ queryKey: AUTH_QUERY_KEY });

    // Verify auth query committed null and rendered Unauthenticated
    await waitFor(() => {
      expect(screen.getByText("Unauthenticated")).toBeInTheDocument();
    });

    const cachedAuth = queryClient.getQueryData(AUTH_QUERY_KEY);
    expect(cachedAuth).toBeNull();

    // Verify non-auth queries were purged
    expect(queryClient.getQueryData(["users", "tenant-a"])).toBeUndefined();
  });

  it("prevents stale /auth/me from overwriting logout (deferred response overlapping logout ends at null)", async () => {
    let resolveStaleAuthMe: ((value: Response) => void) | null = null;

    const tenantASession = {
      user: {
        id: "user-a",
        email: "alice@tenant-a.local",
        fullName: "Alice A (Tenant A)",
        status: "active" as const,
        titles: ["Chủ cửa hàng"],
        capabilities: ["users.manage"],
      },
      tenant: {
        id: "tenant-a",
        name: "Cửa Hàng A",
        code: "tenant-a",
        plan: "free" as const,
      },
    };

    const fetchMock = vi.fn().mockImplementation((req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      if (url.includes("/auth/me")) {
        return new Promise<Response>((resolve) => {
          resolveStaleAuthMe = resolve;
        });
      }
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
      defaultOptions: { queries: { retry: false } },
    });

    resetTenantTracker("tenant-a:user-a");
    queryClient.setQueryData(AUTH_QUERY_KEY, tenantASession);

    function TestComponent() {
      const { data: session } = useCurrentUser();
      const logoutMutation = useLogout();
      return (
        <div>
          <div data-testid="auth-status">{session ? session.user.fullName : "Logged Out"}</div>
          <button data-testid="logout-btn" onClick={() => logoutMutation.mutate()}>
            Logout
          </button>
        </div>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("auth-status")).toHaveTextContent("Alice A (Tenant A)");

    // 1. Kick off a background /auth/me refetch
    void queryClient.refetchQueries({ queryKey: AUTH_QUERY_KEY });

    // 2. User clicks logout while /auth/me is in-flight
    screen.getByTestId("logout-btn").click();

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("Logged Out");
    });
    expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toBeNull();

    // 3. Now the old /auth/me returns Tenant A session
    resolveStaleAuthMe!(
      new Response(JSON.stringify(tenantASession), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // 4. Assert auth status remains Logged Out and null!
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId("auth-status")).toHaveTextContent("Logged Out");
    expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toBeNull();
  });

  it("prevents stale /auth/me from overwriting login (old Tenant A /auth/me overlapping Tenant B login ends at Tenant B)", async () => {
    let resolveStaleAuthMe: ((value: Response) => void) | null = null;

    const tenantASession = {
      user: {
        id: "user-a",
        email: "alice@tenant-a.local",
        fullName: "Alice A (Tenant A)",
        status: "active" as const,
        titles: ["Chủ cửa hàng"],
        capabilities: ["users.manage"],
      },
      tenant: {
        id: "tenant-a",
        name: "Cửa Hàng A",
        code: "tenant-a",
        plan: "free" as const,
      },
    };

    const tenantBSession = {
      user: {
        id: "user-b",
        email: "bob@tenant-b.local",
        fullName: "Bob B (Tenant B)",
        status: "active" as const,
        titles: ["Nhân viên bán hàng"],
        capabilities: ["sales.view"],
      },
      tenant: {
        id: "tenant-b",
        name: "Cửa Hàng B",
        code: "tenant-b",
        plan: "free" as const,
      },
    };

    const fetchMock = vi.fn().mockImplementation((req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      if (url.includes("/auth/me")) {
        return new Promise<Response>((resolve) => {
          resolveStaleAuthMe = resolve;
        });
      }
      if (url.includes("/auth/login")) {
        return Promise.resolve(
          new Response(JSON.stringify(tenantBSession), {
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

    resetTenantTracker("tenant-a:user-a");
    queryClient.setQueryData(AUTH_QUERY_KEY, tenantASession);

    function TestComponent() {
      const { data: session } = useCurrentUser();
      const loginMutation = useLogin();
      return (
        <div>
          <div data-testid="auth-status">{session ? session.user.fullName : "Logged Out"}</div>
          <button
            data-testid="login-btn"
            onClick={() =>
              loginMutation.mutate({
                email: "bob@tenant-b.local",
                password: "password123",
              })
            }
          >
            Login B
          </button>
        </div>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("auth-status")).toHaveTextContent("Alice A (Tenant A)");

    // 1. Kick off background /auth/me refetch
    void queryClient.refetchQueries({ queryKey: AUTH_QUERY_KEY });

    // 2. User logs in to Tenant B while old /auth/me is in-flight
    screen.getByTestId("login-btn").click();

    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("Bob B (Tenant B)");
    });
    expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toEqual(tenantBSession);

    // 3. Now the old /auth/me returns Tenant A session
    resolveStaleAuthMe!(
      new Response(JSON.stringify(tenantASession), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // 4. Assert auth status remains Bob B (Tenant B)
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId("auth-status")).toHaveTextContent("Bob B (Tenant B)");
    expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toEqual(tenantBSession);
  });

  it("real business surface: rendering ProductsPage with Tenant A data never displays Tenant A rows under Tenant B", async () => {
    let currentTenant: "tenant-a" | "tenant-b" = "tenant-a";
    let resolveTenantBProducts: ((value: Response) => void) | null = null;

    const tenantAProduct = {
      id: "prod-a",
      name: "Xi măng Hà Tiên (Tenant A)",
      code: "XM-A",
      baseUnitId: "u-bao",
      baseUnitName: "Bao",
      sellingPrice: 90000,
      costPrice: 80000,
      conversionRate: 1,
      stockQuantity: 100,
      createdAt: "2026-09-01T00:00:00.000Z",
    };

    const tenantBProduct = {
      id: "prod-b",
      name: "Cát xây tô (Tenant B)",
      code: "CAT-B",
      baseUnitId: "u-m3",
      baseUnitName: "m3",
      sellingPrice: 250000,
      costPrice: 200000,
      conversionRate: 1,
      stockQuantity: 50,
      createdAt: "2026-09-02T00:00:00.000Z",
    };

    const fetchMock = vi.fn().mockImplementation((req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;

      if (url.includes("/auth/me")) {
        const tenantId = currentTenant;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: {
                id: tenantId === "tenant-a" ? "user-a" : "user-b",
                email: tenantId === "tenant-a" ? "alice@tenant-a.local" : "bob@tenant-b.local",
                fullName: tenantId === "tenant-a" ? "Alice A" : "Bob B",
                status: "active",
                titles: ["Chủ cửa hàng"],
                capabilities: ["products.view", "products.create"],
              },
              tenant: {
                id: tenantId,
                name: tenantId === "tenant-a" ? "Cửa Hàng A" : "Cửa Hàng B",
                code: tenantId,
                plan: "free",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url.includes("/products")) {
        if (currentTenant === "tenant-a") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                items: [tenantAProduct],
                total: 1,
                page: 1,
                pageSize: 20,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }

        // tenant-b: deliberately delayed
        return new Promise<Response>((resolve) => {
          resolveTenantBProducts = resolve;
        });
      }

      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    resetTenantTracker("tenant-a:user-a");
    queryClient.setQueryData(AUTH_QUERY_KEY, {
      user: {
        id: "user-a",
        email: "alice@tenant-a.local",
        fullName: "Alice A",
        status: "active",
        titles: ["Chủ cửa hàng"],
        capabilities: ["products.view", "products.create"],
      },
      tenant: {
        id: "tenant-a",
        name: "Cửa Hàng A",
        code: "tenant-a",
        plan: "free",
      },
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProductsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 1. Tenant A product is visible
    await waitFor(() => {
      expect(screen.getByText("Xi măng Hà Tiên (Tenant A)")).toBeInTheDocument();
    });

    // 2. Identity switches to Tenant B
    currentTenant = "tenant-b";
    queryClient.setQueryData(AUTH_QUERY_KEY, {
      user: {
        id: "user-b",
        email: "bob@tenant-b.local",
        fullName: "Bob B",
        status: "active",
        titles: ["Chủ cửa hàng"],
        capabilities: ["products.view", "products.create"],
      },
      tenant: {
        id: "tenant-b",
        name: "Cửa Hàng B",
        code: "tenant-b",
        plan: "free",
      },
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProductsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 3. Under Tenant B, before delayed response arrives, Tenant A product must NEVER be visible!
    expect(screen.queryByText("Xi măng Hà Tiên (Tenant A)")).not.toBeInTheDocument();

    // 4. Resolve Tenant B products
    resolveTenantBProducts!(
      new Response(
        JSON.stringify({
          items: [tenantBProduct],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    // 5. Tenant B product appears
    await waitFor(() => {
      expect(screen.getByText("Cát xây tô (Tenant B)")).toBeInTheDocument();
    });
    expect(screen.queryByText("Xi măng Hà Tiên (Tenant A)")).not.toBeInTheDocument();
  });
});
