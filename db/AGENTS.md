# AGENTS.md — Database

## Bối cảnh feature

- Nhiệm vụ: sở hữu migration, seed và kiểm thử tích hợp PostgreSQL.
- Phụ thuộc: API truy cập qua Kysely; không có module nào sửa schema trực tiếp.

## Contract

- Migration là append-only sau khi merge và phải reversible.
- Slice 0 cung cấp bảng `app_meta` để health check chứng minh truy vấn DB thật.
- Slice 2 cung cấp `units`, `products`; SKU duy nhất trong tenant và tám mã đơn vị chuẩn.

## Trạng thái tiến độ

### Đã xong

- [x] Khởi tạo migration reversible tạo bảng `app_meta`.
- [x] Viết integration test áp dụng migration, truy vấn health và rollback bằng PostgreSQL container thật.
- [x] Migration thuận nghịch `units`/`products`, seed đơn vị chuẩn và integration test rollback PostgreSQL 18.

### Đang làm dở

- [ ] Hoàn tất gate và review Slice 2.

### Bước tiếp theo

- [ ] Mở PR Slice 2 vào `dev` sau khi gate xanh.
