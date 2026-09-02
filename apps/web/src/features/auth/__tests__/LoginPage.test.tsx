import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "../pages/LoginPage.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderLoginPage(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div data-testid="home-page">Home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LoginPage", () => {
  it("renders login form with title, email, password fields, and submit button", async () => {
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

    renderLoginPage(queryClient);

    expect(await screen.findByRole("heading", { name: "Đăng nhập hệ thống" })).toBeInTheDocument();
    expect(screen.getByTestId("email-input")).toBeInTheDocument();
    expect(screen.getByTestId("password-input")).toBeInTheDocument();
    expect(screen.getByTestId("login-submit-button")).toBeInTheDocument();
  });

  it("submits form and redirects to home on successful login", async () => {
    const fetchMock = vi.fn().mockImplementation((req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      if (url.includes("/auth/me")) {
        return Promise.resolve(new Response(null, { status: 401 }));
      }
      if (url.includes("/auth/login")) {
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

    renderLoginPage(queryClient);

    const emailInput = await screen.findByTestId("email-input");
    const passwordInput = screen.getByTestId("password-input");
    const submitButton = screen.getByTestId("login-submit-button");

    await userEvent.type(emailInput, "owner@vlxd.local");
    await userEvent.type(passwordInput, "MatKhau@123");
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByTestId("home-page")).toBeInTheDocument();
    });
  });

  it("displays error message when login fails with invalid credentials", async () => {
    const fetchMock = vi.fn().mockImplementation((req: Request | string) => {
      const url = typeof req === "string" ? req : req.url;
      if (url.includes("/auth/me")) {
        return Promise.resolve(new Response(null, { status: 401 }));
      }
      if (url.includes("/auth/login")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: "INVALID_CREDENTIALS",
              message: "Email hoặc mật khẩu không chính xác",
            }),
            {
              status: 401,
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

    renderLoginPage(queryClient);

    const emailInput = await screen.findByTestId("email-input");
    const passwordInput = screen.getByTestId("password-input");
    const submitButton = screen.getByTestId("login-submit-button");

    await userEvent.type(emailInput, "owner@vlxd.local");
    await userEvent.type(passwordInput, "WrongPass");
    await userEvent.click(submitButton);

    expect(await screen.findByTestId("login-error-alert")).toHaveTextContent(
      "Email hoặc mật khẩu không chính xác",
    );
  });
});
