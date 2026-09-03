-- Seed 1 tenant and 1 user Chủ cửa hàng for development environment
INSERT INTO tenants (id, name, code, plan)
VALUES ('tenant-dev-001', 'Cửa hàng VLXD Homy', 'vlxd-homy', 'free')
ON CONFLICT (id) DO NOTHING;

-- Password: MatKhau@123 (hashed using argon2id, never plaintext)
INSERT INTO users (id, tenant_id, email, full_name, password_hash, status)
VALUES (
  'user-dev-owner-001',
  'tenant-dev-001',
  'owner@vlxd.local',
  'Chủ cửa hàng',
  '$argon2id$v=19$m=19456,t=2,p=1$TF/Gq3MDiKu+CAakUXQTzg$nkkaARFQ71qeLTUBWxoTPrpphqZyreNkI4e9rms5BIQ',
  'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, tenant_id, email, full_name, password_hash, status)
VALUES (
  'user-dev-sales-001',
  'tenant-dev-001',
  'sales@vlxd.local',
  'Nguyễn Văn Bán',
  '$argon2id$v=19$m=19456,t=2,p=1$TF/Gq3MDiKu+CAakUXQTzg$nkkaARFQ71qeLTUBWxoTPrpphqZyreNkI4e9rms5BIQ',
  'active'
)
ON CONFLICT (id) DO NOTHING;

-- Explicitly assign dev sales user to SALES title if user_titles table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_titles') THEN
    DELETE FROM user_titles WHERE user_id = 'user-dev-sales-001';
    INSERT INTO user_titles (user_id, title_id, tenant_id)
    SELECT 'user-dev-sales-001', id, tenant_id
    FROM titles
    WHERE tenant_id = 'tenant-dev-001' AND code = 'SALES'
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
