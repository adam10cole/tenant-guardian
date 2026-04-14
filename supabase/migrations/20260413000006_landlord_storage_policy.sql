-- Allow landlords to generate signed URLs for linked tenants' photos.
-- Photos are stored at evidence-photos/{tenant_user_id}/{issue_id}/{photo_id}.jpg
-- so checking the first path segment against the linked tenant_id is sufficient.

CREATE POLICY "Landlords can access linked tenant photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'evidence-photos'
  AND EXISTS (
    SELECT 1 FROM public.landlord_tenant_links
    WHERE landlord_id = auth.uid()
      AND tenant_id::text = (storage.foldername(name))[1]
      AND status = 'active'
  )
);
