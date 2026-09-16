-- migrate:up
CREATE TABLE suppliers (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  phone text,
  address text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_tenant_code_unique UNIQUE (tenant_id, code)
);
CREATE INDEX idx_suppliers_tenant_id ON suppliers(tenant_id);

INSERT INTO capabilities (id, description) VALUES
  ('purchasing.view', 'Xem nhà cung cấp và đơn mua hàng'),
  ('purchasing.manage', 'Quản lý nhà cung cấp và đơn mua hàng')
ON CONFLICT (id) DO NOTHING;
INSERT INTO role_group_capabilities (role_group_id, capability_id)
SELECT rg.id, c.id FROM role_groups rg CROSS JOIN capabilities c
WHERE rg.code IN ('admin', 'owner', 'warehouse') AND c.id IN ('purchasing.view', 'purchasing.manage')
ON CONFLICT DO NOTHING;

CREATE TABLE purchase_orders (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id text NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  warehouse_id text NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  order_number text NOT NULL,
  status text NOT NULL DEFAULT 'ordered',
  total_amount numeric(20,0) NOT NULL,
  note text,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_orders_tenant_number_unique UNIQUE (tenant_id, order_number),
  CONSTRAINT purchase_orders_total_nonnegative CHECK (total_amount >= 0)
);
CREATE INDEX idx_purchase_orders_tenant_created ON purchase_orders(tenant_id, created_at DESC);

CREATE TABLE purchase_order_lines (
  id text PRIMARY KEY,
  purchase_order_id text NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity bigint NOT NULL,
  unit_cost numeric(20,0) NOT NULL,
  line_total numeric(20,0) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_lines_quantity_positive CHECK (quantity > 0),
  CONSTRAINT purchase_order_lines_unit_cost_nonnegative CHECK (unit_cost >= 0),
  CONSTRAINT purchase_order_lines_unique_product UNIQUE (purchase_order_id, product_id)
);
CREATE INDEX idx_purchase_order_lines_order ON purchase_order_lines(purchase_order_id);

-- migrate:down
DROP TABLE purchase_order_lines;
DROP TABLE purchase_orders;
DROP TABLE suppliers;
