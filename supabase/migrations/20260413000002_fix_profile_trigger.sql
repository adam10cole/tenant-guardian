-- Update handle_new_user to read display_name, role, and jurisdiction from
-- user metadata passed via signUp options.data. This ensures the profile is
-- fully populated at trigger time, before email confirmation grants a session.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  meta_role user_role;
BEGIN
  -- Cast the role string from metadata; default to 'tenant' if missing or invalid
  BEGIN
    meta_role := (NEW.raw_user_meta_data->>'role')::user_role;
  EXCEPTION WHEN invalid_text_representation THEN
    meta_role := 'tenant';
  END;

  INSERT INTO public.profiles (id, display_name, role, jurisdiction)
  VALUES (
    NEW.id,
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    COALESCE(meta_role, 'tenant'),
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'jurisdiction'), ''), 'MI-GENERAL')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
