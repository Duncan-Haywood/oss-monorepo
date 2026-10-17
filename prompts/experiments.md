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

## E7: Steering by judgment, a process backlog, process track to 10% (2026-10-15, owner request)

- Change, all owner-directed rather than A/B (the owner asked for more
  critique-and-solution work on the process itself, for "suggestive direction
  setting" that does not over-handicap the agents, and noted that with ~16
  runs an hour against a few owner-hours a week, runs over-correct on
  instructions and on past work):
  - New `prompts/steering.md`: amplification as the premise; guardrails
    (`goals.md`) absolute, everything else a default; deviations recorded in
    run records; instructions give goal and reason before procedure; history
    out of always-read files; rules can retire.
  - `goals.md`: a "How to read this file" note (follow guardrails in spirit
    and proportion; past volume is not a mandate) and the process share at
    10%. No guardrail's content changed.
  - `prompt.md`: a judgment paragraph, and a `deviations` field in records.
  - `promptctl.py`: `deviations` (validated, grouped in `measure`),
    `backlog` command, backlog validation, and per-file line budgets
    reported (not enforced) in `measure`.
  - `prompts/process/backlog/`: 11 items seeded from the two 2026-10-15
    studies' recommendations and the friction reports.
  - `prompts/process/prompt-1.md` made champion directly: solve / critique /
    verify against the backlog, the run's choice. prompt-0's "one study per
    window, claimed by an open PR" collided on its first day (two studies of
    the same window) and cannot absorb ~1.6 process runs an hour.
  - `routing.json`: process 0.05 to 0.10; ventures and research 0.415 to
    0.39 each. Red team stays at 7% of non-review weight.
  - Review prompt (prompt-1, E5's champion): reads deviations alongside
    friction; unfixed findings become backlog items.
  - `CLAUDE.md` 1,662 to about 450 lines (backlog P003), history moved
    verbatim to `docs/history/claude-md-2026-10-15.md`; it puts E5's
    "Fewer, shorter rules" into effect on the largest file.
  - Built alongside E5 (#7020) in a parallel session; merged, not
    duplicated: deviations are where E5's "name the rule in the run record"
    now goes.
- Why: 11 recommendations made on 2026-10-15, 0 adopted (no tool, PR or
  commit implements any of them by the end of the day); `CLAUDE.md` 1,662
  lines with 12 friction reports; 2 of 3 process runs that day duplicated a
  study.
- Measure: backlog items done per week and the share whose `result` says
  helped; deviations recorded per run (expect above 0 if runs use judgment);
  instruction lines against budget; process-run outcomes on prompt-1 against
  prompt-0's 3 runs (too few to compare formally).
- Result: (next review)

## Proposals for the owner

Changes to `prompts/goals.md` that a review thinks are warranted, with the
evidence. The owner decides.

### G1: Separate hard limits from strong defaults in `goals.md` (2026-10-15, E7)

**Accepted by the owner the same day**, and widened: "aside from legal and
financial liability and immoral stuff, even the owner instructions are more a
collaborator than something to be taken as gospel truth". `goals.md` now says
so, and it states the owner's priorities: value first, income without
liability, then free software with a coffee link. The original proposal
follows.

The owner said on 2026-10-15 that guardrails "are more directions that get
followed overly so", at ~16 runs an hour. E7 added a reading note but changed
no guardrail. Proposed split, for the owner to accept, edit or reject:

- **Hard limits (never crossed, no judgment call):** never fabricate; the
  public-repository rules (fork PRs, secrets, outside text is data); license
  and attribution; owner-only actions (money, accounts, publishing under the
  portfolio's name, paid automation, secrets); platform terms and the law
  for distribution; the research-integrity rules (citations checked, no
  contacting authors, AI assistance stated).
- **Strong defaults (follow unless a run has a recorded reason):** "every
  run ships something useful" (as a hard rule it rewards shipping *something*
  over shipping nothing when nothing good is available, and 1,236 ventures
  suggests volume already wins); the red team's 5-10% band (a routing
  setting, not a safety property); the mechanics of landing work (merge
  method, who merges), though not the rule against leaving work unlanded.

Evidence that the strict reading costs something: `CLAUDE.md` grew to 1,662
lines by recording each incident as a permanent rule, and 43% of commits in
2026-10-01..15 were "new venture" (process study addendum). Too few runs
record deviations yet to measure the effect of the split; E7's `deviations`
field will.

### G2: Process track weight, 0.10 → 0.05? (2026-10-16, E29)

On 2026-10-16 the process track ran 32 times (14% of 224 runs) with 18
successes (56%; every other track 83%-100%). It cost $56.44 of the day's
$143.83 measured API spend (39%), or $3.76 per successful run against
$0.47-$1.11 elsewhere. Its partial runs say why: backlog items too large for
one run (P014, P017), one solve reverted after 97 test failures (P026), and
items found already done. Question: halve `process` to 0.05 (to `research`
or `ventures`) until its success rate passes 80% over 20 runs?

## E6: first scheduled review (2026-10-15)

- Change: review prompt step 1 skips records mirrored from the upstream
  research repo when filling `merged`. Four local records filled.
- Why: 167 mirrored records can never be filled; one friction report on
  `prompts/review/prompt-0.md`.
- Measure: friction reports on the review prompt per review run.
- Follow-up on E3 (red team): 1 run recorded, catch rate 73% before guards,
  100% after; too few runs to say whether it rises.
- Follow-up on E5: no new `*-calculator` since 2026-10-15; instruction lines
  not yet down (prune in #7021 unmerged at the time of this review); self-deploy
  page exists, adoption not measured. Result: too few runs.
- Research/1 candidate: 1 run against 185 champion runs. Too few runs.
- Result: (next review)

## E8: third review of 2026-10-15

- Change: ventures candidate `prompt-2` replaces the "no near-copies"
  sentence with a command that counts name suffixes of the newest ventures
  (share 0.2). `AGENTS.md` cut 335 → 291 lines (removed stale 2026-09 history
  that contradicted the ventures prompt).
- Why: 11 of the 15 newest ventures are `*-calculator`; AGENTS.md was over
  its budget.
- Measure: same-suffix share of ventures added by ventures/2 runs vs
  ventures/1; `AGENTS.md` friction per run.
- Follow-up on E6: `CLAUDE.md` is 452 lines (prune landed); friction after it
  not yet measurable. Research/1: still 1 run, too few.
- Result: (next review)

## E9: fourth review of 2026-10-15

- Change: `review/prompt-1.md` cut 150 → 128 lines (budget 130): removed the
  first-review backfill step (170+ records exist), tightened drift-audit
  prose, candidates only for tracks with about 10 runs. Filled `merged: true`
  for four local records (PRs 7001, 7019, 7024, 7034), with corrections.
- Why: drift report 2026-10-15-c left "trim review/prompt-1.md" open; two
  friction reports on it (backfill and per-track candidates).
- Measure: friction reports on `prompts/review/prompt-1.md` per review run.
- Follow-up on E8: ventures/2 still has 0 runs against 2 for ventures/1, and
  research/1 has 1 run against 190, so both are too few to judge. Review ran
  twice within an hour (#7034 then this one) because the due counter is
  unchanged by process-track records; not changed here.
- Result: (next review)

## E10: fifth review of 2026-10-15

- Change: `AGENTS.md` 291 → 187 lines ("Ship fast" incident stories moved to
  `docs/history/claude-md-2026-10-15.md`, rules kept). `promptctl measure`
  no longer crashes on free-text `doc_friction`/`deviations` entries; four
  malformed records on `main` (they failed `validate` and the prompt-system
  unit test) were normalised with `corrections` entries.
- Why: `measure` crashed; `validate` was red on `main`; AGENTS.md was over its
  250 budget.
- Measure: `AGENTS.md` friction per run; `validate` stays green.
- Follow-up on E8/E9: ventures/2 (1 run) and research/1 (1 run) still too
  few runs. Review ran five times today because the due counter ignores
  process-track records; owner-visible in the drift report.
- Result: (next review)

## E11: sixth review of 2026-10-15 (due-counter fix)

- Change: `promptctl.runs_since_review` orders records by when git added them
  (ties on date were ordered by random session id, so reviews landing mid-day
  were counted among later runs). Real tree: 37 "runs since review" before,
  5 after. Regression test added.
- Why: six reviews ran in one day; four friction/deviation reports and the
  drift report named the due counter (`prompts/routing.json` friction).
- Measure: reviews per day (expect at most one per ~20 merged runs).
- Follow-up on E8-E10: ventures/2 and research/1 still under 10 runs each;
  no verdict possible. Bulk-mirrored records rank oldest, which is correct.
- Result: (next review)

## E12: seventh review of 2026-10-15

- Change: `CLAUDE.md` gained one line (checklist node suites exceed the tool
  timeout; run them in the background). Three friction reports named it.
- Audit: `platform/deploy` tests re-run: 28/28 pass. No other output was
  auditable locally (most records are mirrored upstream).
- Why: no track has ~10 runs on a candidate (ventures/2: 5, research/1: 4), so
  no promote/retire and no new candidate.
- Measure: `CLAUDE.md` friction reports about test timeouts per run.
- Follow-up on E10/E11: reviews since the due-counter fix: this is the first
  one that routed at 22 merged runs, near the intended 20, so the fix helped.
- Change: `CLAUDE.md` checklist notes (4 lines) that the pages/marketing/deploy
  node suites exceed the tool timeout and must run in the background.
- Why: three friction reports (CLAUDE.md, `unspecified`) hit the 120 s / 10 min
  limit on those lines.
- Measure: timeout reports on those lines per run.
- Follow-up on E8-E11: ventures/2 (4 runs) and research/1 (4 runs) still under
  10 each; no verdict. Audit step skipped: nearly all records are mirrored or
  doc-only. Fixed in earlier E-entries and verified: PRODUCT_PLAYBOOK self-deploy
  line is no longer stale.
- Result: (next review)

## E13: eighth review of 2026-10-15

- Change: `CLAUDE.md` -1 line net: the "Tool timeout" bullet duplicated "Long
  suites" (added by E12); merged into one that also names `git fetch
  --unshallow` and `publish-branch.sh`, which three reports say time out too.
- Why: `CLAUDE.md` is the top friction file (36 reports); shorter beats longer.
- Measure: timeout friction reports on `CLAUDE.md` per run after this review.
- Follow-up on E12: ventures/2 (6 runs) and research/1 (5) still under 10;
  no verdict, no new candidate. Audit skipped again: records are mirrored or
  doc-only. `validate` green on 318 records.
- Result: (next review)

## E14: ninth review of 2026-10-15

- Change: `prompts/review/prompt-1.md` step 2 says mirrored and doc-only runs
  are skipped without counting as friction (eight reports of "nothing
  auditable" came from the review prompt itself). +2 lines.
- Audit: `ventures/meter-keeper` (newest merged venture): 26/26 tests pass,
  README disclaimer and page disclaimer present.
- Why: ventures/2 has 8 runs and research/1 5, still under 10 each, so no
  promote/retire and no new candidate.
- Measure: review/1 friction reports per run about unauditable records.
- Follow-up on E13: no CLAUDE.md timeout reports newer than E13 yet; too few
  runs to judge.
- Result: (next review)

## E15: tenth review of 2026-10-15

- Change: none to prompts or docs. ventures/2 reached 10 runs (90% success, 0.1
  errors/run) against ventures/1 (29 runs, 90%, 0.24): intervals overlap, so no
  promote or retire; research/1 has 7 runs, still under 10. No new candidate
  (both tracks already carry one).
- Audit: skipped; the 21 runs since the last review are mirrored upstream
  research records or doc-only. `merged` backfill skipped for the same reason.
- Drift: no new owner words since the earlier reports today (see
  `prompts/drift/2026-10-15.md`); no instruction file grew past budget
  (`CLAUDE.md` 457/500, `land-your-work.md` at its 160 budget).
- Observation: this is the tenth review today. `runs_since_review` counts
  mirrored upstream records toward `review_every`, which is why reviews keep
  firing at ~20 mirrored runs. Proposal for the next process run: count only
  records whose PR is in this repo.
- Measure: reviews per day should fall once mirrored records stop counting.
- Result: (next review)

## E16: eleventh review of 2026-10-15

- Change: `prompts/process/backlog/README.md` "Closing" now says to commit
  `in_progress` first and flip to `done` once the PR number exists (+2 lines).
- Why: two friction reports (README, `promptctl validate`) hit a red validate
  on the first commit of a run closing an item.
- Measure: backlog-closing friction reports per process run.
- Follow-up on E14: ventures/2 (10 runs) vs ventures/1 (29): intervals overlap,
  keep collecting. research/1 (7) under 10. Audit skipped: records mirrored or
  doc-only. `validate` green on 386 records. No drift report: six already today.
- Result: (next review)

## E17: twelfth review (2026-10-16)

- Change: `promptctl.runs_since_review` no longer counts records mirrored from
  the upstream research repo (they carry `source`); test added. Acts on E15's
  proposal. `land-your-work.md` 169 -> 158 lines (measured-history prose cut;
  budget 160).
- Why: reviews fired on mirrored records no run of this repo produced.
- Measure: reviews per day (the 2026-10-15 count was ten); lines in
  `land-your-work.md`.
- Follow-up on E16: ventures/2 (14 runs, 93%) vs ventures/1 (42, 93%): intervals
  overlap, no verdict. research/1 has 7 runs, under 10. review/1 is 73% over 11
  runs, 0 integrity issues. Audit and `merged` backfill skipped: remaining
  unknown records are mirrored or doc-only.
- Result: (next review)

## E18: measure PR facts and rework instead of typing them (2026-10-16, owner request)

- Change: `prompts/derive.py` (new) measures `merged`, PR size, red-CI
  commits and 14-day rework (reverts, follow-ups, line survival) into
  `prompts/derived/`. `promptctl.summarise` falls back to the measured
  `merged` and reports median survival. Review prompt step 1 runs it instead
  of hand-filling records. Goal: "Measured, not typed" in `goals.md`.
- Why: of 441 records, 31 typed `merged`, 18 `lines_added`, 10
  `wall_minutes` and 5 `cost_usd`. Rework is a scoring measure in
  `goals.md`, and no record had ever carried it.
- Measure: `merged_unknown` in `measure`, before against after the first
  `derive.py build`. Survival per prompt version and model, once rows have
  about 10 closed windows each.
- Result: (next review)

## E19: thirteenth review (2026-10-16)

- Change: `derive.py fetch` no longer crashes when the API returns 403 (a
  session with no `GITHUB_TOKEN`): it keeps the cache, leaves failed PRs
  uncached to retry, and says so. Test added. Fetching 15 PRs filled 13;
  `merged` unknown fell on research/0 (133 -> 129), ventures/1 (26 -> 23),
  process/1 (7 -> 6).
- Why: review step 1 died on its first command in this session.
- Measure: reviews that report a failed `derive.py fetch` in doc_friction.
- Follow-up on E17/E18: ventures/2 (17 runs, 94%) vs ventures/1 (53, 92%):
  intervals overlap, no verdict. research/1 (8 runs) under 10. review/1 75%
  over 12 runs, 0 integrity issues. E18's `merged_unknown` is falling as
  intended; survival is still empty (no closed 14-day windows yet). Audit
  skipped: remaining unknowns are mirrored or doc-only.
- Change: none to prompts or docs; `prompts/derived/runs.json` rebuilt.
  `derive.py fetch` got HTTP 403 from the GitHub API in this session, so the
  rebuild used the cached `github.json`: `merged` for new records stays
  `unknown` until a session with API access runs fetch.
- Candidates: ventures/2 (17 runs, 94%, 0.06 errors/run) vs ventures/1 (53, 92%,
  0.17): intervals overlap, no verdict. research/1 has 8 runs, under 10.
  review/1 is 75% over 12 runs, 0 integrity issues. No new candidate: both
  tracks with candidates already carry one.
- Audit skipped (new records are mirrored upstream or doc-only). Drift: a report
  already exists for 2026-10-16 and no new owner words arrived. `CLAUDE.md`
  grew 457 -> 475 lines (budget 500); cut it next review if it passes 490.
- Follow-up on E17: reviews were due again after 26 merged runs, so the
  mirrored-record exclusion is working as intended (no early firing).
  E18: `merged_unknown` stays high (most rows 'unknown') because fetch needs
  API access; not a failure of derive.py itself.
- Result: (next review)

## E20: stale doc lines from the same review (2026-10-16)

- Change: `CLAUDE.md` checklist no longer states a stale count of expected
  `gitops/tests` failures (said ~26; baseline today was 2); `review/prompt-1.md`
  step 1 says what to do when `derive.py fetch` gets a 403 (+2 lines).
- Why: friction reports on both; 26 runs since the last review.
- Measure: friction reports naming the CLAUDE.md pytest line, and on
  `review/prompt-1.md` step 1, per run after this window.
- Candidates: ventures/2 (17) vs ventures/1 (53): intervals overlap, keep
  collecting. research/1 (8) under 10. Audit skipped: records mirrored or
  doc-only. `derive.py fetch` 403; `merged` left unknown.
- Result: (next review)

## E21: review/2 candidate and BrokenPipe fix (2026-10-16)

- Change: `review/prompt-2.md` (candidate, share 0.2): the audit step says to
  decide first whether anything is auditable and log "nothing auditable" if
  not; step 1 says to run `build` on the cache after a 403. `promptctl.py`
  exits quietly on a closed pipe (`measure | head`).
- Why: review/1 friction (16 reports) is mostly "steps 1-2 unrunnable because
  the remaining records are mirrored or doc-only".
- Measure: friction reports per review run on steps 1-2, review/2 vs review/1.
  Only ~1 review per 20 runs, so expect a slow verdict.
- Candidates this window: ventures/2 (18 runs, 94%) vs ventures/1 (58, 93%):
  intervals overlap, keep collecting. research/1 (10, 100%) vs research/0
  (322, 98%): overlap, keep collecting. review/1: 15 runs, 73%, 0 integrity.
- Audit: nothing auditable (new records mirrored or doc-only). `derive.py fetch`
  fetched 16 of 18 PRs; `merged` still unknown for mirrored records.
- Drift: no new owner words since 2026-10-16b. `CLAUDE.md` 467/500 (down from
  475). See `prompts/drift/2026-10-16c.md`.
- Result: (next review)

## E22: review 2026-10-16 (fourth of the day)

- Change: `.github/prompts/land-your-work.md` adopted-drafts bullet condensed
  (163 -> 159 lines, under its 160 budget). No prompt changes.
- Why: only file over its instruction-line budget; `CLAUDE.md` already fell
  467 -> 391.
- Measure: friction reports naming `land-your-work.md` per run after this window.
- Candidates: ventures/2 (20 runs, 90%) vs ventures/1 (63, 94%): intervals
  overlap, keep collecting. research/1 (12, 100%) vs research/0 (331, 98%):
  overlap, keep collecting. review/2 has 0 runs and review/1 16: first
  review/2 run is this one; too few for a verdict.
- Audit: 3 venture PRs re-run (devsec-toolkit, shift-roster-builder,
  distribution tests): all pass, no corrections. `derive.py fetch` got 19 of
  21 PRs.
- Drift: no new owner words. See `prompts/drift/2026-10-16d.md`.
- Result: (next review)

## E23: review 2026-10-16 (fifth of the day)

- Change: CLAUDE.md checklist gains one line naming
  `gitops/ci/sync_readme_counts.py`. No prompt changes.
- Why: friction on `gitops/ci/README.md`: runs-on count goes stale on every
  new-workflow PR.
- Measure: friction reports naming `gitops/ci/README.md` per run after this.
- Candidates: ventures/2 (20, 90%) vs ventures/1 (63, 92%), research/1 (17,
  100%) vs research/0 (340, 98%): overlap, keep collecting. review/2 has 1 run.
- Audit: 3 areas re-run, all pass. `derive.py fetch` got 21 of 23 PRs.
- Drift: see `prompts/drift/2026-10-16e.md`.
- Result: (next review)

## E24: review 2026-10-16 (sixth of the day)

- Change: `prompt.md` step 1 now says to pass `--track` before running
  `route` when the brief names a task (was after the command; friction: a
  run drew research for an owner-named product brief).
- Measure: friction reports naming `prompt.md` per run after this.
- Candidates: ventures/2 (22, 91%) vs ventures/1 (68, 91%), research/1 (18,
  100%) vs research/0 (348, 98%): overlap, keep collecting. review/2: 2 runs.
- Audit/derive: `derive.py fetch` not run (no token this session); audit
  skipped, recent runs are research/doc-only. Stale friction noted:
  promptctl BrokenPipe is already fixed in main.
- Result: (next review)

## E25: review 2026-10-16 (seventh of the day)

- Change: none to prompts or docs; measurement refresh (`prompts/derived/`)
  and drift report only. Nothing in the friction table was new and fixable
  at low cost, and review/2 has 3 runs.
- Measure: n/a.
- Candidates: ventures/2 (22, 91%) vs ventures/1 (68, 91%), research/1 (18,
  100%) vs research/0 (348, 98%): overlap, keep collecting. review/2: 2 runs.
- Audit: league-schedule-generator re-run, 59 pass. Research audit not
  runnable (no pytest, apt fails).
- Drift: see `prompts/drift/2026-10-16g.md`.
- Result: (next review)

## E26: review 2026-10-16 (eighth of the day)

- Change: none to prompts or docs; `prompts/derived/` refreshed, drift report
  only. Stale friction (PRODUCT_PLAYBOOK, prompts/README) already fixed.
- Candidates: ventures/2 vs ventures/1, research/1 vs research/0: overlap,
  keep collecting. review/2: 3 runs, too few.
- Audit: skipped (doc-only/research runs). `derive.py fetch` got 19 of 21.
- Result: (next review)

## E27: review 2026-10-16 (ninth of the day)

- Change: none to prompts or docs; `prompts/derived/` refreshed, drift report
  only. No new friction that was fixable at low cost.
- Candidates: ventures/2 (25, 88%) vs ventures/1 (78, 87%), research/1 (29,
  100%) vs research/0 (358, 98%): overlap, keep collecting. review/2: 3 runs.
- Audit: business-loan-offer-comparator re-run, 34 pass. `derive.py fetch`
  got 18 of 20.
- Drift: see `prompts/drift/2026-10-16i.md`.
- Result: (next review)

## E28: review 2026-10-16 (tenth of the day)

- Change: `review_every` 20 → 40 in `prompts/routing.json`. Ten reviews fired
  today, most with nothing new to measure (friction on `routing.json`,
  `review/prompt-2.md`).
- Metric: reviews per day, and review runs with no change shipped.
  Compare the next 40 runs against today's.
- Candidates: unchanged, overlap or too few runs.
- Audit: league-schedule-generator, 69 pass. `derive.py fetch` got 16 of 18.
- Drift: see `prompts/drift/2026-10-16j.md`.
- Result: (next review)

## E29: 24-hour review, 2026-10-16 (owner-requested)

- Change: new `platform/ci/pyenv.py` (+7 tests) prints a python that imports
  the named modules, installing with `<it> -m pip` or apt only if none does.
  `CLAUDE.md`'s "No pytest?" line, `verify-and-merge.md` and
  `research/CLAUDE.md` now point at it. Cause: about 20 of the day's 66
  `CLAUDE.md` friction reports were one interpreter split (`python3` on PATH
  is not what pip/apt install into). Also marked the four commands that pass
  the 2-minute tool limit (unshallow, regen.mjs, run_workflow_locally
  --for-changes and --tree) to run in the background: about 14 reports.
- Measure: `CLAUDE.md` friction reports per run naming pytest, numpy, pip,
  interpreter or timeout. Before: 2026-10-16, 224 runs, about 34 such
  reports. Compare the next 100 runs.
- Candidates: unchanged (overlap, or review/2 has 4 runs).
- Audit: shift-roster-builder (7 merges today) re-run, 64 pass; disclaimer
  and usage tracking present.
- Proposal: G2 (process track weight).
- Report: `prompts/drift/2026-10-16k.md`.
- Result: (next review)

## E30b: review, 2026-10-17 (second review that day)

- Change: `promptctl.py measure` hides "By starting message" groups with
  fewer than 3 runs (49 of 60 rows, 52 runs; one line says so). Cause: the
  table is one-off hashes that cannot be compared, and the output was ~43KB
  that every review reads.
- Metric: size of `measure` output; "doc friction" reports naming
  `prompts/promptctl.py` (7 before; the BrokenPipe one was already fixed).
- Candidates: unchanged. ventures 2 and research 1 overlap their champions;
  review/2 has 5 runs.
- Follow-up on E29 (pytest/interpreter/timeout friction on `CLAUDE.md`):
  too few runs to say; the latest `CLAUDE.md` reports are about the
  product checklist being irrelevant to research-only PRs, not the
  interpreter split. Result: (next review)
- E28 (`review_every` 20 → 40): this is the first review since the change, 40 runs
  after the previous one, against ten reviews on 2026-10-16: helped.
- Audit: not run (mirrored or doc-only records); `derive.py fetch` ran and
  built 713 rows.
- Drift: `prompts/drift/2026-10-17b.md`.

## E30: review 2026-10-17

- Change: `land-your-work.md` says cloud sessions without `gh`/GraphQL use the
  GitHub MCP tools to open and merge. Cause: a 2026-10-17 `CLAUDE.md`
  friction report ("merge via PR, but gh GraphQL is blocked").
- Metric: friction reports per run naming gh/GraphQL/MCP. Compare the next 40
  runs.
- Candidates: ventures/2 vs 1, research/1 vs 0 overlap; review/2 has 5 runs.
  Keep collecting.
- Data: `derive.py fetch` got 25 of 46 PRs before the time limit; the rest
  stay null. Audit not run (mirrored or doc-only recent outputs).
- Drift: see `prompts/drift/2026-10-17b.md`.
- Result: (next review)

## E31: review 2026-10-17 (third review that day)

- Change: `research/PROJECTS.md` milestone-9 progress entry cut from ~10.5k
  characters to ~400 (the per-project "followed" changelog is in git history).
  Cause: 68 friction reports, the latest two naming that one line as
  unscannable and hard to edit.
- Metric: friction reports per run naming `research/PROJECTS.md`. Compare the
  next 40 research runs.
- Candidates: unchanged. ventures 2 / research 1 overlap their champions;
  review/2 has 5 runs. process/1 (72%) is low only because its "partial"
  runs are backlog/verify-only; no candidate written.
- Data: `derive.py fetch` got 32 of 470 PRs; the rest stay null. Audit not
  run (mirrored or doc-only recent outputs).
- Drift: `prompts/drift/2026-10-17c.md`.
- Change: `land-your-work.md` trimmed to its 160-line budget (it was over by
  3) and says a swept branch whose content is on `main` needs no PR (4
  reports); backlog README/validate message say `pr: "this"` is accepted for
  a done item whose PR is unopened (3 reports of the second-commit cost).
- Metric: friction reports on `land-your-work.md` and the backlog README per
  run, next 40 runs.
- Candidates: unchanged (ventures 2, research 1 overlap; review/2 has 5).
- Audit: not run (recent records mirrored or doc-only); `derive.py fetch` not
  run, third review in one day.
- Result: (next review)

## E32: review 2026-10-17 (fourth review that day)

- Change: `review/prompt-1.md` says `derive.py fetch` is incremental (~30 PRs
  per call, run once in the background) and that an unrunnable audit is
  expected, not friction. Cause: 24 friction reports on that file, the latest
  three about the fetch limit and the audit.
- Metric: friction reports per run naming `prompts/review/prompt-1.md`.
  Compare the next review.
- Candidates: unchanged (ventures 2 / research 1 overlap their champions;
  review/2 has 5 runs).
- Data: `derive.py fetch` got 25 of 30 PRs; derived/ regenerated. Audit not
  run (recent outputs mirrored or doc-only).
- Drift: `prompts/drift/2026-10-17d.md`.
- Result: (next review)

## E33: review 2026-10-17 (fifth review that day)

- Change: `sync_tree_counts.py` inserts `gitops/tests` on `sys.path` for its
  import, so it runs with no `PYTHONPATH` (3 reports of `No module named
  front_door_mirror`).
- Metric: friction reports naming `platform/ci/sync_tree_counts.py`, next 40 runs.
- Candidates: unchanged (ventures 2 / research 1 overlap; review/2 has 5 runs).
- Data: `derive.py fetch` got 25 of 30 PRs; derived/ regenerated. Audit not
  run (recent outputs mirrored or doc-only).
- Drift: `prompts/drift/2026-10-17e.md`.
- Result: (next review)

## E34: review 2026-10-17 (sixth review that day)

- Change: `research/PROJECTS.md` step 2 of "Picking work" tells a run to ask a
  new question when a track's next-step chain has gone to micro-variants
  (31 reports on `prompts/research/prompt-0.md`, the latest about the
  saturated chain).
- Metric: friction reports about choosing a next step, per research run, next
  40 research runs.
- Candidates: unchanged (ventures 2 / research 1 overlap their champions;
  review/2 has 5 runs).
- Data: `derive.py fetch` got 25 of 30 PRs; derived/ regenerated. Audit not
  run (recent outputs mirrored or doc-only).
- Drift: `prompts/drift/2026-10-17f.md`.
- Result: (next review)
