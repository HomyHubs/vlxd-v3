# Kế hoạch triển khai Slice 10 — Nhà cung cấp và mua hàng

## Thứ tự

1. Chốt migration, shared schemas và OpenAPI; sinh client.
2. Thêm capability và service/routes nhà cung cấp.
3. Thêm service/routes đơn mua với transaction và kiểm tra tenant.
4. Thêm UI danh sách/tạo nhà cung cấp và danh sách/tạo/xem đơn mua.
5. Bổ sung test, chạy các cổng gác và cập nhật trạng thái.

## Rủi ro

- Số tiền PostgreSQL trả về dạng string: chuẩn hóa về số an toàn ở service.
- Dòng sản phẩm trùng nhau có thể làm sai tổng: reject duplicate product IDs trong request.
- Đơn mua chưa tác động tồn kho: hiển thị rõ trạng thái kế hoạch, dành nhận hàng cho slice sau.
