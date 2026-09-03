# Task hiện tại

**Slice 6 — Phân quyền hiển thị được (RBAC & Capabilities)** — đã hoàn thành hiện thực 100% và đang trong vòng lặp review tự động (PR #7).

- Task 6.1 — DB Migration `202609030007_create_rbac_tables.sql`: Các bảng `capabilities`, `role_groups`, `role_group_capabilities`, `titles`, `title_role_groups`, `user_titles`, seed quyền & chức danh mặc định (`OWNER`, `SALES`, `WAREHOUSE`). Test migration lifecycle và rollback testcontainer passed 100%.
- Task 6.2 — Backend API: Cập nhật `GET /auth/me` và `POST /auth/login` nạp `titles` và `capabilities` từ DB. Tạo module `users` với `UsersService`, middleware `createRequireCapability`, các endpoint `GET /titles`, `GET /users`, `POST /users` (hash argon2id, kiểm tra trùng lặp email). Unit & integration tests passed 100%.
- Task 6.3 — Frontend Web: Hook `useHasCapability`, trang `/settings/users` quản lý nhân viên và dialog thêm nhân viên, phân quyền navigation menu và ProtectedRoute theo capability `users.manage`, badge chức danh người dùng trên AppHeader, i18n vi/en, component tests passed 100%.
- Review Round 1 - Round 6:
  - Đã giải quyết đầy đủ tất cả blocking findings (B1, B2) & non-blocking suggestions (N1, N2) của Round 6:
    - B1 & N1: Tập trung hóa xử lý `BroadcastChannel` vào component `AuthProvider`. Đồng bộ chuyển trạng thái fail-closed về `null` ngay lập tức khi nhận sự kiện `AUTH_CHANGED`, unmount toàn bộ giao diện và dữ liệu được bảo vệ trước khi cuộc gọi `/auth/me` hoàn tất.
    - B2: Khóa cây component bên trong `ProtectedRoute` bằng định danh danh tính `${tenant.id}:${user.id}`, đảm bảo mọi modal, form draft và local state bị hủy hoàn toàn khi đổi tài khoản/tenant. Bổ sung kiểm tra danh tính phiên đang hoạt động (`activeSessionKey`) trong `onSuccess` của các mutation nghiệp vụ để không làm biến dạng cache của tenant mới khi mutation cũ hoàn tất muộn.
    - N2: Bổ sung guard `enabled: Boolean(tenantId)` cho các query `useUsers` và `useTitles`.
  - Bổ sung 3 unit/regression tests kiểm chứng chặt chẽ hành vi cross-tab fail-closed, form draft unmount, và in-flight mutation isolation trong `TenantCacheIsolation.test.tsx`.
- Toàn bộ cổng gác `pnpm check` (119 tests: 71 API + 48 Web) và `pnpm contracts:check` xanh 100%.
