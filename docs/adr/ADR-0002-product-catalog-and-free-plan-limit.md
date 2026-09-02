# ADR-0002: Danh mục sản phẩm và giới hạn gói Free

## Trạng thái

Accepted

## Ngày

2026-09-02

## Bối cảnh

Slice 2 cần danh mục sản phẩm theo tenant, đơn vị chuẩn, API contract-first và giới hạn gói Free tối đa 80 sản phẩm. Đây là thay đổi đồng thời tới schema dữ liệu, contract HTTP và chính sách thương mại nên phải được ghi lại trước implementation.

## Quyết định

- `units` là danh mục dùng chung, seed tám mã ổn định: `vien`, `bao`, `tan`, `kg`, `m3`, `cay`, `tam`, `thung`.
- `products` thuộc một tenant; SKU là duy nhất trong tenant nhưng có thể trùng giữa các tenant.
- API nhận `unitCode` thay vì ID nội bộ để contract ổn định và không cần thêm endpoint đơn vị trong Slice 2.
- `GET /products` phân trang từ 1, mặc định 20, tối đa 100; tìm kiếm không phân biệt hoa thường theo SKU hoặc tên.
- Backend kiểm tra hạn mức ngay trong thao tác tạo. Tenant có `plan=free` bị chặn ở 80 sản phẩm với mã `PRODUCT_LIMIT_REACHED`; các plan khác không bị giới hạn trong Slice 2.
- Mọi endpoint sản phẩm yêu cầu opaque session hợp lệ và luôn scope theo tenant lấy từ session.

## Hệ quả

- Migration có thể rollback bằng cách drop `products` trước `units`.
- UI có thể dùng danh sách mã đơn vị tĩnh tương ứng contract; tên hiển thị vẫn đi qua i18n.
- Chính sách giới hạn được thực thi ở backend, không dựa vào UI.
- Nếu sau này cần quản trị đơn vị riêng theo tenant, phải có ADR và migration bổ sung; không đổi ý nghĩa các mã đã phát hành.
