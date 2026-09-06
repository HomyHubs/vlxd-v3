# ADR-0009: Chuyển kho nội bộ (Slice 9 — Internal Stock Transfers)

## Trạng thái

Accepted

## Ngày

2026-09-04

## Bối cảnh

Trong ngành kinh doanh vật liệu xây dựng (VLXD), một cửa hàng thường sở hữu nhiều bãi/kho lưu trữ hàng hóa khác nhau (ví dụ: Kho chính chứa sơn, gạch ốp lát, thiết bị vệ sinh; Bãi vật liệu thô chứa cát, đá, sắt thép, xi măng). 

Hệ thống đã hỗ trợ quản lý nhiều kho (Slice 3), nhập kho từ nhà cung cấp (Slice 4) và xuất kho bán hàng (Slice 5). Tuy nhiên, hiện tại chưa có cơ chế điều chuyển hàng hóa giữa các kho nội bộ của cùng một cửa hàng. Khi cần chuyển cát từ bãi tập kết về bãi phụ gần công trình hoặc điều chuyển gạch men giữa các chi nhánh, thủ kho phải có công cụ ghi nhận chính xác và cập nhật tồn kho tức thời.

## Quyết định

1. **Mô hình dữ liệu (Data Modeling):**
   - Tạo bảng `stock_transfers` lưu trữ thông tin phiếu chuyển: `id`, `tenant_id`, `transfer_number` (mã duy nhất theo tenant, tiền tố `TRF-`), `source_warehouse_id` (kho xuất), `destination_warehouse_id` (kho nhập), `created_by`, `note`, `created_at`.
   - Tạo bảng `stock_transfer_lines` lưu trữ chi tiết sản phẩm chuyển: `id`, `transfer_id`, `product_id`, `quantity` (kiểu `bigint`, `> 0`). Ràng buộc duy nhất `UNIQUE (transfer_id, product_id)`.
   - Ràng buộc dữ liệu mức cơ sở dữ liệu: `source_warehouse_id != destination_warehouse_id`.

2. **Giao dịch điều chuyển nguyên tử (Atomic Inventory Movement):**
   - Thao tác chuyển kho được thực thi trong một Database Transaction duy nhất (`Serializable` hoặc `Repeatable Read` với deterministic locking).
   - Kiểm tra tồn kho tại kho xuất: Khóa dòng tồn kho `stock_levels` của các sản phẩm tại kho xuất theo thứ tự ID xác định (`ORDER BY product_id ASC`) để tránh deadlock khi có nhiều giao dịch chuyển kho đồng thời.
   - Nếu tồn kho khả dụng tại kho xuất nhỏ hơn số lượng yêu cầu chuyển, giao dịch bị hủy và trả về lỗi 422 `INSUFFICIENT_STOCK`.
   - Ghi 2 dòng chuyển động vào bảng `stock_movements`:
     - 1 dòng `movement_type = 'transfer_out'`, `quantity = -X` gắn với `source_warehouse_id`.
     - 1 dòng `movement_type = 'transfer_in'`, `quantity = +X` gắn với `destination_warehouse_id`.
   - Cập nhật tồn kho `stock_levels`: Trừ số lượng ở kho xuất, tăng số lượng ở kho nhập (sử dụng UPSERT an toàn nếu kho nhập chưa từng lưu bản ghi tồn của sản phẩm đó).

3. **Phân quyền và Bảo mật (RBAC & Multi-tenancy):**
   - Quyền tạo phiếu chuyển kho (`POST /stock-transfers`): Bắt buộc capability `inventory.manage` (dành cho Quản trị viên `OWNER` và Thủ kho `WAREHOUSE`).
   - Quyền tra cứu phiếu chuyển kho (`GET /stock-transfers`, `GET /stock-transfers/{id}`): Yêu cầu capability `inventory.view`.
   - Mọi truy vấn và thay đổi dữ liệu đều cô lập theo `tenant_id`. Kho xuất và kho nhập bắt buộc phải thuộc cùng `tenant_id` của người dùng hiện tại.

4. **Giao diện & Trải nghiệm người dùng:**
   - Trang danh sách phiếu chuyển `/inventory/transfers` hiển thị danh sách phiếu chuyển, bộ lọc và tìm kiếm.
   - Trang tạo phiếu `/inventory/transfers/new` cho phép chọn kho xuất, kho nhập (tự động loại trừ kho xuất khỏi danh sách kho nhập), kiểm tra tồn kho tức thời tại kho xuất và chặn nhập quá số tồn trước khi submit.
   - Trang chi tiết `/inventory/transfers/:id` hiển thị thông tin đầy đủ về phiếu chuyển và các mặt hàng.
   - Toàn bộ chuỗi hiển thị được bản địa hóa qua `i18next` (tiếng Việt `vi` và tiếng Anh `en`).

## Hệ quả

- Đảm bảo tính nhất quán tuyệt đối của sổ kho: Tổng tồn kho toàn hệ thống không thay đổi, chỉ luân chuyển giữa các kho.
- Kiểm soát chặt chẽ lịch sử luân chuyển qua `stock_movements`.
- Đáp ứng trọn vẹn quy trình vận hành kho thực tế của các đại lý, cửa hàng VLXD.
