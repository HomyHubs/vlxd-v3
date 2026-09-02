# Task hiện tại

**Slice 2 — Sản phẩm: xem và tạo** — đang làm, chưa mở PR (cập nhật 2026-09-02).

- Mô tả phạm vi:
  - Task 2.1: migration bảng `product`, `unit` và seed danh mục đơn vị chuẩn.
  - Task 2.2: API contract-first `GET /products` (phân trang, tìm kiếm) và `POST /products`.
  - Task 2.3: trang `/products` dùng Material React Table và Dialog "Thêm sản phẩm" dùng react-hook-form + Zod.
  - Task 2.4: giới hạn gói Free tối đa 80 sản phẩm; trả lỗi `PRODUCT_LIMIT_REACHED` và hiển thị i18n rõ ràng trên UI.
- Nhánh làm việc: `feature/slice-2`.
- Đã làm trong phiên gần nhất: chốt phạm vi Slice 2 và tạo scaffold tài liệu AI workflow.
- Đang làm dở / còn thiếu: chưa triển khai Task 2.1–2.4.
- Cổng gác đã chạy: chưa chạy cho phần triển khai Slice 2.

## Bước tiếp theo

- Bắt đầu Task 2.1 trên nhánh `feature/slice-2`: migration thuận nghịch bảng `product`, `unit` và dev seed đơn vị chuẩn.
- Hoàn thiện Slice 2, chạy cổng gác mục 4 `AGENTS.md` (`pnpm check` và `pnpm contracts:check`), PASS mới commit.
- Mở PR nhỏ, **base = `dev`**.
- Sau khi merge: cập nhật `docs/tasks/MVP-BACKLOG.md` (Slice 2 → Xong + số PR), cập nhật mục "Trạng thái tiến độ" trong `AGENTS.md`, và trỏ `CURRENT.md` sang Slice 3.
