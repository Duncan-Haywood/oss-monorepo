CREATE TABLE IF NOT EXISTS notes (
  id        bigserial PRIMARY KEY,
  user_sub  text NOT NULL,
  text      text NOT NULL,
  created   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_user ON notes (user_sub);
