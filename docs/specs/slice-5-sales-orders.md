# Đặc tả Slice 5: Bán hàng và xuất kho (Sales Orders & Stock Deductions)

## 1. Mục tiêu và phạm vi
- Cho phép chủ cửa hàng/nhân viên bán hàng tạo đơn hàng xuất bán vật liệu xây dựng.
- Tự động kiểm tra và trừ tồn kho tương ứng tại kho được chọn qua giao dịch nguyên tử.
- Chặn bán vượt quá số lượng tồn kho với error code `INSUFFICIENT_STOCK`.
- Ghi nhận nhật ký biến động kho `stock_movements` (với `type = 'sales_issue'`, `quantity = -line.quantity`).

## 2. Mô hình dữ liệu
- Bảng `customers`:
  - `id text PRIMARY KEY`
  - `tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
  - `code text NOT NULL` (ví dụ: `KH-LE`)
  - `name text NOT NULL` (ví dụ: `Khách lẻ`)
  - `phone text`
  - `address text`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `updated_at timestamptz NOT NULL DEFAULT now()`
  - Ràng buộc: `UNIQUE (tenant_id, code)`
- Bảng `sales_orders`:
  - `id text PRIMARY KEY`
  - `tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
  - `order_number text NOT NULL` (ví dụ: `DH-20260903-XXXX`)
  - `customer_id text NOT NULL REFERENCES customers(id) ON DELETE RESTRICT`
  - `warehouse_id text NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT`
  - `status text NOT NULL DEFAULT 'confirmed'`
  - `total_amount bigint NOT NULL CHECK (total_amount >= 0)`
  - `note text`
  - `created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `updated_at timestamptz NOT NULL DEFAULT now()`
  - Ràng buộc: `UNIQUE (tenant_id, order_number)`
- Bảng `sales_order_lines`:
  - `id text PRIMARY KEY`
  - `order_id text NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE`
  - `product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT`
  - `quantity integer NOT NULL CHECK (quantity > 0)`
  - `unit_price bigint NOT NULL CHECK (unit_price >= 0)`
  - `line_total bigint NOT NULL CHECK (line_total >= 0)`
  - `created_at timestamptz NOT NULL DEFAULT now()`

## 3. Endpoints API
- `GET /customers`: Danh sách khách hàng của tenant.
- `POST /customers`: Tạo khách hàng mới.
- `POST /sales-orders`: Tạo đơn hàng bán.
  - Transaction nguyên tử: kiểm tra khách hàng, kho xuất, sản phẩm, và số lượng tồn.
  - Nếu `current_stock < requested_quantity` -> trả về HTTP 422 `{ code: "INSUFFICIENT_STOCK", message: "..." }`.
  - Giảm `stock_levels.quantity` tương ứng.
  - Ghi bản ghi `stock_movements` (với `quantity = -line.quantity`, `type = 'sales_issue'`).
  - Ghi `sales_orders` và `sales_order_lines`.
- `GET /sales-orders`: Danh sách đơn hàng bán (hỗ trợ phân trang, lọc theo khách hàng / kho).
- `GET /sales-orders/{id}`: Chi tiết đơn hàng và từng mặt hàng.

## 4. Giao diện Web
- `/orders/new`: Tạo đơn bán hàng (chọn khách hàng, kho xuất hàng, thêm mặt hàng, nhập đơn giá & số lượng, tự động tính thành tiền và tổng tiền VND).
- `/orders`: Danh sách các đơn hàng đã tạo kèm tổng tiền và trạng thái.
- `/orders/:id`: Chi tiết đơn hàng.

## 5. Tiêu chuẩn nghiệm thu
- Có test kiểm tra migration up/down và các check constraints.
- Có unit test cho route và service bán hàng.
- Có integration test trên PostgreSQL thật xác minh việc trừ tồn kho chính xác và chặn bán vượt tồn.
- Có component test cho giao diện tạo đơn và xem chi tiết.
- Toàn bộ cổng gác `pnpm check` và `pnpm contracts:check` đều đạt màu xanh.
