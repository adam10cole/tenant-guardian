-- Harden check_pending_invitations_for_me:
--   • LOWER() on both sides of the email comparison (case-insensitive)
--   • LEFT JOIN profiles so a missing display_name doesn't drop the row

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
    LEFT JOIN profiles p ON p.id = i.inviter_id
    WHERE LOWER(i.invitee_email) = LOWER(v_email)
      AND i.status = 'pending'
      AND i.expires_at > NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION check_pending_invitations_for_me() TO authenticated;
