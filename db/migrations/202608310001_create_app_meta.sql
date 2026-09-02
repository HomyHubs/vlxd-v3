-- migrate:up
CREATE TABLE app_meta (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_meta (key, value)
VALUES ('schema_version', 'slice-0');

-- migrate:down
DROP TABLE app_meta;
