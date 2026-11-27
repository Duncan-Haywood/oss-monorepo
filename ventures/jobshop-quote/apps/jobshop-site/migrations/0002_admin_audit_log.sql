-- Platform audit trail: every read of /api/admin/* by the owner console (apps/admin). Only who read
-- what and when; no request data is copied here.
CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX admin_audit_log_created_at ON admin_audit_log (created_at);
