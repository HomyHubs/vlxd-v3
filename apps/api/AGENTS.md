# AGENTS.md — API

## Bối cảnh feature

- Nhiệm vụ: Fastify HTTP API, validation, nghiệp vụ và truy cập PostgreSQL.
- Phụ thuộc: `@vlxd/shared`; DB qua Kysely; contract tại `contracts/http/openapi.yaml`.

## Contract

- Public route Slice 0: `GET /health`, `GET /healthz`, `GET /readyz`.
- Module khác chỉ import health qua `src/features/health/index.ts`.

## Trạng thái tiến độ

### Đã xong

- [x] Fastify bootstrap với structured logging, redact và request-id.
- [x] Health route, service và Zod response schema.
- [x] Kysely health query qua bảng `app_meta`.
- [x] Unit test route và integration test PostgreSQL thật.

### Đang làm dở

- [ ] Chạy typecheck, unit test và Testcontainers suite.

### Bước tiếp theo

- [ ] Kết nối UI Slice 0 qua generated API client.
