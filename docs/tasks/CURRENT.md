# Task hiện tại

**Slice 6 — Phân quyền hiển thị được (RBAC & Capabilities)** — đã hoàn thành hiện thực 100% và chuẩn bị mở PR review.

- Task 6.1 — DB Migration `202609030007_create_rbac_tables.sql`: Các bảng `capabilities`, `role_groups`, `role_group_capabilities`, `titles`, `title_role_groups`, `user_titles`, seed quyền & chức danh mặc định (`OWNER`, `SALES`, `WAREHOUSE`). Test migration lifecycle và rollback testcontainer passed 100%.
- Task 6.2 — Backend API: Cập nhật `GET /auth/me` và `POST /auth/login` nạp `titles` và `capabilities` từ DB. Tạo module `users` với `UsersService`, middleware `createRequireCapability`, các endpoint `GET /titles`, `GET /users`, `POST /users` (hash argon2id, kiểm tra trùng lặp email). Unit & integration tests passed 100%.
- Task 6.3 — Frontend Web: Hook `useHasCapability`, trang `/settings/users` quản lý nhân viên và dialog thêm nhân viên, phân quyền navigation menu và ProtectedRoute theo capability `users.manage`, badge chức danh người dùng trên AppHeader, i18n vi/en, component tests passed 100%.
- Toàn bộ cổng gác `pnpm check` và `pnpm contracts:check` xanh 100%.


