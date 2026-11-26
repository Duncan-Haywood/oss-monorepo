-- D1 schema for the mail Worker (platform/email/worker.mjs). Raw messages
-- are in R2 (key in messages.raw_key); everything here is the parsed copy
-- and the agents' working state. Private: none of it is ever committed.
-- Re-running this file is harmless.

CREATE TABLE IF NOT EXISTS threads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  inbox      TEXT NOT NULL,            -- local part, e.g. 'support'
  subject    TEXT NOT NULL DEFAULT '',
  base_subject TEXT NOT NULL DEFAULT '',
  contact    TEXT NOT NULL DEFAULT '', -- the outside address that opened it
  category   TEXT NOT NULL DEFAULT 'other',
  labels     TEXT NOT NULL DEFAULT '[]',
  status     TEXT NOT NULL DEFAULT 'open', -- open | answered | closed
  first_at   TEXT NOT NULL,
  last_at    TEXT NOT NULL,
  unread     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS threads_inbox_last ON threads (inbox, last_at);
CREATE INDEX IF NOT EXISTS threads_match ON threads (inbox, base_subject, contact);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id   INTEGER NOT NULL,
  inbox       TEXT NOT NULL,
  direction   TEXT NOT NULL,           -- in | out
  at          TEXT NOT NULL,
  message_id  TEXT NOT NULL DEFAULT '',
  in_reply_to TEXT NOT NULL DEFAULT '',
  refs        TEXT NOT NULL DEFAULT '[]',
  env_from    TEXT NOT NULL DEFAULT '', -- SMTP envelope sender
  mail_from   TEXT NOT NULL DEFAULT '', -- From: header address
  from_name   TEXT NOT NULL DEFAULT '',
  reply_to    TEXT NOT NULL DEFAULT '',
  rcpt_to     TEXT NOT NULL DEFAULT '',
  cc          TEXT NOT NULL DEFAULT '[]',
  subject     TEXT NOT NULL DEFAULT '',
  text_body   TEXT NOT NULL DEFAULT '',
  html_present INTEGER NOT NULL DEFAULT 0,
  attachments TEXT NOT NULL DEFAULT '[]', -- [{filename, type, size}], metadata only
  size        INTEGER NOT NULL DEFAULT 0,
  raw_key     TEXT NOT NULL DEFAULT '',   -- R2 object key
  automated   INTEGER NOT NULL DEFAULT 0,
  auth_results TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'other',
  labels      TEXT NOT NULL DEFAULT '[]',
  why         TEXT NOT NULL DEFAULT '[]',
  read        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS messages_thread ON messages (thread_id, id);
CREATE INDEX IF NOT EXISTS messages_msgid ON messages (inbox, message_id);
CREATE INDEX IF NOT EXISTS messages_at ON messages (inbox, at);

-- Reasons a person must see a thread. Open flags block every send on it.
-- source 'rule' (classify.mjs) or 'agent'; only the owner token resolves.
CREATE TABLE IF NOT EXISTS flags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id   INTEGER NOT NULL,
  message_id  INTEGER NOT NULL DEFAULT 0,
  reason      TEXT NOT NULL,
  source      TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  at          TEXT NOT NULL,
  alerted_at  TEXT NOT NULL DEFAULT '',
  resolved_at TEXT NOT NULL DEFAULT '',
  resolved_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS flags_thread ON flags (thread_id, resolved_at);

CREATE TABLE IF NOT EXISTS drafts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id  INTEGER NOT NULL DEFAULT 0,
  kind       TEXT NOT NULL,           -- reply | marketing
  inbox      TEXT NOT NULL,
  to_addr    TEXT NOT NULL,
  subject    TEXT NOT NULL,
  text_body  TEXT NOT NULL,
  author     TEXT NOT NULL DEFAULT 'agent',
  status     TEXT NOT NULL DEFAULT 'draft', -- draft | sent | blocked | failed | discarded
  reason     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Every send attempt, allowed or not: the audit log.
CREATE TABLE IF NOT EXISTS sends (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  day         TEXT NOT NULL,
  kind        TEXT NOT NULL,          -- reply | marketing | cold | owner_alert | digest
  thread_id   INTEGER NOT NULL DEFAULT 0,
  draft_id    INTEGER NOT NULL DEFAULT 0,
  from_addr   TEXT NOT NULL,
  to_addr     TEXT NOT NULL,
  subject     TEXT NOT NULL DEFAULT '',
  provider    TEXT NOT NULL DEFAULT '',
  provider_id TEXT NOT NULL DEFAULT '',
  result      TEXT NOT NULL,          -- sent | blocked | failed
  reason      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sends_day ON sends (day, result, kind);
CREATE INDEX IF NOT EXISTS sends_to ON sends (day, to_addr, result);

-- Suppression: addresses never mailed again (scope 'all': bounce, complaint;
-- 'marketing' / 'unsubscribed': opted out of everything but replies they asked for).
CREATE TABLE IF NOT EXISTS suppressions (
  address TEXT NOT NULL,
  scope   TEXT NOT NULL,
  reason  TEXT NOT NULL,
  at      TEXT NOT NULL,
  PRIMARY KEY (address, scope)
);

-- Recorded opt-ins (GDPR/PECR proof): who, where, when, which wording.
CREATE TABLE IF NOT EXISTS contacts (
  address   TEXT PRIMARY KEY,
  source    TEXT NOT NULL,
  wording   TEXT NOT NULL,
  opted_in_at TEXT NOT NULL,
  revoked_at  TEXT NOT NULL DEFAULT ''
);

-- Per-day counters: inbound cap, owner alert cap.
CREATE TABLE IF NOT EXISTS daily (
  kind TEXT NOT NULL,
  day  TEXT NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, day)
);

-- Raw MIME when the account has no R2 bucket yet (worker.mjs falls back to
-- this table; R2 needs a payment method on the account, which is the
-- owner's call). Messages over RAW_INLINE_MAX bytes are kept truncated.
CREATE TABLE IF NOT EXISTS raw_blobs (
  key  TEXT PRIMARY KEY,
  body BLOB NOT NULL
);
