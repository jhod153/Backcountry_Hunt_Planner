CREATE TABLE hunt_saved_products (
  id UUID PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('food', 'gear')),
  product JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX hunt_saved_products_owner ON hunt_saved_products(owner_hash, created_at, id);
