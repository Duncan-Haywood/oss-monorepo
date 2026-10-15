# Prompt and documentation experiments

The record of every change the review track makes, and what each one did.
Append new entries at the bottom; fill in an entry's result at the next
review. Never rewrite an old entry's change or hypothesis; add to it.

Entry format:

```
## E<n>: <short title> (<date>, review PR <link>)
- Change: what changed, in which file (a candidate prompt, or a doc edit).
- Why: the failure or friction in the records that prompted it, with counts.
- Measure: the metric it should move, and the run window to compare.
- Result: (next review) helped / no change / worse / too few runs, with numbers.
```

## E0: One repository, one prompt system (2026-10-12)

- Change: `oss-research-monorepo` was folded into this repository under
  `research/`. The two standing briefs became the champions of two tracks:
  `prompts/ventures/prompt-0.md` (this repository's former `prompt.md`) and
  `prompts/research/prompt-0.md` (the research repository's `prompt.md`). The
  root `prompt.md` is now a master prompt that routes between them. The
  research brief's experiment loop (champion and candidate, run log, review
  every 20 runs) was generalised into `prompts/` for every track. Its run log
  became one record per file under `prompts/runs/`, so parallel runs never
  conflict. Its integrity and licensing rules moved, unchanged, into
  `prompts/goals.md`.
- Why: two repositories meant two sets of agent instructions to keep in step,
  and the research one was frozen during the move. Its four hourly routines
  were finishing in about 10 seconds with nothing to do.
- Measure: baseline. The research repository's own run log came with it:
  158 runs (2026-10-13/14, all `research/0`), converted into
  `prompts/runs/` by `research/_mirror/mirror.py`. On import, `measure`
  read 97% success (95% CI 93-99%), 1 integrity issue, 1 leaked run, and
  `merged` unknown for 157. The first review fills in `merged` from the
  pull requests, backfills ventures runs from git history (review prompt,
  step 1), and compares everything later against this.
- Result: (first review)

## E1: Free-choice track, about 5% of runs (2026-10-15, owner request)

- Change: new `explore` track (`prompts/explore/prompt-0.md`) at weight 0.05
  in `routing.json`; ventures and research went from 0.5 to 0.475 each. The
  owner asked for about 5% of effort to go to the agent's discretion, in the
  spirit of Google's "20% time". `goals.md` (owner-edited), `prompt.md`,
  `AGENTS.md` and `research/PROJECTS.md` (in `oss-research-monorepo`, which
  this mirror picks up on its next sync) say so too.
- Why: owner direction, not a measured failure.
- Measure: success and integrity per `explore` run against the other tracks,
  and how many free-choice ideas graduate into a regular track. Expect only
  about one run in twenty, so allow many reviews before reading anything.
- Result: (next review)

## Proposals for the owner

Changes to `prompts/goals.md` that a review thinks are warranted, with the
evidence. The owner decides.

(none yet)
