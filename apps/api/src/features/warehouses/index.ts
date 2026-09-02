export { warehouseRoutes, type WarehouseRoutesOptions } from "./routes.js";
export {
  createWarehouseService,
  type CreateWarehouseResult,
  type WarehouseService,
  type WarehouseServiceDependencies,
} from "./service.js";
export {
  CreateWarehouseRequestSchema,
  WarehouseErrorResponseSchema,
  WarehouseListResponseSchema,
  WarehouseSchema,
  type CreateWarehouseRequest,
  type Warehouse,
  type WarehouseErrorResponse,
  type WarehouseListResponse,
} from "@vlxd/shared";
