-- migrate:up
CREATE TABLE warehouses (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouses_tenant_code_unique UNIQUE (tenant_id, code)
);

CREATE INDEX idx_warehouses_tenant_id ON warehouses(tenant_id);

CREATE TABLE stock_levels (
  warehouse_id text NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id, product_id),
  CONSTRAINT stock_levels_quantity_nonnegative CHECK (quantity >= 0)
);

CREATE INDEX idx_stock_levels_product_id ON stock_levels(product_id);

-- migrate:down
DROP TABLE stock_levels;
DROP TABLE warehouses;
