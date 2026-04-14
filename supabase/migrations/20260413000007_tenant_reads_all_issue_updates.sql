-- Allow tenants to read ALL updates on their own issues, including updates
-- posted by linked landlords. The existing "Tenants manage own updates" policy
-- only covers rows where user_id = auth.uid(), which excludes landlord updates.

CREATE POLICY "Issue owners read all updates on their issues"
  ON issue_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM issues
      WHERE issues.id = issue_updates.issue_id
        AND issues.user_id = auth.uid()
    )
  );
