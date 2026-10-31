-- The warehouse split into independently versioned parts (see src/lib/parts.ts).
-- Rows are created from the old `warehouses` document on first read.
CREATE TABLE warehouse_parts (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  part       TEXT NOT NULL,
  data       TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, part)
);
