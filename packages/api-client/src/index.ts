import createClient from "openapi-fetch";

import type { paths } from "./generated/schema.js";

export type { paths } from "./generated/schema.js";

export function createApiClient(baseUrl = "") {
  return createClient<paths>({ baseUrl });
}
