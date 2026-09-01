import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../../app.js";

const servers: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("health routes", () => {
  it("returns ok when the database check succeeds", async () => {
    const server = await buildApp({
      checkDatabase: () => Promise.resolve(true),
      logger: false,
    });
    servers.push(server);

    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", db: "ok" });
  });

  it("returns a stable error code when the database check fails", async () => {
    const server = await buildApp({
      checkDatabase: () => Promise.resolve(false),
      logger: false,
    });
    servers.push(server);

    const response = await server.inject({ method: "GET", url: "/readyz" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: "unavailable",
      db: "unavailable",
      code: "DATABASE_UNAVAILABLE",
    });
  });

  it("keeps liveness independent from database readiness", async () => {
    const server = await buildApp({
      checkDatabase: () => Promise.resolve(false),
      logger: false,
    });
    servers.push(server);

    const response = await server.inject({ method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("passes logger to checkDatabase when readiness check fails", async () => {
    let loggedError: unknown = null;
    let loggedMsg: string | undefined;

    const server = await buildApp({
      checkDatabase: (logger) => {
        if (logger) {
          logger.error({ err: new Error("connection lost") }, "test db failure");
          loggedError = true;
          loggedMsg = "test db failure";
        }
        return Promise.resolve(false);
      },
      logger: false,
    });
    servers.push(server);

    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(loggedError).toBe(true);
    expect(loggedMsg).toBe("test db failure");
  });

  it("exempts health and probe routes from rate limit even after >100 requests", async () => {
    const server = await buildApp({
      checkDatabase: () => Promise.resolve(true),
      logger: false,
    });
    servers.push(server);

    // Issue 105 requests against health probe routes
    for (let i = 0; i < 105; i++) {
      const response = await server.inject({ method: "GET", url: "/healthz" });
      expect(response.statusCode).toBe(200);
    }

    const readyResponse = await server.inject({ method: "GET", url: "/readyz" });
    expect(readyResponse.statusCode).toBe(200);
  });

  it("applies rate limiting per forwarded client address when behind a proxy", async () => {
    const server = await buildApp({
      checkDatabase: () => Promise.resolve(true),
      logger: false,
      trustProxy: true,
    });
    servers.push(server);

    // Register a dummy endpoint that is NOT exempt from rate limit
    server.get("/api/test-limit", () => Promise.resolve({ ok: true }));

    // Client A sends 100 requests (all 200)
    for (let i = 0; i < 100; i++) {
      const res = await server.inject({
        method: "GET",
        url: "/api/test-limit",
        headers: { "x-forwarded-for": "198.51.100.1" },
      });
      expect(res.statusCode).toBe(200);
    }

    // Client A's 101st request is rate limited (429)
    const resA101 = await server.inject({
      method: "GET",
      url: "/api/test-limit",
      headers: { "x-forwarded-for": "198.51.100.1" },
    });
    expect(resA101.statusCode).toBe(429);

    // Client B from different forwarded IP can still make requests (200)
    const resB = await server.inject({
      method: "GET",
      url: "/api/test-limit",
      headers: { "x-forwarded-for": "198.51.100.2" },
    });
    expect(resB.statusCode).toBe(200);
  });
});
