# AGENTS.md — API

## Bối cảnh feature

- Nhiệm vụ: Fastify HTTP API, validation, nghiệp vụ và truy cập PostgreSQL.
- Phụ thuộc: `@vlxd/shared`; DB qua Kysely; contract tại `contracts/http/openapi.yaml`.

## Contract

- Public route Slice 0: `GET /health`, `GET /healthz`, `GET /readyz`.
- Public route Slice 1: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
- Public route Slice 2: `GET /products`, `POST /products`.
- Module khác chỉ import health, auth và products qua `index.ts` của từng feature.

## Trạng thái tiến độ

### Đã xong

- [x] Fastify bootstrap với structured logging, redact và request-id.
- [x] Health route, service và Zod response schema.
- [x] Kysely health query qua bảng `app_meta`.
- [x] Auth migration `tenants`, `users`, `sessions` + dev seed 1 tenant và 1 user Chủ cửa hàng (argon2id).
- [x] Auth routes (`/auth/login`, `/auth/logout`, `/auth/me`) với opaque session cookie.
- [x] Unit test và integration test PostgreSQL thật cho auth và health.
- [x] Products service/routes scope theo tenant, phân trang/tìm kiếm, tạo sản phẩm và giới hạn gói Free.
- [x] Unit test route và integration test PostgreSQL thật cho products.

### Đang làm dở

- [ ] Hoàn tất gate và review Slice 2.

### Bước tiếp theo

- [ ] Mở PR Slice 2 vào `dev` sau khi gate xanh.
