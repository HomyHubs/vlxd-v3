import createClient from "openapi-fetch";

import type { paths } from "./generated/schema.js";

export type { paths } from "./generated/schema.js";

function resolveBaseUrl(baseUrl: string): string {
  if (baseUrl.startsWith("http://") || baseUrl.startsWith("https://")) {
    return baseUrl;
  }
  if (
    typeof window !== "undefined" &&
    window.location &&
    window.location.origin &&
    window.location.origin !== "null" &&
    window.location.href !== "about:blank"
  ) {
    return `${window.location.origin}${baseUrl}`;
  }
  return `http://localhost${baseUrl.startsWith("/") ? "" : "/"}${baseUrl}`;
}

export function createApiClient(baseUrl = "", customFetch?: typeof fetch) {
  return createClient<paths>({
    baseUrl: resolveBaseUrl(baseUrl),
    fetch: customFetch ?? ((...args) => globalThis.fetch(...args)),
  });
}
