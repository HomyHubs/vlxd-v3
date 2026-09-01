# AGENTS.md — API

## Bối cảnh feature

- Nhiệm vụ: Fastify HTTP API, validation, nghiệp vụ và truy cập PostgreSQL.
- Phụ thuộc: `@vlxd/shared`; DB qua Kysely; contract tại `contracts/http/openapi.yaml`.

## Contract

- Public route Slice 0: `GET /health`, `GET /healthz`, `GET /readyz`.
- Public route Slice 1: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
- Module khác chỉ import health qua `src/features/health/index.ts` và auth qua `src/features/auth/index.ts`.

## Trạng thái tiến độ

### Đã xong

- [x] Fastify bootstrap với structured logging, redact và request-id.
- [x] Health route, service và Zod response schema.
- [x] Kysely health query qua bảng `app_meta`.
- [x] Auth migration `tenants`, `users`, `sessions` + dev seed 1 tenant và 1 user Chủ cửa hàng (argon2id).
- [x] Auth routes (`/auth/login`, `/auth/logout`, `/auth/me`) với opaque session cookie.
- [x] Unit test và integration test PostgreSQL thật cho auth và health.

### Đang làm dở

- [ ] Hoàn tất Slice 1, chuẩn bị cho Slice 2.

### Bước tiếp theo

- [ ] Hiện thực Slice 2 — Sản phẩm (xem và tạo).
