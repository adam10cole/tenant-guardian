-- Create the exported-pdfs private bucket for generated evidence PDFs.
-- The edge function (service role) uploads to this bucket.
-- Authenticated users can only read PDFs from their own folder.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('exported-pdfs', 'exported-pdfs', false, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- SELECT: users can only read PDFs stored under their own user UUID folder.
-- Path format: {user_id}/{issue_id}/{timestamp}.pdf
DROP POLICY IF EXISTS "Users can read own exported PDFs" ON storage.objects;
CREATE POLICY "Users can read own exported PDFs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'exported-pdfs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- No INSERT policy for authenticated users.
-- RLS deny-by-default blocks them; the edge function uses the service role,
-- which bypasses RLS entirely.
