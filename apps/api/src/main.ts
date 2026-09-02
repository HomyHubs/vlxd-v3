import { buildApp } from "./app.js";
import { createAuthService } from "./features/auth/index.js";
import { checkDatabase, createDatabase, createDatabasePool } from "./platform/database.js";
import { parseEnvironment } from "./platform/environment.js";

const environment = parseEnvironment(process.env);
const pool = createDatabasePool(environment.DATABASE_URL);
const database = createDatabase(pool);
const authService = createAuthService({ database });

const server = await buildApp({
  authService,
  checkDatabase: (logger) => checkDatabase(database, logger),
  logLevel: environment.LOG_LEVEL,
  secureCookies: environment.COOKIE_SECURE,
});

async function shutdown(signal: string): Promise<void> {
  server.log.info({ signal }, "shutdown started");
  await server.close();
  await database.destroy();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal)
      .then(() => {
        process.exitCode = 0;
      })
      .catch((error: unknown) => {
        server.log.error({ err: error }, "shutdown failed");
        process.exitCode = 1;
      });
  });
}

try {
  await server.listen({
    host: environment.API_HOST,
    port: environment.API_PORT,
  });
} catch (error: unknown) {
  server.log.error({ err: error }, "API startup failed");
  await database.destroy();
  process.exitCode = 1;
}
