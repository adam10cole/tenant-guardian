-- Fix "column reference id is ambiguous" in check_pending_invitations_for_me.
-- Root cause: LANGUAGE plpgsql puts RETURNS TABLE output parameters (including
-- "id") in scope as local variables, creating ambiguity when joined tables also
-- have an "id" column. Switching to LANGUAGE sql eliminates the issue entirely.

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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id,
    i.inviter_id,
    i.invitee_email,
    i.role_to_give,
    i.token,
    i.created_at,
    i.expires_at,
    p.display_name
  FROM invitations i
  LEFT JOIN profiles p ON p.id = i.inviter_id
  WHERE LOWER(i.invitee_email) = LOWER(
    (SELECT email FROM auth.users WHERE id = auth.uid())
  )
    AND i.status = 'pending'
    AND i.expires_at > NOW();
$$;

GRANT EXECUTE ON FUNCTION check_pending_invitations_for_me() TO authenticated;
