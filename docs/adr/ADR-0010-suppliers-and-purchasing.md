# ADR-0010: Nhà cung cấp và đơn mua hàng (Slice 10)

## Bối cảnh

Sau khi có nhập kho, bán hàng và chuyển kho, cửa hàng cần lưu nhà cung cấp và chứng từ mua hàng để lập kế hoạch nhập. Chưa có quy trình nhận hàng liên kết đơn mua nên không được tự động tăng tồn ở slice này.

## Quyết định

- Thêm `suppliers`, `purchase_orders` và `purchase_order_lines`, mọi bảng đều có `tenant_id` hoặc liên kết qua đơn mua và khóa ngoại `ON DELETE RESTRICT` cho dữ liệu nghiệp vụ.
- Mã nhà cung cấp và số đơn mua duy nhất trong tenant.
- Tạo đơn mua trong một transaction, kiểm tra nhà cung cấp, kho và sản phẩm cùng tenant; trạng thái ban đầu `ordered`.
- Mở hai capability `purchasing.view` và `purchasing.manage`.

## Hệ quả

Đơn mua là dữ liệu kế hoạch độc lập với tồn kho. Slice nhận hàng sau sẽ liên kết đơn mua và ghi stock movements.
