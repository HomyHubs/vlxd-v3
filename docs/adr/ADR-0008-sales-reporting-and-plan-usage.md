# ADR-0008: Báo cáo bán hàng đầu tiên và theo dõi hạn mức sử dụng gói (Slice 8)

## Trạng thái

Accepted

## Ngày

2026-09-04

## Bối cảnh

Sau khi hoàn thành quản lý đơn hàng bán (Slice 5) và thanh toán công nợ (Slice 7), hệ thống đã có đầy đủ dữ liệu thực tế về doanh số, dòng tiền và công nợ. Tuy nhiên, chủ cửa hàng và nhân viên chưa có màn hình tổng hợp để nắm bắt tình hình kinh doanh, cũng như theo dõi hạn mức tài nguyên đã sử dụng của gói dịch vụ (`plan: 'free'`) so với trần cho phép (80 sản phẩm, 3 kho bãi).

## Quyết định

1. **Tổng hợp dữ liệu báo cáo (Reporting Aggregations):**
   - Không tạo thêm bảng dữ liệu chuyên biệt cho báo cáo trong lát cắt này (tuân thủ nguyên tắc YAGNI).
   - Tận dụng các bảng sẵn có (`sales_orders`, `sales_order_lines`, `payments`, `products`, `units`) để truy vấn tổng hợp trực tiếp bằng Kysely SQL aggregates (`SUM`, `COUNT`, `GROUP BY`) với điều kiện bắt buộc `tenant_id = ?` để đảm bảo cách ly dữ liệu đa khách thuê tuyệt đối.
   - Endpoint `GET /reports/sales-summary` hỗ trợ lọc theo kỳ (`day`, `week`, `month`, `all`), trả về:
     - Thống kê tài chính: `totalRevenue`, `totalPaid`, `totalDebt`, `orderCount`, `paidOrderCount`, `partialOrderCount`, `unpaidOrderCount`.
     - Chuỗi doanh thu theo mốc thời gian (`chartData`: `date`, `revenue`, `orderCount`).
     - Top 5 sản phẩm bán chạy nhất (`topProducts`: SKU, tên sản phẩm, đơn vị tính, số lượng bán, doanh thu mang lại).

2. **Theo dõi gói cước và mức sử dụng (Tenant Plan & Quota Usage):**
   - Endpoint `GET /tenants/usage` cung cấp thông tin hạn mức và lượng tài nguyên đang sử dụng của tenant:
     - Hạn mức gói Free: tối đa 80 sản phẩm, tối đa 3 kho hàng.
     - Lượng sử dụng thực tế: số sản phẩm, số kho, số đơn hàng, số tài khoản người dùng đã tạo.
   - Cung cấp giao diện trực quan với thanh tiến trình (`LinearProgress`) và trạng thái cảnh báo khi tiến gần hoặc đạt trần giới hạn.

3. **Phân quyền truy cập (RBAC):**
   - `GET /reports/sales-summary`: yêu cầu capability `sales.view` (cho phép cả Chủ cửa hàng `OWNER` và Nhân viên bán hàng `SALES` theo dõi doanh số).
   - `GET /tenants/usage`: yêu cầu capability `users.manage` (chỉ dành cho Chủ cửa hàng / Quản trị viên để quản lý gói dịch vụ và cài đặt hệ thống).

4. **API Contract & Giao diện:**
   - Tuân thủ contract-first: định nghĩa đầy đủ schemas trong `contracts/http/openapi.yaml`, sinh client type-safe tự động.
   - Frontend hiển thị thân thiện, responsive, hỗ trợ song ngữ tiếng Việt & tiếng Anh (i18n).

## Hệ quả

- Khép kín hành trình nghiệp vụ từ nhập kho -> bán hàng -> thu tiền -> xem báo cáo quản trị.
- Không phát sinh chi phí bảo trì bảng phụ hay rủi ro lệch dữ liệu tổng hợp (do tính toán trực tiếp từ dữ liệu nguồn).
- Phân quyền chặt chẽ, bảo mật tuyệt đối giữa các tenant.
