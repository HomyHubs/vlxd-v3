# Task hiện tại

**Slice 6 — Phân quyền hiển thị được (RBAC & Capabilities)** — đã hoàn thành hiện thực 100% và đang trong vòng lặp review tự động (PR #7).

- Task 6.1 — DB Migration `202609030007_create_rbac_tables.sql`: Các bảng `capabilities`, `role_groups`, `role_group_capabilities`, `titles`, `title_role_groups`, `user_titles`, seed quyền & chức danh mặc định (`OWNER`, `SALES`, `WAREHOUSE`). Test migration lifecycle và rollback testcontainer passed 100%.
- Task 6.2 — Backend API: Cập nhật `GET /auth/me` và `POST /auth/login` nạp `titles` và `capabilities` từ DB. Tạo module `users` với `UsersService`, middleware `createRequireCapability`, các endpoint `GET /titles`, `GET /users`, `POST /users` (hash argon2id, kiểm tra trùng lặp email). Unit & integration tests passed 100%.
- Task 6.3 — Frontend Web: Hook `useHasCapability`, trang `/settings/users` quản lý nhân viên và dialog thêm nhân viên, phân quyền navigation menu và ProtectedRoute theo capability `users.manage`, badge chức danh người dùng trên AppHeader, i18n vi/en, component tests passed 100%.
- Review Round 7:
  - Đã giải quyết đầy đủ blocking finding B1 và non-blocking suggestion N1:
    - B1: Bổ sung ràng buộc danh tính trực tiếp trong `mutationFn` của toàn bộ mutation hooks nghiệp vụ (`useCreateSalesOrder`, `useCreateStockReceipt`, `useCreateProduct`, `useCreateWarehouse`, `useCreateCustomer`, `useCreateUser`). Nếu danh tính phiên thay đổi trong thời gian request đang bay, mutation lập tức reject với lỗi `AUTH_CONTEXT_CHANGED`, ngăn Promise resolve và ngăn continuation sau `await mutateAsync()` (như `navigate()`) thực thi sai tenant. Đồng thời, tại các trang tạo đơn bán hàng và tạo phiếu nhập kho, bổ sung guard kiểm tra session key trước khi gọi `navigate()` và bỏ qua lỗi `AUTH_CONTEXT_CHANGED`.
    - N1: Xuất `getCurrentSessionKey` và `resetTenantTracker` qua public entry point `apps/web/src/features/auth/index.ts`, chuyển toàn bộ import từ các hook và trang nghiệp vụ tuân thủ quy ước barrel export.
    - Bổ sung 2 regression test tích hợp cho `CreateSalesOrderPage` và `CreateStockReceiptPage` chứng minh in-flight mutation bị reject và không điều hướng URL hay làm ô nhiễm phiên giao diện của Tenant B.
- Toàn bộ cổng gác `pnpm check` (121 tests: 71 API + 50 Web) và `pnpm contracts:check` xanh 100%.
