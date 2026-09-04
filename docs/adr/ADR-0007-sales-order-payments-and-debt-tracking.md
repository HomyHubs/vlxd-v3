# ADR-0007: Quản lý thanh toán và theo dõi công nợ đơn hàng (Slice 7)

## Trạng thái

Accepted

## Ngày

2026-09-04

## Bối cảnh

Slice 7 cần cơ chế ghi nhận thanh toán (tiền mặt / chuyển khoản) và theo dõi công nợ cho từng đơn hàng bán. Đây là thay đổi trực tiếp tới schema dữ liệu, API contract HTTP và phân quyền (`sales.create` được mở rộng cho thao tác ghi nhận thanh toán, `sales.view` cho thao tác tra cứu thanh toán). Thao tác liên quan tới dòng tiền đòi hỏi tính toàn vẹn cao, chống overpayment và chống ghi nhận trùng lặp khi client retry.

## Quyết định

- **Schema dữ liệu:**
  - Tạo bảng `payments` gắn trực tiếp với `tenants` (`ON DELETE CASCADE`), và `sales_orders`, `customers`, `users` với khoá ngoại `ON DELETE RESTRICT`. Ràng buộc `amount > 0` và `payment_method IN ('cash', 'bank_transfer')`.
  - Thêm cột `idempotency_key text` với partial unique index `idx_payments_tenant_idempotency ON payments(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
  - Lát cắt tối giản tập trung duy nhất vào dòng tiền và công nợ; không tạo bảng `invoices` chưa có nhu cầu sử dụng (tuân thủ nguyên tắc YAGNI và Definition of Done).
- **Quyền hạn (RBAC):**
  - Ghi nhận thanh toán (`POST /sales-orders/{id}/payments`) yêu cầu capability `sales.create`.
  - Xem danh sách và tóm tắt thanh toán (`GET /sales-orders/{id}/payments`) yêu cầu capability `sales.view`.
- **An toàn giao dịch & Race Condition:**
  - Thực hiện khoá bi quan `FOR UPDATE` trên dòng `sales_orders` trong transaction ghi nhận thanh toán để serialize mọi yêu cầu thanh toán đồng thời, ngăn chặn việc tổng thanh toán vượt quá giá trị đơn hàng (`AMOUNT_EXCEEDS_REMAINING`).
  - Hỗ trợ Idempotency: Client gửi `idempotencyKey` duy nhất cho mỗi phiên thanh toán. Nếu request được gửi lại với cùng key và payload khớp, API trả về kết quả đã ghi nhận trước đó (idempotent replay) thay vì ghi nhận lần hai. Nếu dùng cùng key nhưng sai lệch thông tin đơn hoặc số tiền, trả về HTTP 409 `IDEMPOTENCY_CONFLICT`.
- **Trạng thái thanh toán:**
  - `paymentStatus` gồm 3 giá trị: `unpaid` (chưa thanh toán), `partial` (thanh toán một phần), `paid` (đã thanh toán đủ).
  - Đơn hàng có tổng tiền bằng 0 được xác định là `paid` với số nợ còn lại là 0 và không cho phép ghi nhận thêm thanh toán (`ORDER_ALREADY_PAID`).

## Hệ quả

- Migration `202609040008_create_payment_tables.sql` hoàn toàn thuận nghịch: migrate:down thực hiện `DROP TABLE payments;`.
- Đảm bảo an toàn tài chính tuyệt đối: không có rủi ro double-record tiền khi client submit lại do mạng chập chờn.
- Phân quyền rõ ràng, tương thích ngược toàn bộ các feature đã phát hành trước đó.
