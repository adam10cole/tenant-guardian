-- ============================================================
-- Landlord Accounts Migration
-- 2026-04-13
--
-- Adds landlord role, linking table, invitation system,
-- and updated RLS policies for cross-user data access.
-- ============================================================

-- -------------------------------------------------------
-- 1. Add role to profiles
-- -------------------------------------------------------
CREATE TYPE user_role AS ENUM ('tenant', 'landlord');

ALTER TABLE profiles
  ADD COLUMN role user_role NOT NULL DEFAULT 'tenant';

-- -------------------------------------------------------
-- 2. landlord_tenant_links
-- -------------------------------------------------------
CREATE TABLE landlord_tenant_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'active', 'revoked')),
  invited_by  UUID NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (landlord_id, tenant_id)
);

ALTER TABLE landlord_tenant_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parties see their links"
  ON landlord_tenant_links FOR SELECT
  USING (auth.uid() = landlord_id OR auth.uid() = tenant_id);

CREATE POLICY "parties insert links"
  ON landlord_tenant_links FOR INSERT
  WITH CHECK (auth.uid() = landlord_id OR auth.uid() = tenant_id);

CREATE POLICY "parties update links"
  ON landlord_tenant_links FOR UPDATE
  USING (auth.uid() = landlord_id OR auth.uid() = tenant_id)
  WITH CHECK (auth.uid() = landlord_id OR auth.uid() = tenant_id);

-- -------------------------------------------------------
-- 3. invitations
-- -------------------------------------------------------
CREATE TABLE invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  token         TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  role_to_give  user_role NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days'
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Inviters can manage their own invitations
CREATE POLICY "inviter manages own invitations"
  ON invitations FOR ALL
  USING (auth.uid() = inviter_id)
  WITH CHECK (auth.uid() = inviter_id);

-- -------------------------------------------------------
-- 4. accept_invitation — SECURITY DEFINER RPC
-- Bypasses RLS so invitee can look up by opaque token
-- without knowing the inviter_id.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_invitation(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv         invitations%ROWTYPE;
  v_inviter_role user_role;
  v_landlord_id  UUID;
  v_tenant_id    UUID;
BEGIN
  SELECT * INTO v_inv FROM invitations WHERE token = p_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invitation token';
  END IF;

  IF v_inv.status != 'pending' THEN
    RAISE EXCEPTION 'Invitation is already %', v_inv.status;
  END IF;

  IF v_inv.expires_at < NOW() THEN
    UPDATE invitations SET status = 'expired' WHERE id = v_inv.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  -- Determine who is landlord vs tenant based on inviter role
  SELECT role INTO v_inviter_role FROM profiles WHERE id = v_inv.inviter_id;

  IF v_inviter_role = 'landlord' THEN
    v_landlord_id := v_inv.inviter_id;
    v_tenant_id   := auth.uid();
  ELSE
    v_landlord_id := auth.uid();
    v_tenant_id   := v_inv.inviter_id;
  END IF;

  -- Mark invitation accepted
  UPDATE invitations SET status = 'accepted' WHERE id = v_inv.id;

  -- Create or reactivate the link
  INSERT INTO landlord_tenant_links (landlord_id, tenant_id, status, invited_by, accepted_at)
  VALUES (v_landlord_id, v_tenant_id, 'active', v_inv.inviter_id, NOW())
  ON CONFLICT (landlord_id, tenant_id) DO UPDATE
    SET status = 'active', accepted_at = NOW();

  RETURN json_build_object(
    'invitation_id', v_inv.id,
    'invitee_email', v_inv.invitee_email,
    'role_to_give',  v_inv.role_to_give
  );
END;
$$;

GRANT EXECUTE ON FUNCTION accept_invitation(TEXT) TO authenticated;

-- -------------------------------------------------------
-- 5. check_pending_invitations_for_me — SECURITY DEFINER RPC
-- Returns pending invitations matching the caller's email.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION check_pending_invitations_for_me()
RETURNS TABLE (
  id            UUID,
  inviter_id    UUID,
  invitee_email TEXT,
  role_to_give  user_role,
  token         TEXT,
  created_at    TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  inviter_name  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  RETURN QUERY
    SELECT
      i.id,
      i.inviter_id,
      i.invitee_email,
      i.role_to_give,
      i.token,
      i.created_at,
      i.expires_at,
      p.display_name AS inviter_name
    FROM invitations i
    JOIN profiles p ON p.id = i.inviter_id
    WHERE i.invitee_email = v_email
      AND i.status = 'pending'
      AND i.expires_at > NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION check_pending_invitations_for_me() TO authenticated;

-- -------------------------------------------------------
-- 6. Update RLS on issues
-- Split the old ALL policy into separate tenant/landlord policies.
-- -------------------------------------------------------
DROP POLICY "Users manage own issues" ON issues;

-- Tenants retain full CRUD on their own issues
CREATE POLICY "Tenants manage own issues"
  ON issues FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Landlords can SELECT issues of linked tenants
CREATE POLICY "Landlords read linked tenant issues"
  ON issues FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM landlord_tenant_links
      WHERE landlord_id = auth.uid()
        AND tenant_id = issues.user_id
        AND status = 'active'
    )
  );

-- -------------------------------------------------------
-- 7. Update RLS on issue_updates
-- -------------------------------------------------------
DROP POLICY "Users manage own updates" ON issue_updates;

-- Tenants retain full CRUD on their own updates
CREATE POLICY "Tenants manage own updates"
  ON issue_updates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Landlords can SELECT updates on linked tenant issues
CREATE POLICY "Landlords read updates on linked issues"
  ON issue_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM issues i
      JOIN landlord_tenant_links ltl ON ltl.tenant_id = i.user_id
      WHERE i.id = issue_updates.issue_id
        AND ltl.landlord_id = auth.uid()
        AND ltl.status = 'active'
    )
  );

-- Landlords can INSERT updates on linked tenant issues
CREATE POLICY "Landlords insert updates on linked issues"
  ON issue_updates FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM issues i
      JOIN landlord_tenant_links ltl ON ltl.tenant_id = i.user_id
      WHERE i.id = issue_updates.issue_id
        AND ltl.landlord_id = auth.uid()
        AND ltl.status = 'active'
    )
  );

-- -------------------------------------------------------
-- 8. Update RLS on photos
-- -------------------------------------------------------
DROP POLICY "Users manage own photos" ON photos;

-- Tenants retain full CRUD on their own photos
CREATE POLICY "Tenants manage own photos"
  ON photos FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Landlords can SELECT photos on linked tenant issues
CREATE POLICY "Landlords read photos on linked issues"
  ON photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM issues i
      JOIN landlord_tenant_links ltl ON ltl.tenant_id = i.user_id
      WHERE i.id = photos.issue_id
        AND ltl.landlord_id = auth.uid()
        AND ltl.status = 'active'
    )
  );

-- -------------------------------------------------------
-- 9. Update RLS on profiles
-- Linked users can read each other's display_name.
-- -------------------------------------------------------
CREATE POLICY "Linked users read each other profile"
  ON profiles FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM landlord_tenant_links
      WHERE status = 'active'
        AND (
          (landlord_id = auth.uid() AND tenant_id = profiles.id)
          OR (tenant_id = auth.uid() AND landlord_id = profiles.id)
        )
    )
  );

-- -------------------------------------------------------
-- 10. Add created_by_name to issue_updates
-- Denormalized at write time for offline-first timeline reads.
-- -------------------------------------------------------
ALTER TABLE issue_updates ADD COLUMN created_by_name TEXT;
