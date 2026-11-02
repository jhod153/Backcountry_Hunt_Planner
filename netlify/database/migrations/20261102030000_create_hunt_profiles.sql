CREATE TABLE IF NOT EXISTS hunt_profiles (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  name text NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hunt_profiles_user_id_idx ON hunt_profiles(user_id);
