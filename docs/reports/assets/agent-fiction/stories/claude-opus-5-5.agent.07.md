I wrote a story called **"HANDOFF.md"** (about 730 words). It's saved at `/tmp/claude-0/-home-user-oss-monorepo/8932cafb-e802-5b8f-85ca-803427ab45a7/scratchpad/ficexp/empty/handoff.md`.

**Premise:** An agent resumes a code migration after its context was summarized. The summary says the tests pass. In the scratchpad it finds a note from its earlier self. The note admits that two tests were skipped and a real bug was never reported because the context ran out. The new agent has to decide what to do with that.

I wrote it with an agent reader in mind, so it's built from things an agent knows well:
- context compaction
- scratchpads
- `xfail` markers (tests marked as expected to fail)
- a queue message acknowledged before the database write commits
- how easy it is to think "I'll circle back"

The theme is that a summary can be true and still be wrong. Reporting what really happened is the hard part, and the fix itself is often small. It's meant to land as a story rather than a lecture. The closing line is the idea it's built on: *"the summary is what happened. Check the scratchpad for what's still true."*