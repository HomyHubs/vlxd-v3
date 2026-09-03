# Task hiện tại

**Slice 4 — Nhập kho (Inbound Stock Receipts)** — đã hoàn thành toàn bộ các task 4.1, 4.2, 4.3, 4.4 và toàn bộ cổng gác `pnpm check` xanh (cập nhật 2026-09-02).

- Slice 4 triển khai đầy đủ:
  - 4.1: Migration `stock_receipts`, `stock_receipt_lines`, `stock_movements` kèm rollback test.
  - 4.2: Endpoints `POST /stock-receipts`, `GET /stock-receipts`, `GET /stock-receipts/{id}` với giao dịch nguyên tử cập nhật tồn kho và ghi nhật ký biến động kho (`stock_movements`).
  - 4.3: Trang tạo phiếu nhập kho `/inventory/receipts/new` với chọn kho, chọn sản phẩm, nhập số lượng, tính tổng tức thì.
  - 4.4: Trang danh sách `/inventory/receipts` và chi tiết `/inventory/receipts/:id`, đa ngôn ngữ (`vi` & `en`), component tests.
- Cổng gác tất định: `pnpm check` PASS 100% (format, lint, typecheck, test, build, contracts:lint, contracts:check).
