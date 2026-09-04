-- migrate:up
CREATE TABLE invoices (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id text NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
  invoice_number text NOT NULL,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  total_amount bigint NOT NULL,
  status text NOT NULL DEFAULT 'issued',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_tenant_number_unique UNIQUE (tenant_id, invoice_number),
  CONSTRAINT invoices_total_amount_nonnegative CHECK (total_amount >= 0),
  CONSTRAINT invoices_status_check CHECK (status IN ('issued', 'paid', 'cancelled'))
);

CREATE INDEX idx_invoices_tenant_id ON invoices(tenant_id);
CREATE INDEX idx_invoices_order_id ON invoices(order_id);
CREATE INDEX idx_invoices_customer_id ON invoices(customer_id);

CREATE TABLE payments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id text NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
  customer_id text NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  amount bigint NOT NULL,
  payment_method text NOT NULL,
  reference_code text,
  note text,
  created_by text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_positive CHECK (amount > 0),
  CONSTRAINT payments_method_check CHECK (payment_method IN ('cash', 'bank_transfer'))
);

CREATE INDEX idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_customer_id ON payments(customer_id);
CREATE INDEX idx_payments_created_at ON payments(created_at);

-- migrate:down
DROP TABLE payments;
DROP TABLE invoices;
