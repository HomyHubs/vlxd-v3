-- migrate:up
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
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_positive CHECK (amount > 0),
  CONSTRAINT payments_method_check CHECK (payment_method IN ('cash', 'bank_transfer'))
);

CREATE INDEX idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_customer_id ON payments(customer_id);
CREATE INDEX idx_payments_created_at ON payments(created_at);
CREATE UNIQUE INDEX idx_payments_tenant_idempotency ON payments(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- migrate:down
DROP TABLE payments;
