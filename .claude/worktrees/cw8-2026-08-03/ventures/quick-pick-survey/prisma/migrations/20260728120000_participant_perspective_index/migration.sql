-- Resuming a signed-in account looks up "the participants for the perspective
-- this person was last using", which runs on every page load.
CREATE INDEX IF NOT EXISTS "Participant_userId_perspective_lastSeenAt_idx"
  ON "Participant"("userId", "perspective", "lastSeenAt");
