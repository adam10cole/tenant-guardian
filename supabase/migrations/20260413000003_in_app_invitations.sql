-- ============================================================
-- In-app invitation RPCs
-- Replaces email-based invitations with direct in-app requests.
-- Both functions are SECURITY DEFINER to access auth.users.
-- ============================================================

-- -------------------------------------------------------
-- send_in_app_invitation(p_email)
-- Verifies the invitee has an account, then inserts an invitation row.
-- Returns the invitation id on success; raises on any problem.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION send_in_app_invitation(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitee_id   UUID;
  v_inviter_role user_role;
  v_role_to_give user_role;
  v_inv_id       UUID;
BEGIN
  -- Look up the invitee by email
  SELECT id INTO v_invitee_id
  FROM auth.users
  WHERE email = LOWER(TRIM(p_email))
  LIMIT 1;

  IF v_invitee_id IS NULL THEN
    RAISE EXCEPTION 'No account found with that email address';
  END IF;

  IF v_invitee_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot invite yourself';
  END IF;

  -- Check for an existing active link
  IF EXISTS (
    SELECT 1 FROM landlord_tenant_links
    WHERE status = 'active'
      AND (
        (landlord_id = auth.uid() AND tenant_id = v_invitee_id) OR
        (tenant_id   = auth.uid() AND landlord_id = v_invitee_id)
      )
  ) THEN
    RAISE EXCEPTION 'You are already connected with this user';
  END IF;

  -- Check for an existing pending invitation in either direction
  IF EXISTS (
    SELECT 1 FROM invitations
    WHERE status = 'pending'
      AND expires_at > NOW()
      AND (
        (inviter_id = auth.uid() AND invitee_email = LOWER(TRIM(p_email))) OR
        (inviter_id = v_invitee_id AND invitee_email = (
          SELECT email FROM auth.users WHERE id = auth.uid()
        ))
      )
  ) THEN
    RAISE EXCEPTION 'A pending invitation already exists between you and this user';
  END IF;

  SELECT role INTO v_inviter_role FROM profiles WHERE id = auth.uid();

  v_role_to_give := CASE
    WHEN v_inviter_role = 'landlord' THEN 'tenant'::user_role
    ELSE 'landlord'::user_role
  END;

  INSERT INTO invitations (inviter_id, invitee_email, role_to_give, status)
  VALUES (auth.uid(), LOWER(TRIM(p_email)), v_role_to_give, 'pending')
  RETURNING id INTO v_inv_id;

  RETURN json_build_object('invitation_id', v_inv_id);
END;
$$;

GRANT EXECUTE ON FUNCTION send_in_app_invitation(TEXT) TO authenticated;

-- -------------------------------------------------------
-- reject_invitation(p_token)
-- Allows the invitee to decline; sets status to 'cancelled'.
-- SECURITY DEFINER so invitee can find the row by token
-- without needing SELECT rights on the invitations table.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION reject_invitation(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv     invitations%ROWTYPE;
  v_email   TEXT;
BEGIN
  SELECT * INTO v_inv FROM invitations WHERE token = p_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invitation token';
  END IF;

  -- Verify the caller is actually the invitee
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  IF v_inv.invitee_email != v_email THEN
    RAISE EXCEPTION 'Not authorised to reject this invitation';
  END IF;

  IF v_inv.status != 'pending' THEN
    RAISE EXCEPTION 'Invitation is already %', v_inv.status;
  END IF;

  UPDATE invitations SET status = 'cancelled' WHERE id = v_inv.id;
END;
$$;

GRANT EXECUTE ON FUNCTION reject_invitation(TEXT) TO authenticated;
