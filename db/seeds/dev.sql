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
