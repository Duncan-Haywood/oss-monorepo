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

## E1: Mirror with one writer, archive rather than delete (2026-10-14, owner-directed, PR https://github.com/Duncan-Haywood/oss-monorepo/pull/6984)
- Change: a direct edit, not a candidate, made at the owner's request to keep
  the two repositories mirrored with no history loss.
  - `prompts/research/prompt-0.md` and `prompts/ventures/prompt-0.md`: until
    cutover, research work lands upstream, and keeping the mirror current is
    standing work. Mirror PRs merge with a merge commit.
  - `research/_mirror/README.md` and `research/CLAUDE.md`: the upstream
    repository is archived at cutover, never deleted.
  - `land-your-work.md`: names the mirror-PR exception to squash-merging.
- Why: the research track routes 50% of runs here, and `mirror.py sync`
  deletes files under the mirrored area that upstream lacks. So a project
  built here before cutover would disappear at the next sync. Deleting the
  upstream repository would also lose its pull requests, review threads and
  branches.
- Measure: research-track runs here that touch `research/` outside a sync
  (target 0), and `mirror.py check` on `main`.
- Result: (next review)

## Proposals for the owner

Changes to `prompts/goals.md` that a review thinks are warranted, with the
evidence. The owner decides.

(none yet)
