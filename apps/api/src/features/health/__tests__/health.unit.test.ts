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
});
