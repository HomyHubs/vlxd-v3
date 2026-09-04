import { describe, expect, it, vi, beforeEach } from "vitest";
import { apiClient } from "../apiClient.js";
import { setSessionContext } from "../../features/auth/api/sessionContext.js";

describe("apiClient transport & headers", () => {
  beforeEach(() => {
    setSessionContext(null, null);
    vi.restoreAllMocks();
  });

  it("preserves Content-Type: application/json on login POST without session context", async () => {
    let capturedRequest: Request | undefined;

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      capturedRequest = input as Request;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            user: {
              id: "u-1",
              email: "test@example.com",
              fullName: "Test",
              tenantId: "t-1",
              status: "active",
              titles: ["Owner"],
              capabilities: [],
            },
            tenant: { id: "t-1", name: "Store", code: "store", plan: "free" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    });

    const res = await apiClient.POST("/auth/login", {
      body: {
        email: "test@example.com",
        password: "password123",
      },
    });

    expect(res.error).toBeUndefined();
    expect(capturedRequest).toBeDefined();
    expect(capturedRequest!.headers.get("content-type")).toBe("application/json");
    expect(capturedRequest!.headers.get("x-expected-tenant-id")).toBeNull();
    expect(capturedRequest!.headers.get("x-session-context")).toBeNull();

    const bodyText = await capturedRequest!.text();
    expect(JSON.parse(bodyText)).toEqual({
      email: "test@example.com",
      password: "password123",
    });
  });

  it("preserves Content-Type and injects precondition headers when session context is active", async () => {
    setSessionContext("tenant-100", "tenant-100:user-200");

    let capturedRequest: Request | undefined;

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      capturedRequest = input as Request;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "prod-1",
            sku: "XI-MANG",
            name: "Xi măng Hà Tiên",
            unitName: "Bao",
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
      );
    });

    const res = await apiClient.POST("/products", {
      body: {
        sku: "XI-MANG",
        name: "Xi măng Hà Tiên",
        unitCode: "bao",
      },
    });

    expect(res.error).toBeUndefined();
    expect(capturedRequest).toBeDefined();
    expect(capturedRequest!.headers.get("content-type")).toBe("application/json");
    expect(capturedRequest!.headers.get("x-expected-tenant-id")).toBe("tenant-100");
    expect(capturedRequest!.headers.get("x-session-context")).toBe("tenant-100:user-200");

    const bodyText = await capturedRequest!.text();
    expect(JSON.parse(bodyText)).toEqual({
      sku: "XI-MANG",
      name: "Xi măng Hà Tiên",
      unitCode: "bao",
    });
  });

  it("respects explicit precondition headers passed by caller", async () => {
    setSessionContext("tenant-100", "tenant-100:user-200");

    let capturedRequest: Request | undefined;

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      capturedRequest = input as Request;
      return Promise.resolve(
        new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });

    await apiClient.GET("/products", {
      headers: {
        "x-expected-tenant-id": "tenant-custom",
        "x-session-context": "tenant-custom:user-999",
      },
    });

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest!.headers.get("x-expected-tenant-id")).toBe("tenant-custom");
    expect(capturedRequest!.headers.get("x-session-context")).toBe("tenant-custom:user-999");
  });
});
