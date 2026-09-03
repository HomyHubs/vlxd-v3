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

-- Explicitly assign titles and role groups if RBAC tables exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'titles') THEN
    INSERT INTO titles (id, tenant_id, code, name)
    VALUES
      ('title-owner-tenant-dev-001', 'tenant-dev-001', 'OWNER', 'Chủ cửa hàng'),
      ('title-sales-tenant-dev-001', 'tenant-dev-001', 'SALES', 'Nhân viên bán hàng'),
      ('title-wh-tenant-dev-001', 'tenant-dev-001', 'WAREHOUSE', 'Thủ kho')
    ON CONFLICT (tenant_id, code) DO NOTHING;

    INSERT INTO title_role_groups (title_id, role_group_id)
    VALUES
      ('title-owner-tenant-dev-001', 'rg-admin'),
      ('title-sales-tenant-dev-001', 'rg-sales'),
      ('title-wh-tenant-dev-001', 'rg-warehouse')
    ON CONFLICT DO NOTHING;

    -- Assign owner
    INSERT INTO user_titles (user_id, title_id, tenant_id)
    VALUES ('user-dev-owner-001', 'title-owner-tenant-dev-001', 'tenant-dev-001')
    ON CONFLICT (user_id, title_id) DO NOTHING;

    -- Assign sales
    DELETE FROM user_titles WHERE user_id = 'user-dev-sales-001';
    INSERT INTO user_titles (user_id, title_id, tenant_id)
    VALUES ('user-dev-sales-001', 'title-sales-tenant-dev-001', 'tenant-dev-001')
    ON CONFLICT (user_id, title_id) DO NOTHING;
  END IF;
END $$;
