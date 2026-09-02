import { useQuery } from "@tanstack/react-query";

import { apiClient } from "../../../lib/apiClient.js";

async function fetchHealth() {
  const { data, error } = await apiClient.GET("/health");

  if (error) {
    if ("code" in error && error.code === "DATABASE_UNAVAILABLE") {
      throw new Error("DATABASE_UNAVAILABLE");
    }

    throw new Error("HEALTH_CHECK_FAILED");
  }

  if (!data) {
    throw new Error("HEALTH_CHECK_FAILED");
  }

  return data;
}

export function useHealthCheck() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    enabled: false,
    retry: false,
  });
}
