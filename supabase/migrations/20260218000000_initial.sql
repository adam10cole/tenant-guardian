-- ============================================================
-- Tenant Guardian — Initial Schema Migration
-- 2026-02-18
--
-- Security foundation: PostGIS, ENUMs, tables, RLS policies,
-- immutable photo_hash trigger, anonymized heatmap view,
-- and pg_cron scheduled refresh.
-- ============================================================

-- -------------------------------------------------------
-- Extensions
-- -------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- -------------------------------------------------------
-- Custom ENUM types
-- -------------------------------------------------------

CREATE TYPE issue_category AS ENUM (
  'water',        -- water damage, leaks, plumbing
  'heat',         -- heating / cooling failures
  'pests',        -- rodents, cockroaches, bed bugs
  'mold',         -- mold or mildew
  'structural',   -- cracks, foundation, ceilings
  'electrical',   -- wiring, outlets, fixtures
  'security',     -- broken locks, doors, windows
  'sanitation',   -- trash, sewage, cleanliness
  'other'
);

CREATE TYPE issue_status AS ENUM (
  'open',               -- reported but no action taken
  'landlord_notified',  -- tenant has sent formal notice
  'in_repair',          -- landlord acknowledged / repair scheduled
  'resolved',           -- issue fixed and confirmed by tenant
  'escalated'           -- referred to code enforcement / legal aid
);

CREATE TYPE comm_direction AS ENUM (
  'sent',     -- tenant → landlord
  'received'  -- landlord → tenant
);

CREATE TYPE comm_method AS ENUM (
  'email',
  'text',
  'call',
  'letter',
  'in_person'
);

CREATE TYPE sync_status AS ENUM (
  'pending_insert',
  'pending_update',
  'synced'
);

-- -------------------------------------------------------
-- profiles — extends auth.users
-- -------------------------------------------------------
CREATE TABLE profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name     TEXT,
  expo_push_token  TEXT,
  jurisdiction     TEXT NOT NULL DEFAULT 'MI-GENERAL',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on user sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, jurisdiction)
  VALUES (NEW.id, 'MI-GENERAL')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- -------------------------------------------------------
-- buildings — PostGIS geometry, not raw lat/lng
-- -------------------------------------------------------
CREATE TABLE buildings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city          TEXT,
  state         CHAR(2),
  zip           CHAR(5),
  geom          GEOMETRY(POINT, 4326) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GIST spatial index — required for PostGIS queries to be fast
CREATE INDEX buildings_geom_idx ON buildings USING GIST (geom);

-- -------------------------------------------------------
-- issues — core entity
-- -------------------------------------------------------
CREATE TABLE issues (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  building_id           UUID REFERENCES buildings(id),
  category              issue_category NOT NULL,
  status                issue_status NOT NULL DEFAULT 'open',
  description           TEXT,
  first_reported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  landlord_notified_at  TIMESTAMPTZ,
  legal_deadline_days   INTEGER,
  legal_deadline_at     TIMESTAMPTZ,  -- computed: landlord_notified_at + legal_deadline_days * interval '1 day'
  local_id              TEXT UNIQUE,  -- device-generated UUID for offline sync
  client_updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recompute legal_deadline_at whenever landlord_notified_at or legal_deadline_days changes
CREATE OR REPLACE FUNCTION compute_legal_deadline()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.landlord_notified_at IS NOT NULL AND NEW.legal_deadline_days IS NOT NULL THEN
    NEW.legal_deadline_at := NEW.landlord_notified_at + (NEW.legal_deadline_days || ' days')::INTERVAL;
  ELSE
    NEW.legal_deadline_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_legal_deadline
  BEFORE INSERT OR UPDATE OF landlord_notified_at, legal_deadline_days ON issues
  FOR EACH ROW EXECUTE FUNCTION compute_legal_deadline();

-- -------------------------------------------------------
-- photos — evidence photos with tamper-evident metadata
-- -------------------------------------------------------
CREATE TABLE photos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id         UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id),
  storage_path     TEXT NOT NULL,        -- path in Supabase Storage evidence-photos bucket
  watermarked_path TEXT,                 -- path to watermarked copy
  taken_at         TIMESTAMPTZ NOT NULL, -- device clock at capture (not server time)
  latitude         DOUBLE PRECISION,
  longitude        DOUBLE PRECISION,
  photo_hash       TEXT NOT NULL,        -- SHA-256 of raw bytes; immutable after insert
  local_id         TEXT UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutable photo_hash: once set, it cannot be changed
