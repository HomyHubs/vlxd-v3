# AGENTS.md — Web

## Bối cảnh feature

- Nhiệm vụ: React UI chạy trên browser, gọi API qua generated client.
- Phụ thuộc: `@vlxd/api-client`, `@vlxd/shared`; mọi chuỗi hiển thị đi qua i18next.

## Contract

- Slice 0 cung cấp `SystemHealthCard` qua `src/features/health/index.ts`.
- Slice 1 cung cấp `LoginPage`, `ProtectedRoute`, `AppHeader`, `useCurrentUser`, `useLogin`, `useLogout` qua `src/features/auth/index.ts`.
- Slice 2 cung cấp `ProductsPage`, `useProducts`, `useCreateProduct` qua `src/features/products/index.ts`.
- UI gọi API qua generated client; không truy cập PostgreSQL/Supabase trực tiếp.

## Trạng thái tiến độ

### Đã xong

- [x] Vite + React + MUI bootstrap.
- [x] i18next với tiếng Việt mặc định và fallback tiếng Anh.
- [x] Nút kiểm tra hệ thống gọi generated API client.
- [x] Trang `/login` với react-hook-form + Zod resolver.
- [x] Route guard `ProtectedRoute` và component `AppHeader` hiển thị thông tin user.
- [x] Component tests cho health, login, header và route guard.
- [x] Trang `/products`, bảng Material React Table, tìm kiếm và dialog tạo sản phẩm có i18n vi/en.
- [x] Component test cho luồng mở dialog tạo sản phẩm.

### Đang làm dở

- [ ] Hoàn tất gate và review Slice 2.

### Bước tiếp theo

- [ ] Mở PR Slice 2 vào `dev` sau khi gate xanh.
