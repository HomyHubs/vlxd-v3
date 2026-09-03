# Slice 4 — Task Checklist

- [x] 4.1 — Migration `stock_receipts`, `stock_receipt_lines`, `stock_movements`, DB types và rollback test.
  - Acceptance: schema reversible; ràng buộc tenant, warehouse, product và quantity hợp lệ; Kysely Database interface cập nhật.
  - Verify: PostgreSQL integration test và migration rollback.
  - Files: `db/migrations/202609020004_create_stock_receipt_tables.sql`, `apps/api/src/platform/database.ts`, `apps/api/src/platform/stock_receipt_database.integration.test.ts`.
- [x] 4.2 — Contract/API `POST /stock-receipts`, `GET /stock-receipts`, `GET /stock-receipts/{id}` và atomic stock updates.
  - Acceptance: auth + tenant isolation; transaction an toàn: ghi receipt + receipt lines + movements + upsert stock levels; OpenAPI/client/shared đồng bộ.
  - Verify: API unit/integration tests, `pnpm contracts:check`.
  - Files: `contracts/http/openapi.yaml`, `packages/shared/src/stockReceipt.ts`, `packages/api-client/src/generated/schema.ts`, `apps/api/src/features/stock-receipts/`.
- [x] 4.3 — UI Tạo phiếu nhập kho (`/inventory/receipts/new`).
  - Acceptance: chọn kho, chọn sản phẩm, nhập số lượng; submit form tạo phiếu thành công; tồn kho tăng thật; vi/en đầy đủ.
  - Verify: component tests, manual browser check với API thật.
  - Files: `apps/web/src/features/inventory/`, `apps/web/src/features/inventory/pages/CreateStockReceiptPage.tsx`, locales.
- [x] 4.4 — UI Danh sách phiếu nhập & Chi tiết phiếu (`/inventory/receipts` & `/inventory/receipts/:id`).
  - Acceptance: xem danh sách các phiếu nhập đã tạo; xem chi tiết các dòng sản phẩm của phiếu nhập; tích hợp menu điều hướng.
  - Verify: component tests, `pnpm check`.
  - Files: `apps/web/src/features/inventory/pages/`, navigation/header, locales.

## Dependency order

`4.1 → 4.2 → 4.3 → 4.4`; không triển khai song song phần migration và API contract.

Implementation status (2026-09-02): All tasks 4.1, 4.2, 4.3, 4.4 completed. All gates pass.
