-- migrate:up
CREATE TABLE capabilities (
  id text PRIMARY KEY,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_groups (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_group_capabilities (
  role_group_id text NOT NULL REFERENCES role_groups(id) ON DELETE CASCADE,
  capability_id text NOT NULL REFERENCES capabilities(id) ON DELETE CASCADE,
  PRIMARY KEY (role_group_id, capability_id)
);

CREATE TABLE titles (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT titles_tenant_code_unique UNIQUE (tenant_id, code)
);

CREATE INDEX idx_titles_tenant_id ON titles(tenant_id);

CREATE TABLE title_role_groups (
  title_id text NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  role_group_id text NOT NULL REFERENCES role_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (title_id, role_group_id)
);

CREATE TABLE user_titles (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id text NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, title_id)
);

CREATE INDEX idx_user_titles_user_id ON user_titles(user_id);
CREATE INDEX idx_user_titles_title_id ON user_titles(title_id);
CREATE INDEX idx_user_titles_tenant_id ON user_titles(tenant_id);
CREATE INDEX idx_title_role_groups_role_group_id ON title_role_groups(role_group_id);
CREATE INDEX idx_role_group_capabilities_cap_id ON role_group_capabilities(capability_id);

-- Seed standard capabilities
INSERT INTO capabilities (id, description) VALUES
  ('products.view', 'Xem danh mục sản phẩm'),
  ('products.manage', 'Tạo và chỉnh sửa sản phẩm'),
  ('inventory.view', 'Xem kho và số lượng tồn kho'),
  ('inventory.manage', 'Tạo kho và quản lý nhập kho'),
  ('sales.view', 'Xem danh sách đơn hàng'),
  ('sales.create', 'Tạo đơn hàng xuất bán'),
  ('customers.manage', 'Quản lý danh sách khách hàng'),
  ('users.manage', 'Quản lý nhân viên và phân quyền')
ON CONFLICT (id) DO NOTHING;

-- Seed standard role groups
INSERT INTO role_groups (id, code, name) VALUES
  ('rg-admin', 'admin', 'Quản trị viên'),
  ('rg-sales', 'sales', 'Nhân viên bán hàng'),
  ('rg-warehouse', 'warehouse', 'Thủ kho')
ON CONFLICT (id) DO NOTHING;

-- Map capabilities to role groups
INSERT INTO role_group_capabilities (role_group_id, capability_id) VALUES
  ('rg-admin', 'products.view'),
  ('rg-admin', 'products.manage'),
  ('rg-admin', 'inventory.view'),
  ('rg-admin', 'inventory.manage'),
  ('rg-admin', 'sales.view'),
  ('rg-admin', 'sales.create'),
  ('rg-admin', 'customers.manage'),
  ('rg-admin', 'users.manage'),
  ('rg-sales', 'products.view'),
  ('rg-sales', 'inventory.view'),
  ('rg-sales', 'sales.view'),
  ('rg-sales', 'sales.create'),
  ('rg-sales', 'customers.manage'),
  ('rg-warehouse', 'products.view'),
  ('rg-warehouse', 'inventory.view'),
  ('rg-warehouse', 'inventory.manage')
ON CONFLICT DO NOTHING;

-- Seed default titles for existing tenants
INSERT INTO titles (id, tenant_id, code, name)
SELECT 'title-owner-' || id, id, 'OWNER', 'Chủ cửa hàng' FROM tenants
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO titles (id, tenant_id, code, name)
SELECT 'title-sales-' || id, id, 'SALES', 'Nhân viên bán hàng' FROM tenants
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO titles (id, tenant_id, code, name)
SELECT 'title-wh-' || id, id, 'WAREHOUSE', 'Thủ kho' FROM tenants
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Map titles to role groups
INSERT INTO title_role_groups (title_id, role_group_id)
SELECT 'title-owner-' || id, 'rg-admin' FROM tenants
ON CONFLICT DO NOTHING;

INSERT INTO title_role_groups (title_id, role_group_id)
SELECT 'title-sales-' || id, 'rg-sales' FROM tenants
ON CONFLICT DO NOTHING;

INSERT INTO title_role_groups (title_id, role_group_id)
SELECT 'title-wh-' || id, 'rg-warehouse' FROM tenants
ON CONFLICT DO NOTHING;

-- Deterministically backfill OWNER title for all pre-existing users without an assigned title
INSERT INTO user_titles (user_id, title_id, tenant_id)
SELECT u.id, t.id, u.tenant_id
FROM users u
JOIN titles t ON t.tenant_id = u.tenant_id AND t.code = 'OWNER'
WHERE NOT EXISTS (
  SELECT 1 FROM user_titles ut WHERE ut.user_id = u.id
)
ON CONFLICT (user_id, title_id) DO NOTHING;

-- migrate:down
-- Prevent privilege escalation on rollback:
-- Deactivate users with non-OWNER titles (e.g. SALES, WAREHOUSE) created under RBAC
-- so they cannot authenticate and gain unrestricted legacy access if rolled back.
UPDATE users
SET status = 'inactive'
WHERE id IN (
  SELECT ut.user_id
  FROM user_titles ut
  JOIN titles t ON ut.title_id = t.id
  WHERE t.code != 'OWNER'
);

DELETE FROM sessions
WHERE user_id IN (
  SELECT ut.user_id
  FROM user_titles ut
  JOIN titles t ON ut.title_id = t.id
  WHERE t.code != 'OWNER'
);

DROP TABLE user_titles;
DROP TABLE title_role_groups;
DROP TABLE titles;
DROP TABLE role_group_capabilities;
DROP TABLE role_groups;
DROP TABLE capabilities;
