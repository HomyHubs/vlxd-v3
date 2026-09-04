import type { FastifyPluginAsync } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import {
  SalesSummaryQuerySchema,
  SalesSummaryResponseSchema,
  TenantPlanUsageResponseSchema,
} from "@vlxd/shared";

import { createRequireCapability, type AuthService } from "../auth/index.js";
import type { ReportService } from "./service.js";

export const ReportErrorResponseSchema = z.object({
  code: z.enum(["UNAUTHORIZED", "FORBIDDEN", "AUTH_CONTEXT_CHANGED", "VALIDATION_ERROR"]),
  message: z.string(),
});

export interface ReportRoutesOptions {
  authService: AuthService;
  reportService: ReportService;
}

export const reportRoutes: FastifyPluginAsync<ReportRoutesOptions> = (server, options) => {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const requireCap = createRequireCapability(options.authService);

  // GET /reports/sales-summary (requires sales.view)
  app.get(
    "/reports/sales-summary",
    {
      preHandler: [requireCap("sales.view")],
      schema: {
        querystring: SalesSummaryQuerySchema,
        response: {
          200: SalesSummaryResponseSchema,
          401: ReportErrorResponseSchema,
          403: ReportErrorResponseSchema,
          409: ReportErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
      const summary = await options.reportService.getSalesSummary(session.tenant.id, request.query);
      return reply.code(200).send(summary);
    },
  );

  // GET /tenants/usage (requires users.manage)
  app.get(
    "/tenants/usage",
    {
      preHandler: [requireCap("users.manage")],
      schema: {
        response: {
          200: TenantPlanUsageResponseSchema,
          401: ReportErrorResponseSchema,
          403: ReportErrorResponseSchema,
          409: ReportErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = request.session!;
      const usage = await options.reportService.getPlanUsage(session.tenant.id);
      return reply.code(200).send(usage);
    },
  );

  return Promise.resolve();
};
