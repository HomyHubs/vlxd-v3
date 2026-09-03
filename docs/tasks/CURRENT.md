# Task hiện tại

**Slice 5 — Bán hàng: đơn hàng đầu tiên (Sales Orders & Stock Deductions)** — đã hoàn thành 100% và đã squash-merge vào nhánh `dev` tại commit `af65166` (PR #6, cập nhật 2026-09-03).

- Slice 5 hoàn tất toàn bộ các Task 5.1 (DB migration & rollback test), 5.2 (OpenAPI 3.1 contract, Fastify API, atomic stock deduction, 38 unit + 9 integration tests), 5.3 (UI Tạo đơn hàng `/orders/new`), và 5.4 (UI Danh sách & Chi tiết `/orders`, `/orders/:id`, i18n, component tests).
- Review loop nghiêm ngặt qua 6 rounds độc lập với ChatGPT Web qua Chrome DevTools MCP đạt `APPROVED_TO_MERGE`.
- Đã squash-merge vào `dev` và toàn bộ cổng gác CI GitHub Actions cũng như `pnpm check` cục bộ đều xanh 100%.

