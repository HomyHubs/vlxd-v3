-- migrate:up
CREATE TABLE customers (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  phone text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_tenant_code_unique UNIQUE (tenant_id, code)
);

CREATE INDEX idx_customers_tenant_id ON customers(tenant_id);

CREATE TABLE sales_orders (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  warehouse_id text NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'confirmed',
  total_amount bigint NOT NULL,
  note text,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_orders_tenant_number_unique UNIQUE (tenant_id, order_number),
  CONSTRAINT sales_orders_total_amount_nonnegative CHECK (total_amount >= 0)
);

CREATE INDEX idx_sales_orders_tenant_id ON sales_orders(tenant_id);
CREATE INDEX idx_sales_orders_customer_id ON sales_orders(customer_id);
CREATE INDEX idx_sales_orders_warehouse_id ON sales_orders(warehouse_id);

CREATE TABLE sales_order_lines (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL,
  unit_price bigint NOT NULL,
  line_total bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_order_lines_quantity_positive CHECK (quantity > 0),
  CONSTRAINT sales_order_lines_unit_price_nonnegative CHECK (unit_price >= 0),
  CONSTRAINT sales_order_lines_line_total_nonnegative CHECK (line_total >= 0)
);

CREATE INDEX idx_sales_order_lines_order_id ON sales_order_lines(order_id);
CREATE INDEX idx_sales_order_lines_product_id ON sales_order_lines(product_id);

-- Seed default retail customer for existing tenants
INSERT INTO customers (id, tenant_id, code, name, phone, address)
SELECT
  'cust-retail-' || id,
  id,
  'KH-LE',
  'Khách lẻ',
  NULL,
  'Tại cửa hàng'
FROM tenants
ON CONFLICT (tenant_id, code) DO NOTHING;

-- migrate:down
DROP TABLE sales_order_lines;
DROP TABLE sales_orders;
DROP TABLE customers;
