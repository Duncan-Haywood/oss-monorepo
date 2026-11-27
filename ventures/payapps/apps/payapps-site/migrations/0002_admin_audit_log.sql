-- Platform audit trail: every read of /api/admin/* by the owner console (apps/admin). Not sign-up
-- data: no email or answers are copied here, only who read what and when.
CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX admin_audit_log_created_idx ON admin_audit_log (created_at);
