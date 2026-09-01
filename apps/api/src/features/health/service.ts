import type { HealthStatus, HealthUnavailable } from "@vlxd/shared";

export interface HealthService {
  liveness(): { status: "ok" };
  readiness(): Promise<HealthStatus | HealthUnavailable>;
}

export interface HealthServiceDependencies {
  checkDatabase(): Promise<boolean>;
}

export function createHealthService(dependencies: HealthServiceDependencies): HealthService {
  return {
    liveness() {
      return { status: "ok" };
    },
    async readiness() {
      const databaseReady = await dependencies.checkDatabase();

      if (!databaseReady) {
        return {
          status: "unavailable",
          db: "unavailable",
          code: "DATABASE_UNAVAILABLE",
        };
      }

      return {
        status: "ok",
        db: "ok",
      };
    },
  };
}
