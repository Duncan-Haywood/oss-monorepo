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
- Measure: baseline. No records exist yet. The first review backfills from
  git history (review prompt, step 1), and every later comparison starts
  here.
- Result: (first review)

## Proposals for the owner

Changes to `prompts/goals.md` that a review thinks are warranted, with the
evidence. The owner decides.

(none yet)
