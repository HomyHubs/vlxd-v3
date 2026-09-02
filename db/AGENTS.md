# AGENTS.md — Database

## Bối cảnh feature

- Nhiệm vụ: sở hữu migration, seed và kiểm thử tích hợp PostgreSQL.
- Phụ thuộc: API truy cập qua Kysely; không có module nào sửa schema trực tiếp.

## Contract

- Migration là append-only sau khi merge và phải reversible.
- Slice 0 cung cấp bảng `app_meta` để health check chứng minh truy vấn DB thật.

## Trạng thái tiến độ

### Đã xong

- [x] Khởi tạo migration reversible tạo bảng `app_meta`.
- [x] Viết integration test áp dụng migration, truy vấn health và rollback bằng PostgreSQL container thật.

### Đang làm dở

- [ ] Chạy migration, integration test và rollback trên PostgreSQL 18.

### Bước tiếp theo

- [ ] Chạy cổng kiểm tra sau khi Andy MCP cho phép lệnh test.
