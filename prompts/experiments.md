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

## E1: Red team / blue team track (2026-10-15)

- Change: a fourth track, `redteam`, routed 7% of runs (owner's request; the
  5-10% band is in `goals.md` and enforced by `validate`). New
  `prompts/redteam.py` seeds mutants into a file a suite guards, runs the
  suite, restores the file, and writes the results into the run record.
  `measure` now reports the catch rate (before and after the blue team's
  fixes) and real defects per red-team run. Sub-prompt:
  `prompts/redteam/prompt-0.md`.
- Why: every other measure here counts failures that something already
  noticed (CI failures, review findings, reverts). Nothing measured how many
  bugs go unnoticed. CLAUDE.md records many guards that were green while
  checking nothing.
- Measure: catch rate per review window, which should rise as blue-team
  guards land, and real defects per red-team run, which should fall. The
  first window is the baseline.
- Result: (next review)

## Proposals for the owner

Changes to `prompts/goals.md` that a review thinks are warranted, with the
evidence. The owner decides.

(none yet)
