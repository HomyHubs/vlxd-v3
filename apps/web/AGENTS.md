# AGENTS.md — Web

## Bối cảnh feature

- Nhiệm vụ: React UI chạy trên browser, gọi API qua generated client.
- Phụ thuộc: `@vlxd/api-client`; mọi chuỗi hiển thị đi qua i18next.

## Contract

- Slice 0 cung cấp `SystemHealthCard` qua `src/features/health/index.ts`.
- UI gọi `GET /health`; không truy cập PostgreSQL/Supabase trực tiếp.

## Trạng thái tiến độ

### Đã xong

- [x] Vite + React + MUI bootstrap.
- [x] i18next với tiếng Việt mặc định và fallback tiếng Anh.
- [x] Nút kiểm tra hệ thống gọi generated API client.
- [x] Component test cho luồng bấm thành công.

### Đang làm dở

- [ ] Chạy typecheck, component test và production build.

### Bước tiếp theo

- [ ] Chạy demo end-to-end bằng Docker Compose.
