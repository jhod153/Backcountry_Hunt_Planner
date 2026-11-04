CREATE TABLE hunt_plans (
  browser_id UUID PRIMARY KEY,
  plan JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
