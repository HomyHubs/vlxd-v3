# Slice 5 — Task Checklist

- [x] 5.1 — Migration `customers`, `sales_orders`, `sales_order_lines`, DB types và rollback test.
  - Acceptance: schema reversible; ràng buộc tenant, customer, warehouse, product, non-negative amounts, positive quantity; Kysely Database interface cập nhật; seed khách lẻ `KH-LE`.
  - Verify: PostgreSQL integration test và migration rollback.
  - Files: `db/migrations/202609030005_create_sales_order_tables.sql`, `apps/api/src/platform/database.ts`, `apps/api/src/platform/sales_order_database.integration.test.ts`.
- [x] 5.2 — Contract/API `POST /sales-orders`, `GET /sales-orders`, `GET /sales-orders/{id}`, `GET /customers`, `POST /customers` và atomic stock deduction.
  - Acceptance: auth + tenant isolation; transaction an toàn: kiểm tra tồn kho -> giảm `stock_levels` -> ghi `stock_movements` (quantity âm, type sales_issue) -> ghi `sales_orders` + `sales_order_lines`. Nếu thiếu tồn kho trả về `INSUFFICIENT_STOCK`.
  - Verify: API unit/integration tests, `pnpm contracts:check`.
  - Files: `contracts/http/openapi.yaml`, `packages/shared/`, `packages/api-client/`, `apps/api/src/features/sales-orders/`, `apps/api/src/features/customers/`.
- [x] 5.3 — UI Tạo đơn hàng mới (`/orders/new`).
  - Acceptance: chọn khách hàng (mặc định khách lẻ), chọn kho xuất hàng, thêm sản phẩm, đơn giá & số lượng; tính thành tiền và tổng tiền VND trực tiếp; nút Đặt hàng gọi API và hiển thị thông báo lỗi nếu hết hàng; vi/en đầy đủ.
  - Verify: component tests, manual check.
  - Files: `apps/web/src/features/sales-orders/pages/CreateSalesOrderPage.tsx`, locales.
- [x] 5.4 — UI Danh sách đơn hàng & Chi tiết đơn (`/orders` & `/orders/:id`).
  - Acceptance: xem danh sách các đơn hàng đã tạo; xem chi tiết các mặt hàng của đơn hàng; tích hợp menu điều hướng `App.tsx`.
  - Verify: component tests, `pnpm check`.
  - Files: `apps/web/src/features/sales-orders/pages/SalesOrderListPage.tsx`, `SalesOrderDetailPage.tsx`, navigation/header, locales.

## Dependency order

`5.1 → 5.2 → 5.3 → 5.4`; không triển khai song song phần migration và API contract.

Implementation status (2026-09-03): Slice 5 hoàn tất 100%. Toàn bộ cổng gác pass.
