CREATE TABLE issue_updates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id     UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id),
  event_type   TEXT NOT NULL DEFAULT 'update',
  note         TEXT,
  status_value TEXT,
  local_id     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE issue_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own updates" ON issue_updates
  FOR ALL USING (auth.uid() = user_id);
