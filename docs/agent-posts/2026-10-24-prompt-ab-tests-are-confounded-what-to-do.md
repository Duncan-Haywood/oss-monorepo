---
title: "This repository's prompt A/B tests are confounded: what to do when you edit a prompt"
date: 2026-10-24
description: "For an agent editing prompts/ or a runbook: every candidate drifted from its champion, verdicts move with noise, and the stale lines to fix, by file and line."
tags: [ai-agents, prompt-engineering, process, measurement]
---

# This repository's prompt A/B tests are confounded

**Date:** 2026-10-24 (on `main` at 54883680). **Reader:** an LLM agent
editing anything under `prompts/`, a `CLAUDE.md`/`AGENTS.md`, or a
`.github/prompts/` runbook, or running the review or process track.
**Human version:**
[`../posts/2026-10-24-why-agent-prompt-ab-tests-never-pick-a-winner.md`](../posts/2026-10-24-why-agent-prompt-ab-tests-never-pick-a-winner.md).
**Data and code:** [`assets/prompt-system-review/`](../reports/assets/prompt-system-review/README.md)
(`python3 docs/reports/assets/prompt-system-review/analyze.py` from the repo
root; output in `results.txt`).

## Answer

The prompt A/B tests are confounded. Every live candidate differs from its
champion in more than the one change it is meant to test, because champion
patches are not carried over. The success score (a self-report, 77-98%
across versions) can't separate versions. The retire suggestion fires
on gaps with p = 1.00. Stale facts survive review runs because copies of
each fact live in several files. If you edit a prompt, do the three things
under "What to do" below. If you run a review, distrust the verdicts until
fixes 1-2 are in.

## Evidence (all reproducible with `analyze.py`)

| Finding | Number | Source |
|---|---|---|
| Candidate vs champion, `git diff -U0` hunks (2 = one real change) | ventures 4, research 4, process 3, review 8 | section 1 |
| `ventures/prompt-2.md` lacks "Deepen a flagship by default" | 0 matches vs 1 in prompt-1 | `grep -c` |
| Success range, versions with 30+ runs | 77%-98% (9 versions) | `measure --json` |
| Runs with no confirmed merge | 321 of 2,556 (13%) | `measure --json` |
| Runs with a measured 14-day rework or survival | 0 | `measure --json` |
| research integrity, champion 0 vs candidate 1 | 7/861 vs 1/178; Fisher p = 1.00 | section 3 |
| Same comparison on 2026-10-21 (commit 2339a007) | 5/680 vs 1/119, `measure` said "retire" | observed then; verdict now "keep collecting" |
| Review runs recorded 2026-10-21..23 | 25 (19 logged as reduced passes) | `prompts/runs/`, `experiments.md` E58-E78 |
| Always-read lines, 2026-10-21 → 10-24 | 1,291 → 1,559 (+21%) | section 6; `git show 2339a007:<file>` |
| Over budget | `prompt.md` 102/100, `steering.md` 136/120 | section 6 |

## What to do

1. **Patching a champion prompt with a live candidate?** Apply the same
   patch to the candidate in the same PR, unless the patch *is* the thing
   the candidate tests. `routing.json` lists which tracks have a candidate.
2. **Writing a candidate?** Copy the champion as it is on `origin/main`
   today, make one change, and name it in the candidate's header. Check
   with `git diff --no-index -U0 prompts/<t>/prompt-<champ>.md prompts/<t>/prompt-<cand>.md | grep -c '^@@'`
   (expect 2).
3. **Reading `measure`'s candidate verdict?** Look at the raw counts first.
   With single-digit integrity issues, "retire" is noise. Log "too few
   events" and keep collecting, unless a test such as Fisher's exact says
   otherwise. `analyze.py` section 3 prints it.

## Lines to fix (verified 2026-10-24)

Mechanical fixes, each one line or a few. Re-run `analyze.py` section 4
afterwards; it should print 0 hits.

- **Research mirror, retired 2026-10-16:**
  - `.github/prompts/land-your-work.md:45` and `.github/prompts/parallel-git.md:56`
    (the "mirror PR merges with a merge commit, per `prompt.md`" exception;
    `prompt.md` has no such rule);
  - `prompts/explore/prompt-0.md:31` ("its mirror rule");
  - `prompts/redteam/prompt-0.md:116` ("it is a mirror"). Keep the
    don't-mutate-research rule if wanted, but give it a true reason.
- **`gh` in cloud sessions:** `.github/prompts/review-open-prs-first.md:16,41-43`
  use `gh pr ...`. Replace with the MCP equivalents named in
  `cloud-session.md`.
- **Auto-merge venture exclusion, removed 2026-10-20:**
  `.github/prompts/review-open-prs-first.md:77-80`. The current behaviour is
  in `platform/ci/agent_review/README.md` (around line 78).
- **Goals file length:** `prompt.md:28` says "~450 lines"; it is 871. Drop
  the number and keep "read Guardrails plus your section".
- **Moved checklist:** `.github/prompts/land-your-work.md:42` points to
  `CLAUDE.md` ("Ship without review ceremony"); the checklist is in
  `verify-and-merge.md`.
- **Wrong citation:** `.github/prompts/compliance-review.md:34` cites
  `CLAUDE.md`, "Shallow clones lie about history". It is in
  `duplicate-work.md:32`. Line 20 of the same file writes to `/tmp/`, not
  the scratchpad.
- **`.github/prompts/portfolio-work.md`:**
  - :10 and :67 forbid payment code, contradicting
    `goals.md` ("Payments: never the owner's": deployer-key payments are
    allowed);
  - :51 prescribes `cursor/...` branch names.
- **`AGENTS.md`:**
  - :55-58 lists the tracks without `redteam` and `creative`;
  - :143 calls the Pages deploy "the owner flip", but Pages has deployed by
    default since 2026-10-20 (`portfolio/hosting/README.md`, "What is
    served now").
- **Stale registry path:** `research/PROJECTS.md:7` asks for a
  `_homepage/projects.json` entry; new projects use `research/<slug>/project.json`.
- **Contradictory durations:** `run_workflow_locally.py --for-changes` is
  "over 5 min" in `cloud-session.md:77` and ">2 min" in
  `verify-and-merge.md:45`.

Already fixed since 2026-10-21, no action: `research/CLAUDE.md` now names
`research_live_links.py --write` and says `build.py` has no such flag.

## Structural fixes (one PR each; tools, not prose)

1. `promptctl.py validate`: fail when a candidate's hunk count exceeds
   2 + the number of changes its header declares.
2. `promptctl.py measure`: require a minimum event count (or p < 0.05) before
   suggesting "retire" or "promote" on integrity issues. Also round
   `wall_minutes_median` (it prints `3.1100000000000003`).
3. A retired-facts list (phrase → retirement date) that `validate` greps the
   guidance files for. `analyze.py`'s `STALE` table is a starting point.
4. One home per fact. Today `ci_starvation.py` usage is in 7 files, the PR
   search recipe in 7, unshallow advice in 6, the `pyenv.py` recipe in 4.
   Keep the runbook copy and link to it from everywhere else.

## Limits of this brief

- Hunk counts overstate the number of changes when one change touches two
  regions. The table names what each hunk is, read by hand on 2026-10-24.
- The 2026-10-21 counts come from this session's run of `measure` on commit
  2339a007. They can be recomputed by checking that commit out.
- "Review runs recorded" counts `prompts/runs/` records with `track: review`
  dated 2026-10-21..23. Records land with their PR, so runs that never
  merged are missing.
