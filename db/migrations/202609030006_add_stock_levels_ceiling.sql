-- migrate:up
ALTER TABLE stock_levels
  ADD CONSTRAINT stock_levels_quantity_ceiling CHECK (quantity <= 1000000000);

-- migrate:down
ALTER TABLE stock_levels
  DROP CONSTRAINT stock_levels_quantity_ceiling;
