import { createApiClient } from "@vlxd/api-client";
import { getCurrentSessionContext } from "../features/auth/api/sessionContext.js";

export const apiClient = createApiClient("/api");

apiClient.use({
  onRequest({ request }) {
    const context = getCurrentSessionContext();
    if (context) {
      if (!request.headers.has("x-expected-tenant-id")) {
        request.headers.set("x-expected-tenant-id", context.tenantId);
      }
      if (!request.headers.has("x-session-context")) {
        request.headers.set("x-session-context", context.sessionKey);
      }
    }
    return request;
  },
});
