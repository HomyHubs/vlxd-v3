-- migrate:up
CREATE TABLE stock_receipts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  warehouse_id text NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  receipt_number text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  note text,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_receipts_tenant_number_unique UNIQUE (tenant_id, receipt_number)
);

CREATE INDEX idx_stock_receipts_tenant_id ON stock_receipts(tenant_id);
CREATE INDEX idx_stock_receipts_warehouse_id ON stock_receipts(warehouse_id);

CREATE TABLE stock_receipt_lines (
  id text PRIMARY KEY,
  stock_receipt_id text NOT NULL REFERENCES stock_receipts(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_receipt_lines_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX idx_stock_receipt_lines_receipt_id ON stock_receipt_lines(stock_receipt_id);
CREATE INDEX idx_stock_receipt_lines_product_id ON stock_receipt_lines(product_id);

CREATE TABLE stock_movements (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  warehouse_id text NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL,
  type text NOT NULL,
  reference_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_movements_quantity_nonzero CHECK (quantity <> 0)
);

CREATE INDEX idx_stock_movements_tenant_warehouse ON stock_movements(tenant_id, warehouse_id);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_reference ON stock_movements(reference_id);

-- migrate:down
DROP TABLE stock_movements;
DROP TABLE stock_receipt_lines;
DROP TABLE stock_receipts;
