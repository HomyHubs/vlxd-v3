# Implementation Plan: Slice 3 — Kho & tồn

## Overview

Xây nền tảng kho và số tồn theo sản phẩm × kho. Người dùng có thể tạo/xem kho và thấy tồn bằng 0 trên danh sách sản phẩm; nhập kho và thay đổi tồn để Slice 4.

## Architecture Decisions

- Dùng hai bảng `warehouses` và `stock_levels`; `stock_levels` có khóa duy nhất `(warehouse_id, product_id)`.
- Tất cả bảng và endpoint scope theo `tenant_id` lấy từ session.
- `quantity` là số nguyên không âm ở nền tảng Slice 3; chưa có stock movement.
- Giới hạn Free đi qua dependency cấu hình để không hard-code chính sách thương mại; provisional default là 3 cho tới khi được xác nhận.
- OpenAPI được sửa trước, sau đó regenerate api-client/shared contract.

## Task List

### Phase 1: Foundation

- [ ] Task 3.1: Migration `warehouses` và `stock_levels`, cập nhật Database types, seed dữ liệu dev tối thiểu nếu cần.

### Checkpoint: Foundation

- [ ] Migration up/down chạy trên PostgreSQL thật.
- [ ] Tenant/code/product uniqueness và foreign keys được kiểm thử.

### Phase 2: Core API

- [ ] Task 3.2: Chốt contract OpenAPI, sinh client/shared schemas; triển khai `GET /warehouses`, `POST /warehouses`, tenant isolation và Free-plan limit.

### Checkpoint: Core API

- [ ] Route/service unit tests pass.
- [ ] Integration test chứng minh hai tenant không đọc/ghi chéo dữ liệu.

### Phase 3: UI

- [ ] Task 3.3: Trang `/warehouses`, dialog tạo kho, i18n vi/en và cột tồn kho trên `/products`.

### Checkpoint: Complete

- [ ] Demo tạo kho và xem tồn bằng 0 qua API thật.
- [ ] `pnpm check` pass và sẵn sàng review.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Free warehouse limit chưa được chốt | Medium | Dùng dependency cấu hình, ghi rõ provisional default và xác nhận trước merge. |
| Stock level bị ghi nhầm tenant | High | Foreign keys, composite unique/index và integration test cross-tenant. |
| Scope lấn sang nhập kho | Medium | Không tạo movement; quantity chỉ khởi tạo 0, Slice 4 mới thay đổi tồn. |

## Open Questions

- Xác nhận giới hạn kho Free là 3 hay giá trị khác trước khi chốt API behavior.
