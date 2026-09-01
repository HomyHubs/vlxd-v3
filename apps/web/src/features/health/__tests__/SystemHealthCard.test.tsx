import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SystemHealthCard } from "../components/SystemHealthCard";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SystemHealthCard", () => {
  it("calls the API path and shows the Vietnamese success message", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ status: "ok", db: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <SystemHealthCard />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Kiểm tra hệ thống" }));

    expect(await screen.findByText("Hệ thống hoạt động bình thường")).toBeInTheDocument();
    const calledUrl =
      fetchMock.mock.calls[0]?.[0] instanceof Request
        ? fetchMock.mock.calls[0][0].url
        : String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("/api/health");
  });
});
