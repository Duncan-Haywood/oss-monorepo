-- Early-access list (double opt-in). Public prospects, not customer data: no account, no org.
-- Times are Unix epoch milliseconds. See docs/EARLY_ACCESS.md.
CREATE TABLE early_access_signups (
  id TEXT PRIMARY KEY,
  -- Trimmed + lowercased. Kept after unsubscribe as the suppression record.
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  -- Survey answers (optional): JSON array of platform slugs, and a monthly order band.
  platforms TEXT NOT NULL DEFAULT '[]',
  volume TEXT,
  -- Consent record: site path of the form, version of the wording shown, salted hash of the IP.
  consent_source TEXT NOT NULL,
  consent_text_version TEXT NOT NULL,
  consent_ip_hash TEXT,
  -- SHA-256 (hex) of the current confirmation token; the raw token exists only in the email.
  confirm_token_hash TEXT,
  confirm_token_expires_at INTEGER,
  confirm_sent_at INTEGER,
  confirm_send_count INTEGER NOT NULL DEFAULT 0,
  confirmed_at INTEGER,
  unsubscribed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX early_access_signups_email_uq ON early_access_signups (email);
CREATE UNIQUE INDEX early_access_signups_token_uq ON early_access_signups (confirm_token_hash);
-- Daily purge of never-confirmed signups.
CREATE INDEX early_access_signups_status_created_idx ON early_access_signups (status, created_at);
