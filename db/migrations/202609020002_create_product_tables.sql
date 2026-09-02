-- migrate:up
CREATE TABLE units (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id text NOT NULL REFERENCES units(id),
  sku text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_tenant_sku_unique UNIQUE (tenant_id, sku)
);

CREATE INDEX idx_products_tenant_id ON products(tenant_id);
CREATE INDEX idx_products_tenant_name ON products(tenant_id, name);

INSERT INTO units (id, code, name) VALUES
  ('unit-vien', 'vien', 'Viên'),
  ('unit-bao', 'bao', 'Bao'),
  ('unit-tan', 'tan', 'Tấn'),
  ('unit-kg', 'kg', 'Kilôgam'),
  ('unit-m3', 'm3', 'Mét khối'),
  ('unit-cay', 'cay', 'Cây'),
  ('unit-tam', 'tam', 'Tấm'),
  ('unit-thung', 'thung', 'Thùng');

-- migrate:down
DROP TABLE products;
DROP TABLE units;
