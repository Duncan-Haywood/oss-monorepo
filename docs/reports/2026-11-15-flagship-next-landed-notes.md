---
kind: note
topics: [guidance-system]
date: 2026-11-15
---
# Flagship `next:` fields at the cap: landed notes (process run, 2026-11-15)

For the next run that hits the 2,000-character `next:` cap, or a process run
looking at flagships.yaml friction.

- Reading on 2026-11-15: all 11 `next:` fields at 1,611 to 1,992 of 2,000.
  `python3 portfolio/router/flagship_field.py <venture> --landed` lists the
  clauses that report landed work and the part of each to keep. The safe cuts
  total 959 characters (einvoice-preflight 421, open-tennis-robots 416).
- The same list now appears whenever `flagship_field.py` refuses an over-cap
  edit; `validate.py`'s cap error names the command.
- Clauses marked `?` (several landed and open items interleaved, or the
  "Landed work: README" pointer) have no safe automatic split. Edit them by
  hand.
- Not done: trimming the fields themselves. flagships.yaml is edited many
  times a day, so a bulk rewrite would collide with open PRs. A ventures run
  that lands an item on einvoice-preflight or open-tennis-robots can take
  that venture's cuts in the same edit.
- Metric for a later Verify: count of run records whose doc_friction names
  flagships.yaml and the cap (`grep -l '2,000\|2000' prompts/runs/*.json`
  combined with flagships.yaml), 2026-11-10..15 baseline 11 sessions
  (`platform/ci/friction_rank.py`, cluster 14).
