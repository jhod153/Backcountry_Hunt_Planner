CREATE TABLE hunt_profiles (
 id UUID PRIMARY KEY,
 user_id TEXT NOT NULL,
 name TEXT NOT NULL,
 profile JSONB NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX hunt_profiles_user_id ON hunt_profiles(user_id);
