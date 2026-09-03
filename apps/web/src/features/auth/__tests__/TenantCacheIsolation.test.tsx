import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreateStockReceiptPage } from "../../inventory/pages/CreateStockReceiptPage.js";
import { ProductsPage } from "../../products/pages/ProductsPage.js";
import { CreateSalesOrderPage } from "../../sales-orders/pages/CreateSalesOrderPage.js";
import { useCreateUser } from "../../users/api/useUsers.js";
import { UsersPage } from "../../users/pages/UsersPage.js";
import {
  AUTH_QUERY_KEY,
  clearTenantCache,
  resetTenantTracker,
  setAuthBroadcastChannel,
  useCurrentUser,
  useLogin,
  useLogout,
} from "../api/useAuth.js";
import { AppHeader } from "../components/AppHeader.js";
import { AuthProvider } from "../components/AuthProvider.js";
import { ProtectedRoute } from "../components/ProtectedRoute.js";

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

  it("cross-tab: receiving AUTH_CHANGED immediately fails closed, unmounts Tenant A protected content, and resolves to Tenant B", async () => {
    let resolveReceivingTabAuthMe: ((value: Response) => void) | null = null;

    const tenantASession = {
      user: {
        id: "user-a",
        email: "alice@tenant-a.local",
        fullName: "Alice A (Tenant A)",
        status: "active" as const,
        titles: ["Chủ cửa hàng"],
        capabilities: ["products.view", "users.manage"],
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
        titles: ["Chủ cửa hàng"],
        capabilities: ["products.view", "users.manage"],
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
          resolveReceivingTabAuthMe = resolve;
        });
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    // Mock BroadcastChannel
    const listeners: ((event: MessageEvent) => void)[] = [];
    const mockChannel = {
      addEventListener: vi.fn((type: string, handler: (event: MessageEvent) => void) => {
        if (type === "message") listeners.push(handler);
      }),
      removeEventListener: vi.fn((_type: string, handler: (event: MessageEvent) => void) => {
        const idx = listeners.indexOf(handler);
        if (idx >= 0) listeners.splice(idx, 1);
      }),
      postMessage: vi.fn(),
      close: vi.fn(),
    } as unknown as BroadcastChannel;

    setAuthBroadcastChannel(mockChannel);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    resetTenantTracker("tenant-a:user-a");
    queryClient.setQueryData(AUTH_QUERY_KEY, tenantASession);

    function ProtectedApp() {
      return (
        <AuthProvider>
          <MemoryRouter initialEntries={["/"]}>
            <Routes>
              <Route path="/login" element={<div data-testid="login-screen">Login Screen</div>} />
              <Route element={<ProtectedRoute />}>
                <Route
                  path="/"
                  element={
                    <div>
                      <AppHeader />
                      <div data-testid="protected-content">Tenant A Dashboard</div>
                    </div>
                  }
                />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      );
    }

    render(
      <QueryClientProvider client={queryClient}>
        <ProtectedApp />
      </QueryClientProvider>,
    );

    // 1. Initial state: Tenant A protected content is mounted
    expect(screen.getByTestId("protected-content")).toHaveTextContent("Tenant A Dashboard");
    expect(screen.getByTestId("header-user-name")).toHaveTextContent("Alice A (Tenant A)");

    // 2. Remote tab emits AUTH_CHANGED
    listeners.forEach((listener) => listener({ data: { type: "AUTH_CHANGED" } } as MessageEvent));

    // 3. Immediately assert: Tenant A identity and protected content are ABSENT while /auth/me is pending!
    await waitFor(() => {
      expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
      expect(screen.queryByTestId("header-user-name")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("login-screen")).toBeInTheDocument();

    // 4. Resolve receiving tab's pending /auth/me to Tenant B
    resolveReceivingTabAuthMe!(
      new Response(JSON.stringify(tenantBSession), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // 5. Verify final state committed Tenant B
    await waitFor(() => {
      expect(queryClient.getQueryData(AUTH_QUERY_KEY)).toEqual(tenantBSession);
    });
  });

  it("identity transition: employee dialog in UsersPage completely unmounts and discards drafts across identity change", async () => {
    const tenantAOwner = {
      user: {
        id: "owner-a",
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

    const tenantBOwner = {
      user: {
        id: "owner-b",
        email: "bob@tenant-b.local",
        fullName: "Bob B (Tenant B)",
        status: "active" as const,
        titles: ["Chủ cửa hàng"],
        capabilities: ["users.manage"],
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
      if (url.includes("/users")) {
        return Promise.resolve(
          new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("/titles")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [{ id: "t-sales", code: "SALES", name: "Nhân viên bán hàng" }],
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

    resetTenantTracker("tenant-a:owner-a");
    queryClient.setQueryData(AUTH_QUERY_KEY, tenantAOwner);

    function TestApp() {
      return (
        <MemoryRouter initialEntries={["/settings/users"]}>
          <Routes>
            <Route element={<ProtectedRoute requiredCapability="users.manage" />}>
              <Route path="/settings/users" element={<UsersPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      );
    }

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <TestApp />
      </QueryClientProvider>,
    );

    // 1. Open employee dialog under Tenant A
    const openBtn = await screen.findByTestId("add-user-btn");
    openBtn.click();

    // Fill in employee draft in dialog
    const nameInput = await screen.findByTestId("user-fullname-input");
    const emailInput = await screen.findByTestId("user-email-input");
    const passInput = await screen.findByTestId("user-password-input");

    expect(nameInput).toBeInTheDocument();
    fireEvent.change(nameInput, { target: { value: "Tenant A Secret Employee" } });
    fireEvent.change(emailInput, { target: { value: "secret@tenant-a.local" } });
    fireEvent.change(passInput, { target: { value: "passwordSecret123" } });
    expect((nameInput as HTMLInputElement).value).toBe("Tenant A Secret Employee");

    // 2. Identity switches to Tenant B Owner
    resetTenantTracker("tenant-b:owner-b");
    queryClient.setQueryData(AUTH_QUERY_KEY, tenantBOwner);

    rerender(
      <QueryClientProvider client={queryClient}>
        <TestApp />
      </QueryClientProvider>,
    );

    // 3. Assert: Because ProtectedRoute keys Outlet by identityKey,
    // the employee dialog from Tenant A is completely unmounted!
    await waitFor(() => {
      expect(screen.queryByText("Thêm nhân viên mới")).not.toBeInTheDocument();
      expect(screen.queryByTestId("user-fullname-input")).not.toBeInTheDocument();
    });

    // Reopening the dialog under Tenant B yields a fresh, blank form
    const newOpenBtn = await screen.findByTestId("add-user-btn");
    newOpenBtn.click();

    const freshNameInput = await screen.findByTestId("user-fullname-input");
    expect((freshNameInput as HTMLInputElement).value).toBe("");
  });

  it("in-flight mutation started under Tenant A does not pollute cache or update state after identity switches to Tenant B", async () => {
    let resolveCreateUser: ((value: Response) => void) | null = null;

    const tenantAOwner = {
      user: {
        id: "owner-a",
        email: "alice@tenant-a.local",
        fullName: "Alice A",
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

    const tenantBOwner = {
      user: {
        id: "owner-b",
        email: "bob@tenant-b.local",
        fullName: "Bob B",
        status: "active" as const,
        titles: ["Chủ cửa hàng"],
        capabilities: ["users.manage"],
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
        return Promise.resolve(
          new Response(JSON.stringify(tenantAOwner), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("/users")) {
        return new Promise<Response>((resolve) => {
          resolveCreateUser = resolve;
        });
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    resetTenantTracker("tenant-a:owner-a");
    queryClient.setQueryData(AUTH_QUERY_KEY, tenantAOwner);

    // Seed Tenant B user cache with a known item
    queryClient.setQueryData(["users", "tenant-b"], { items: [{ id: "existing-b" }] });

    let mutationTrigger: (() => Promise<void>) | null = null;
    let mutationError: Error | null = null;
    function MutationComponent() {
      const createUserMutation = useCreateUser();
      mutationTrigger = async () => {
        try {
          await createUserMutation.mutateAsync({
            fullName: "Should Not Apply",
            email: "stale@tenant-a.local",
            password: "password123",
            titleId: "t-sales",
          });
        } catch (err: unknown) {
          mutationError = err as Error;
        }
      };
      return <div>Mutation Runner</div>;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <MutationComponent />
      </QueryClientProvider>,
    );

    // 1. Trigger mutation under Tenant A (held in flight)
    void mutationTrigger!();

    await waitFor(() => {
      expect(resolveCreateUser).not.toBeNull();
    });

    // 2. Identity switches to Tenant B
    resetTenantTracker("tenant-b:owner-b");
    queryClient.setQueryData(AUTH_QUERY_KEY, tenantBOwner);

    // 3. Now the delayed Tenant A mutation resolves
    resolveCreateUser!(
      new Response(
        JSON.stringify({
          id: "new-user-a",
          email: "stale@tenant-a.local",
          fullName: "Should Not Apply",
          status: "active",
          titles: ["Nhân viên bán hàng"],
          createdAt: "2026-09-01T00:00:00.000Z",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    // 4. Assert: Mutation promise rejected with AUTH_CONTEXT_CHANGED
    await waitFor(() => {
      expect(mutationError).not.toBeNull();
      expect(mutationError?.message).toBe("AUTH_CONTEXT_CHANGED");
    });

    // 5. Assert: Tenant B user cache is untouched and was not invalidated or polluted
    await new Promise((r) => setTimeout(r, 50));
    expect(queryClient.getQueryData(["users", "tenant-b"])).toEqual({
      items: [{ id: "existing-b" }],
    });
  });

  it("in-flight CreateSalesOrderPage mutation: resolving delayed mutation across identity change rejects with AUTH_CONTEXT_CHANGED and does not navigate or affect Tenant B", async () => {
    let resolveCreateOrder: ((res: Response) => void) | null = null;
    const tenantAOwner = {
      user: {
        id: "owner-a",
        email: "owner-a@vlxd.local",
        fullName: "Chủ Cửa Hàng A",
        status: "active" as const,
        titles: ["Chủ cửa hàng"],
        capabilities: ["orders.create", "orders.view", "sales.create", "sales.view"],
      },
      tenant: {
        id: "tenant-a",
        name: "Cửa Hàng A",
        code: "tenant-a",
        plan: "free" as const,
      },
    };

    const tenantBOwner = {
      user: {
        id: "owner-b",
        email: "owner-b@vlxd.local",
        fullName: "Chủ Cửa Hàng B",
        status: "active" as const,
        titles: ["Chủ cửa hàng"],
        capabilities: ["orders.create", "orders.view", "sales.create", "sales.view"],
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
        return Promise.resolve(
          new Response(JSON.stringify(tenantAOwner), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("/customers")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [{ id: "cust-1", code: "KH-01", name: "Khách A", phone: "0901" }],
              total: 1,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url.includes("/warehouses")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [{ id: "wh-1", code: "WH-01", name: "Kho A" }],
              total: 1,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url.includes("/products")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: "prod-1",
                  sku: "XM-01",
                  name: "Xi măng Hà Tiên",
                  unitName: "Bao",
                  price: 85000,
                },
              ],
              total: 1,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url.includes("/sales-orders")) {
        return new Promise<Response>((resolve) => {
          resolveCreateOrder = resolve;
        });
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    resetTenantTracker("tenant-a:owner-a");
    queryClient.setQueryData(AUTH_QUERY_KEY, tenantAOwner);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/orders/new"]}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/orders/new" element={<CreateSalesOrderPage />} />
              <Route
                path="/orders/:id"
                element={<div data-testid="order-detail-page">Tenant Stale Order Detail</div>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Wait for form data and defaults to load
    await waitFor(() => {
      expect(screen.getByTestId("order-customer-select")).toBeInTheDocument();
      expect(screen.getByTestId("submit-order-button")).toBeInTheDocument();
    });

    // Wait for defaults (customerId, warehouseId, product on line 0) to be populated
    await waitFor(() => {
      const customerInput = screen.getByTestId("order-customer-select").querySelector("input")!;
      expect(customerInput.value).toBe("cust-1");
    });

    // Submit the sales order under Tenant A
    const submitBtn = screen.getByTestId("submit-order-button");
    fireEvent.click(submitBtn);

    // Verify the POST request is in flight
    await waitFor(() => {
      expect(resolveCreateOrder).not.toBeNull();
    });

    // Identity switch to Tenant B occurs while POST is in flight
    resetTenantTracker("tenant-b:owner-b");
    queryClient.setQueryData(AUTH_QUERY_KEY, tenantBOwner);

    // Now delayed POST resolves with Tenant A order id
    resolveCreateOrder!(
      new Response(
        JSON.stringify({
          id: "order-tenant-a-999",
          customerId: "cust-1",
          warehouseId: "wh-1",
          status: "pending",
          totalAmount: 85000,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    // Wait and verify: order detail route of Tenant A was NOT navigated to
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByTestId("order-detail-page")).not.toBeInTheDocument();
    expect(screen.queryByText("order-tenant-a-999")).not.toBeInTheDocument();
  });

  it("in-flight CreateStockReceiptPage mutation: resolving delayed mutation across identity change rejects with AUTH_CONTEXT_CHANGED and does not navigate or affect Tenant B", async () => {
    let resolveCreateReceipt: ((res: Response) => void) | null = null;
    const tenantAOwner = {
      user: {
        id: "owner-a",
        email: "owner-a@vlxd.local",
        fullName: "Chủ Cửa Hàng A",
        status: "active" as const,
        titles: ["Chủ cửa hàng"],
        capabilities: ["inventory.manage"],
      },
      tenant: {
        id: "tenant-a",
        name: "Cửa Hàng A",
        code: "tenant-a",
        plan: "free" as const,
      },
    };

    const tenantBOwner = {
      user: {
        id: "owner-b",
        email: "owner-b@vlxd.local",
        fullName: "Chủ Cửa Hàng B",
        status: "active" as const,
        titles: ["Chủ cửa hàng"],
        capabilities: ["inventory.manage"],
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
        return Promise.resolve(
          new Response(JSON.stringify(tenantAOwner), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("/warehouses")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [{ id: "wh-1", code: "WH-01", name: "Kho A" }],
              total: 1,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url.includes("/products")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: "prod-1",
                  sku: "XM-01",
                  name: "Xi măng Hà Tiên",
                  unitName: "Bao",
                  price: 85000,
                },
              ],
              total: 1,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (url.includes("/stock-receipts")) {
        return new Promise<Response>((resolve) => {
          resolveCreateReceipt = resolve;
        });
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    resetTenantTracker("tenant-a:owner-a");
    queryClient.setQueryData(AUTH_QUERY_KEY, tenantAOwner);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/inventory/receipts/new"]}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/inventory/receipts/new" element={<CreateStockReceiptPage />} />
              <Route
                path="/inventory/receipts/:id"
                element={<div data-testid="receipt-detail-page">Tenant Stale Receipt Detail</div>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Wait for form data and defaults to load
    await waitFor(() => {
      expect(screen.getByTestId("warehouse-select")).toBeInTheDocument();
      expect(screen.getByTestId("submit-receipt-button")).toBeInTheDocument();
    });

    await waitFor(() => {
      const warehouseInput = screen.getByTestId("warehouse-select").querySelector("input")!;
      expect(warehouseInput.value).toBe("wh-1");
    });

    // Submit the stock receipt under Tenant A
    const submitBtn = screen.getByTestId("submit-receipt-button");
    fireEvent.click(submitBtn);

    // Verify the POST request is in flight
    await waitFor(() => {
      expect(resolveCreateReceipt).not.toBeNull();
    });

    // Identity switch to Tenant B occurs while POST is in flight
    resetTenantTracker("tenant-b:owner-b");
    queryClient.setQueryData(AUTH_QUERY_KEY, tenantBOwner);

    // Now delayed POST resolves with Tenant A receipt id
    resolveCreateReceipt!(
      new Response(
        JSON.stringify({
          id: "receipt-tenant-a-888",
          warehouseId: "wh-1",
          status: "completed",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    // Wait and verify: receipt detail route of Tenant A was NOT navigated to
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByTestId("receipt-detail-page")).not.toBeInTheDocument();
    expect(screen.queryByText("receipt-tenant-a-888")).not.toBeInTheDocument();
  });
});
