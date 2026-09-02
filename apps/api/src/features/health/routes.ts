import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { HealthStatusSchema, HealthUnavailableSchema, LivenessStatusSchema } from "./schema.js";
import type { HealthService } from "./service.js";

export interface HealthRoutesOptions {
  healthService: HealthService;
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = (server, options) => {
  const app = server.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/healthz",
    {
      schema: {
        response: {
          200: LivenessStatusSchema,
        },
      },
    },
    async (_request, reply) => reply.code(200).send(options.healthService.liveness()),
  );

  app.get(
    "/health",
    {
      schema: {
        response: {
          200: HealthStatusSchema,
          503: HealthUnavailableSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await options.healthService.readiness(request.log);

      if (result.status === "ok") {
        return reply.code(200).send(result);
      }

      return reply.code(503).send(result);
    },
  );

  app.get(
    "/readyz",
    {
      schema: {
        response: {
          200: HealthStatusSchema,
          503: HealthUnavailableSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await options.healthService.readiness(request.log);

      if (result.status === "ok") {
        return reply.code(200).send(result);
      }

      return reply.code(503).send(result);
    },
  );

  return Promise.resolve();
};
