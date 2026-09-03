# Spec: Slice 4 — Nhập kho (Inbound Stock Receipts)

## Objective

Cho phép người dùng tạo phiếu nhập kho để nhập số lượng sản phẩm vào một kho cụ thể. Việc tạo phiếu nhập kho thực hiện nguyên tử qua database transaction: lưu phiếu nhập (`stock_receipts`), lưu các dòng sản phẩm (`stock_receipt_lines`), ghi nhật ký biến động kho (`stock_movements`) và cập nhật số tồn kho thực tế (`stock_levels`). Người dùng có thể xem lại danh sách phiếu và chi tiết từng phiếu.

## Tech Stack

- Backend: Fastify, Zod, Kysely, PostgreSQL, dbmate.
- Frontend: React, Vite, MUI, TanStack Query, i18next, react-hook-form.
- API: OpenAPI contract-first, regenerate `packages/api-client`.

## Commands

- Quality gate: `pnpm check`
- Focused API tests: `pnpm --filter @vlxd/api test:run`
- Dev: `pnpm dev`

## Project Structure

- `db/migrations/`: reversible migration cho `stock_receipts`, `stock_receipt_lines`, `stock_movements`.
- `packages/shared/src/stockReceipt.ts`: shared Zod schemas and types.
- `contracts/http/openapi.yaml`: public stock receipt contracts.
- `apps/api/src/features/stock-receipts/`: stock receipt service, routes, tests, public barrel.
- `apps/web/src/features/inventory/`: pages (`CreateStockReceiptPage`, `StockReceiptListPage`, `StockReceiptDetailPage`), API hooks, UI tests.

## Code Style

Giữ module tự chứa và import qua `index.ts`. Route chỉ xác thực session, parse contract và gọi service; tenant id luôn lấy từ session đã xác thực.

```ts
const session = await authService.getMe(token, request.log);
if (!session) return reply.code(401).send(unauthorized);
return reply.status(201).send(await stockReceiptService.create(session.tenant.id, session.user.id, request.body));
```

## Testing Strategy

- Migration integration test trên PostgreSQL thật, gồm rollback.
- Service/route unit tests cho tenant isolation, validation, kho/sản phẩm không thuộc tenant.
- Integration test cho transaction tạo phiếu nhập kho và xác nhận `stock_levels` tăng tương ứng.
- Component test cho trang danh sách phiếu nhập, trang tạo phiếu nhập và trang chi tiết phiếu.
- Chạy `pnpm check` trước commit và trên CI.

## Boundaries

- Always: validate input bằng Zod; scope mọi truy vấn theo tenant; migration append-only và rollback được; i18n vi/en.
- Ask first: thay đổi giới hạn gói; thêm dependency; thay đổi logic kế toán hoặc đơn giá ngoài phạm vi stub.
- Never: cho phép số lượng âm; sửa code generated trực tiếp; commit secret; tin tenant id từ request body/query.

## Success Criteria

- Tạo phiếu nhập kho thành công qua `POST /stock-receipts` làm tăng `stock_levels` của các sản phẩm tương ứng trong kho.
- Xem danh sách và chi tiết phiếu nhập qua `GET /stock-receipts` và `GET /stock-receipts/{id}`.
- Không thể nhập kho với kho hoặc sản phẩm không thuộc cùng tenant.
- Giao diện có i18n vi/en đầy đủ, component tests pass.
- `pnpm check` pass 100%.

## Open Questions / Stubs cho phép

- Chưa tính giá vốn / đơn giá bình quân (sẽ làm ở các slice tài chính / mua hàng).
- Chưa gắn nhà cung cấp (NCC).
- Phiếu nhập ở trạng thái hoàn thành ngay, chưa có tính năng hủy phiếu.
