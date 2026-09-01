export {
  authRoutes,
  type AuthRoutesOptions,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "./routes.js";
export {
  createAuthService,
  type AuthLogger,
  type AuthService,
  type AuthServiceDependencies,
  type LoginResult,
} from "./service.js";
export {
  AuthErrorResponseSchema,
  AuthLogoutResponseSchema,
  AuthSessionResponseSchema,
  AuthTenantSchema,
  AuthUserSchema,
  LoginRequestSchema,
  type AuthErrorResponse,
  type AuthLogoutResponse,
  type AuthSessionResponse,
  type AuthTenant,
  type AuthUser,
  type LoginRequest,
} from "./schema.js";
