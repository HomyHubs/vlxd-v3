# Spec: Slice 3 — Kho & tồn hiển thị

## Objective

Cho phép chủ cửa hàng tạo và xem các kho thuộc tenant của mình, đồng thời xem tồn kho theo sản phẩm × kho. Slice này chỉ dựng nền tảng và hiển thị tồn ban đầu bằng 0; nghiệp vụ làm tồn biến động thuộc Slice 4.

## Tech Stack

- Backend: Fastify, Zod, Kysely, PostgreSQL, dbmate.
- Frontend: React, Vite, MUI, TanStack Query, i18next.
- API: OpenAPI contract-first, regenerate `packages/api-client`.

## Commands

- Quality gate: `pnpm check`
- Focused API tests: `pnpm --filter @vlxd/api test:run`
- Dev: `pnpm dev`

## Project Structure

- `db/migrations/`: reversible `warehouses` và `stock_levels` migration.
- `packages/shared/src/`: shared Zod schemas and types.
- `contracts/http/openapi.yaml`: public warehouse and stock contracts.
- `apps/api/src/features/warehouses/`: warehouse service, routes, tests, public barrel.
- `apps/web/src/features/warehouses/`: warehouse page, API hook, UI tests.
- `apps/web/src/features/products/`: product list stock column.

## Code Style

Giữ module tự chứa và import qua `index.ts`. Route chỉ xác thực session, parse contract và gọi service; tenant id luôn lấy từ session đã xác thực.

```ts
const session = await authService.getMe(token, request.log);
if (!session) return reply.code(401).send(unauthorized);
return reply.send(await warehouseService.list(session.tenant.id));
```

## Testing Strategy

- Migration integration test trên PostgreSQL thật, gồm rollback.
- Service/route unit tests cho tenant isolation, validation, duplicate code và warehouse limit.
- Integration test cho GET/POST warehouse và stock level mặc định bằng 0.
- Component test cho trang `/warehouses`, dialog tạo kho và cột tồn trên `/products`.
- Chạy `pnpm check` trước commit và trên CI.

## Boundaries

- Always: validate input bằng Zod; scope mọi truy vấn theo tenant; migration append-only và rollback được; i18n vi/en.
- Ask first: thay đổi giới hạn gói; thêm dependency; thay đổi capability hoặc mô hình dữ liệu ngoài `warehouse`/`stock_level`.
- Never: tạo movement trong Slice 3; sửa code generated trực tiếp; commit secret; tin tenant id từ request body/query.

## Success Criteria

- Tenant chỉ thấy và tạo được kho của mình qua `GET /warehouses` và `POST /warehouses`.
- Mã kho unique trong tenant; payload lỗi có error code ổn định.
- Gói Free bị chặn khi vượt giới hạn kho đã chốt; các gói khác không bị giới hạn trong slice này.
- `/warehouses` gọi API thật và tạo kho thành công; UI có thông báo vi/en.
- `/products` hiển thị tồn theo từng kho, tồn mới tạo bằng 0.
- Migration và contract drift checks pass; `pnpm check` pass.

## Open Questions

- Giới hạn kho của gói Free chưa có trong tài liệu hiện tại. Tạm dùng cấu hình `freePlanLimit` (provisional default 3) và cần xác nhận trước khi chốt hành vi thương mại.
