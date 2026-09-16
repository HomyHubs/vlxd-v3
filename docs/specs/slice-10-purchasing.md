# Đặc tả Slice 10 — Nhà cung cấp và mua hàng

## Mục tiêu

Chủ cửa hàng và nhân viên có quyền mua hàng cần lưu danh bạ nhà cung cấp và tạo đơn mua hàng để theo dõi kế hoạch nhập. Đơn mua là chứng từ mua hàng; việc cập nhật tồn kho chỉ xảy ra ở nghiệp vụ nhận hàng trong slice sau.

## Phạm vi

- Nhà cung cấp: danh sách và tạo mới, cô lập theo tenant, mã nhà cung cấp duy nhất trong tenant.
- Đơn mua: tạo, danh sách phân trang, xem chi tiết; gồm nhà cung cấp, kho dự kiến, các dòng sản phẩm, số lượng, đơn giá và tổng tiền.
- Trạng thái đơn mua khi tạo là `ordered`; chưa có nhận một phần, hủy, thanh toán hoặc cập nhật tồn.
- RBAC: `purchasing.view` cho đọc, `purchasing.manage` cho tạo.

## Hợp đồng

- `GET /suppliers`, `POST /suppliers`.
- `POST /purchase-orders`, `GET /purchase-orders`, `GET /purchase-orders/{id}`.
- Payload dùng số nguyên an toàn cho số lượng và tiền; mọi input được validate bằng Zod/OpenAPI.

## Kiểm thử và cổng gác

- Unit/integration tests cho tenant isolation, mã trùng, dữ liệu không hợp lệ, RBAC và tạo đơn mua nguyên tử.
- Chạy `pnpm check` và `pnpm contracts:check`.

## Ngoài phạm vi

Trả hàng, công nợ khách hàng nâng cao, thanh toán nhà cung cấp, nhận hàng liên kết đơn mua và tính giá vốn.