CREATE OR REPLACE FUNCTION prevent_photo_hash_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.photo_hash IS DISTINCT FROM NEW.photo_hash THEN
    RAISE EXCEPTION 'photo_hash is immutable after insert. Attempted to change from % to %',
      OLD.photo_hash, NEW.photo_hash;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER immutable_photo_hash
  BEFORE UPDATE ON photos
  FOR EACH ROW EXECUTE FUNCTION prevent_photo_hash_update();

-- -------------------------------------------------------
-- communications — tenant logs landlord interactions
-- -------------------------------------------------------
CREATE TABLE communications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id    UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  direction   comm_direction NOT NULL,
  method      comm_method NOT NULL,
  summary     TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  local_id    TEXT UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- Row Level Security
-- -------------------------------------------------------

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- buildings (publicly readable; only authenticated users insert)
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read buildings"
  ON buildings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert buildings"
  ON buildings FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- issues
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own issues"
  ON issues FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- photos
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own photos"
  ON photos FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- communications
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own communications"
  ON communications FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -------------------------------------------------------
-- Storage buckets (created via Supabase CLI / dashboard;
-- RLS enforced by path prefix matching user UUID)
-- -------------------------------------------------------

-- The following are reference comments for bucket configuration.
-- Run these via supabase storage policies in the dashboard or CLI:
--
-- Bucket: evidence-photos (private)
--   INSERT policy: (storage.foldername(name))[1] = auth.uid()::text
--   SELECT policy: (storage.foldername(name))[1] = auth.uid()::text
--
-- Bucket: exported-pdfs (private)
--   INSERT policy: service role only (Edge Function)
--   SELECT policy: (storage.foldername(name))[1] = auth.uid()::text

-- -------------------------------------------------------
-- Anonymized heatmap (materialized view with k-anonymity)
-- -------------------------------------------------------

-- ~500m grid snapping (0.005 degrees ≈ 500m at mid-latitudes)
CREATE MATERIALIZED VIEW heatmap_grid AS
  SELECT
    ST_SnapToGrid(b.geom, 0.005)           AS cell_center,
    ST_X(ST_SnapToGrid(b.geom, 0.005))     AS lng,
    ST_Y(ST_SnapToGrid(b.geom, 0.005))     AS lat,
    i.category,
    COUNT(*)                               AS report_count
  FROM issues i
  JOIN buildings b ON i.building_id = b.id
  WHERE i.status != 'resolved'
  GROUP BY ST_SnapToGrid(b.geom, 0.005), i.category
  HAVING COUNT(*) >= 3;  -- k-anonymity: suppress cells with < 3 reports

-- Index for fast spatial lookups on the heatmap
CREATE INDEX heatmap_grid_cell_idx ON heatmap_grid USING GIST (cell_center);

-- -------------------------------------------------------
-- SECURITY DEFINER function: clients never query
-- heatmap_grid directly — all access goes through here.
-- Enforces radius and ensures anonymization is intact.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION get_heatmap_data(
  center_lat  DOUBLE PRECISION,
  center_lng  DOUBLE PRECISION,
  radius_km   DOUBLE PRECISION DEFAULT 10.0
)
RETURNS TABLE (
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  category     issue_category,
  report_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Hard cap: clients cannot request more than 50km radius
  -- to prevent bulk data extraction
  IF radius_km > 50 THEN
    RAISE EXCEPTION 'radius_km cannot exceed 50 km';
  END IF;

  RETURN QUERY
    SELECT
      h.lat,
      h.lng,
      h.category,
      h.report_count
    FROM heatmap_grid h
    WHERE ST_DWithin(
      h.cell_center::geography,
      ST_MakePoint(center_lng, center_lat)::geography,
      radius_km * 1000  -- ST_DWithin uses meters
    );
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION get_heatmap_data(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_heatmap_data(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION)
  TO authenticated;

-- -------------------------------------------------------
-- pg_cron: refresh heatmap every 6 hours
-- (requires pg_cron extension and superuser setup)
-- -------------------------------------------------------
SELECT cron.schedule(
  'refresh-heatmap',           -- job name
  '0 */6 * * *',               -- every 6 hours
  'REFRESH MATERIALIZED VIEW CONCURRENTLY heatmap_grid'
);
