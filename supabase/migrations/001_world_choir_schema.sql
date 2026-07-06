-- World Choir — shared participant identity & global voice numbering

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_device_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_counters (
  event_id TEXT PRIMARY KEY,
  last_voice_number INT NOT NULL DEFAULT 0 CHECK (last_voice_number >= 0)
);

CREATE TABLE IF NOT EXISTS pledges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  voice_number INT NOT NULL CHECK (voice_number > 0),
  voice_name TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  pledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pledges_user_event_unique UNIQUE (user_id, event_id),
  CONSTRAINT pledges_event_voice_unique UNIQUE (event_id, voice_number)
);

CREATE INDEX IF NOT EXISTS pledges_event_id_idx ON pledges (event_id);

-- Atomic join: one global voice number per new participant
CREATE OR REPLACE FUNCTION join_world_choir(
  p_device_id TEXT,
  p_event_id TEXT,
  p_city TEXT,
  p_country TEXT,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL
)
RETURNS pledges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_existing pledges%ROWTYPE;
  v_next INT;
  v_pledge pledges%ROWTYPE;
BEGIN
  IF p_device_id IS NULL OR length(trim(p_device_id)) = 0 THEN
    RAISE EXCEPTION 'device_id required';
  END IF;
  IF p_event_id IS NULL OR length(trim(p_event_id)) = 0 THEN
    RAISE EXCEPTION 'event_id required';
  END IF;
  IF p_city IS NULL OR length(trim(p_city)) = 0 THEN
    RAISE EXCEPTION 'city required';
  END IF;
  IF p_country IS NULL OR length(trim(p_country)) = 0 THEN
    RAISE EXCEPTION 'country required';
  END IF;

  INSERT INTO users (anonymous_device_id)
  VALUES (trim(p_device_id))
  ON CONFLICT (anonymous_device_id) DO NOTHING;

  SELECT id INTO v_user_id
  FROM users
  WHERE anonymous_device_id = trim(p_device_id);

  SELECT * INTO v_existing
  FROM pledges
  WHERE user_id = v_user_id AND event_id = p_event_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  INSERT INTO event_counters (event_id, last_voice_number)
  VALUES (p_event_id, 0)
  ON CONFLICT (event_id) DO NOTHING;

  UPDATE event_counters
  SET last_voice_number = last_voice_number + 1
  WHERE event_id = p_event_id
  RETURNING last_voice_number INTO v_next;

  INSERT INTO pledges (
    user_id, event_id, voice_number, voice_name,
    city, country, latitude, longitude
  )
  VALUES (
    v_user_id, p_event_id, v_next, 'Voice ' || v_next,
    trim(p_city), trim(p_country), p_latitude, p_longitude
  )
  RETURNING * INTO v_pledge;

  RETURN v_pledge;
END;
$$;

-- Update location only — voice number never changes
CREATE OR REPLACE FUNCTION update_pledge_location(
  p_device_id TEXT,
  p_event_id TEXT,
  p_city TEXT,
  p_country TEXT,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL
)
RETURNS pledges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_pledge pledges%ROWTYPE;
BEGIN
  SELECT id INTO v_user_id
  FROM users
  WHERE anonymous_device_id = trim(p_device_id);

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  UPDATE pledges
  SET
    city = trim(p_city),
    country = trim(p_country),
    latitude = p_latitude,
    longitude = p_longitude,
    updated_at = now()
  WHERE user_id = v_user_id AND event_id = p_event_id
  RETURNING * INTO v_pledge;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pledge not found';
  END IF;

  RETURN v_pledge;
END;
$$;

CREATE OR REPLACE FUNCTION ensure_user(p_device_id TEXT)
RETURNS users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user users%ROWTYPE;
BEGIN
  INSERT INTO users (anonymous_device_id)
  VALUES (trim(p_device_id))
  ON CONFLICT (anonymous_device_id) DO NOTHING;

  SELECT * INTO v_user FROM users WHERE anonymous_device_id = trim(p_device_id);
  RETURN v_user;
END;
$$;

GRANT EXECUTE ON FUNCTION join_world_choir TO service_role;
GRANT EXECUTE ON FUNCTION update_pledge_location TO service_role;
GRANT EXECUTE ON FUNCTION ensure_user TO service_role;

ALTER TABLE pledges ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY pledges_read_all ON pledges FOR SELECT USING (true);
CREATE POLICY users_read_own ON users FOR SELECT USING (true);
