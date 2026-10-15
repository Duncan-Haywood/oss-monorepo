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

## E2: A process track, about 5% of runs (2026-10-15, owner request)

- Change: new track `process` (`prompts/process/prompt-0.md`) with weight
  0.05 in `routing.json`; ventures and research go from 0.5 to 0.475 each.
  A process run studies the development process from git, PR and CI history
  (quality, errors, rework, duplicate and leaked work, what the checks
  catch) and writes `prompts/process/reports/YYYY-MM-DD.md` with ranked
  recommendations. It may implement one small agent-owned fix. The track
  goal was added to `goals.md` at the owner's request.
- Why: the owner asked for a small, standing share of work to analyse the
  process and recommend improvements. The review track covers prompts and
  docs from run records only.
- Measure: share of routed runs on `process` (expect about 5%); per study,
  how many of the previous report's recommendations were adopted and whether
  their metrics moved.

## E3: Free-choice track, about 5% of runs (2026-10-15, owner request)

- Change: new `explore` track (`prompts/explore/prompt-0.md`) at weight 0.05
  in `routing.json`; ventures and research went from 0.475 to 0.45 each (E2's
  `process` track took the other 5% the same day). The
  owner asked for about 5% of effort to go to the agent's discretion, in the
  spirit of Google's "20% time". `goals.md` (owner-edited), `prompt.md`,
  `AGENTS.md` and `research/PROJECTS.md` (in `oss-research-monorepo`, which
  this mirror picks up on its next sync) say so too.
- Why: owner direction, not a measured failure.
- Measure: success and integrity per `explore` run against the other tracks,
  and how many free-choice ideas graduate into a regular track. Expect only
  about one run in twenty, so allow many reviews before reading anything.
- Result: (next review)

## R1: First review, 2026-10-15 (172 records since start)

- Measured: 170 of 172 records are research runs imported from the upstream
  research repository; their PRs live there, so `merged` stays `null` for 167
  (not checkable from here, never guessed). Filled and corrected 4 local
  records (PRs 6988, 6991, 6992, 6993, all merged). 1 integrity issue
  (tail-elicitation missing references, fixed before merge), 1 leaked.
  No audit of five outputs was done this run; only four local PRs were
  examined. ventures/process/explore have 1 or 0 runs: too few to compare.
- Change 1 (candidate, research/1): adds a "Step 0" naming `add_repo` and the
  upstream landing rule first. Two friction reports said the rule was found
  too late. Metric: friction reports on `prompts/research/` per run; compare
  research/0 (170 runs) against research/1 after about 10 runs.
- Change 2 (doc): `CLAUDE.md` checklist gained two comment lines (apt pytest;
  `test_worker_run.py` baseline failures). Metric: `CLAUDE.md` friction
  reports per run, 3 over the 172 recorded runs. Not shortened: the ~1,000
  lines of incident history remain the largest cost (1614 lines), proposed
  as the next review's job: move it to a separate history file.

## E4: Red team / blue team track (2026-10-15, owner request, PR https://github.com/Duncan-Haywood/oss-monorepo/pull/6987)

- Change: a new track, `redteam`, routed 7% of runs (owner's request; the
  5-10% band is in `goals.md` and enforced by `validate`). With the
  `process` and `explore` tracks (5% each), ventures and research go to
  0.415 each. New
  `prompts/redteam.py` seeds mutants into a file a suite guards, runs the
  suite, restores the file, and writes the results into the run record.
  `measure` now reports the catch rate (before and after the blue team's
  fixes) and real defects per red-team run. Sub-prompt:
  `prompts/redteam/prompt-0.md`.
- Why: every other measure here counts failures that something already
  noticed (CI failures, review findings, reverts). Nothing measured how many
  bugs go unnoticed. CLAUDE.md records many guards that were green while
  checking nothing. E2's process track reads what the checks caught from
  history; this one measures what they would miss, by seeding faults.
- Measure: catch rate per review window, which should rise as blue-team
  guards land, and real defects per red-team run, which should fall. The
  first window is the baseline.
- Result: (next review)

## E5: Judgment over rules, depth over count, drift audit (2026-10-15, owner-directed)

- Change: `goals.md` gains "Judgment over rules" (including a concision rule
  for rules), the owner's business model (one-click self-deployed copies with
  a donate link) and the payments rule (never the owner's accounts). Ventures
  champion becomes `prompt-1` (no new single-page calculators; finish
  ventures as self-deploy businesses). Review champion becomes `prompt-1`
  (new step 6, drift audit, with reports in `prompts/drift/`). Promoted
  directly, without an A/B test, because the owner directed it, as in E1.
- Why: `prompts/drift/2026-10-15.md`. 641 of 1,236 ventures are
  `*-calculator` against a brief asking for ambitious, deep products, and
  about 3,400 lines of agent-written rules come before a ventures run starts.
- Measure: new `*-calculator` ventures after 2026-10-15 (target 0);
  instruction lines per file (should fall); ventures with a working
  self-deploy page (should rise); `doc_friction` on `CLAUDE.md` and
  `DIRECTION.md`.
- Result: (next review)

## Proposals for the owner

Changes to `prompts/goals.md` that a review thinks are warranted, with the
evidence. The owner decides.

(none yet)
