import type { HealthStatus, HealthUnavailable } from "@vlxd/shared";

export interface HealthLogger {
  error(obj: unknown, msg?: string): void;
  warn?(obj: unknown, msg?: string): void;
}

export interface HealthService {
  liveness(): { status: "ok" };
  readiness(logger?: HealthLogger): Promise<HealthStatus | HealthUnavailable>;
}

export interface HealthServiceDependencies {
  checkDatabase(logger?: HealthLogger): Promise<boolean>;
}

export function createHealthService(dependencies: HealthServiceDependencies): HealthService {
  return {
    liveness() {
      return { status: "ok" };
    },
    async readiness(logger?: HealthLogger) {
      const databaseReady = await dependencies.checkDatabase(logger);

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
