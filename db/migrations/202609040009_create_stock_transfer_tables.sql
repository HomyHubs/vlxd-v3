-- migrate:up
CREATE TABLE stock_transfers (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transfer_number text NOT NULL,
  source_warehouse_id text NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  destination_warehouse_id text NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'completed',
  note text,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_transfers_tenant_number_unique UNIQUE (tenant_id, transfer_number),
  CONSTRAINT stock_transfers_distinct_warehouses CHECK (source_warehouse_id <> destination_warehouse_id)
);

CREATE INDEX idx_stock_transfers_tenant_id ON stock_transfers(tenant_id);
CREATE INDEX idx_stock_transfers_source_wh ON stock_transfers(source_warehouse_id);
CREATE INDEX idx_stock_transfers_dest_wh ON stock_transfers(destination_warehouse_id);
CREATE INDEX idx_stock_transfers_created_at ON stock_transfers(tenant_id, created_at DESC);

CREATE TABLE stock_transfer_lines (
  id text PRIMARY KEY,
  transfer_id text NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_transfer_lines_quantity_positive CHECK (quantity > 0),
  CONSTRAINT stock_transfer_lines_transfer_product_unique UNIQUE (transfer_id, product_id)
);

CREATE INDEX idx_stock_transfer_lines_transfer_id ON stock_transfer_lines(transfer_id);
CREATE INDEX idx_stock_transfer_lines_product_id ON stock_transfer_lines(product_id);

-- migrate:down
DROP TABLE stock_transfer_lines;
DROP TABLE stock_transfers;
