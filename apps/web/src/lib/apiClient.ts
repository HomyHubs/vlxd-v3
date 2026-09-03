import { createApiClient } from "@vlxd/api-client";
import { getCurrentSessionContext } from "../features/auth/api/sessionContext.js";

export const apiClient = createApiClient("/api", async (input, init) => {
  const context = getCurrentSessionContext();
  const headers = new Headers(init?.headers);
  if (context) {
    if (!headers.has("x-expected-tenant-id")) {
      headers.set("x-expected-tenant-id", context.tenantId);
    }
    if (!headers.has("x-session-context")) {
      headers.set("x-session-context", context.sessionKey);
    }
  }
  return fetch(input, { ...init, headers });
});
