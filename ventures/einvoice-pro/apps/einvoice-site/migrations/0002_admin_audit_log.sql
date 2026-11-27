-- Platform audit trail: every read of /api/admin/* by the owner console (apps/admin). Only who read
-- what and when; no sign-up data (and no IP address) is copied here. Times are epoch milliseconds.
CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX admin_audit_log_created_idx ON admin_audit_log (created_at);
