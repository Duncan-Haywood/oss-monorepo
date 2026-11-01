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

## E35: review 2026-10-18

- Change: none to prompts or docs. Candidates unchanged (ventures 2 / research
  1 overlap their champions; review/2 has 5 runs, fewer than 10). `derived/`
  regenerated; `pyenv.py` friction checked and already fixed on `main`.
- Metric: friction reports naming `research/CLAUDE.md` about `pyenv.py`, next
  40 runs; expect none.
- Drift: `prompts/drift/2026-10-18.md`.
- Result: (next review)

## E36: review 2026-10-18 (second)

- Change: `redteam.py` runs suites with `PYTHONDONTWRITEBYTECODE=1` (stale
  `.pyc` kept serving a same-size mutant).
- Metric: friction reports naming `prompts/redteam/prompt-0.md` about stale
  bytecode, next 20 redteam runs; expect none.
- Candidates: unchanged. Drift: `prompts/drift/2026-10-18b.md`.
- Result: (next review)

## E37: review 2026-10-18 (third)

- Change: `research/PROJECTS.md` "Picking work" step 1 gives the track-draw
  formula (2 reports said the number-to-track mapping was a guess).
- Metric: friction reports about the track draw, next 40 research runs; expect none.
- Candidates: unchanged (ventures 2 / research 1 overlap; review/2 has 6 runs).
  Open friction not fixed: ventures runs report that router top candidates are
  already deep; `allocate.py` needs its own run.
- Result: (next review)

## E38: review 2026-10-18 (fourth)

- Change: `research/_shared/pick_track.py` does the track draw that
  `research/PROJECTS.md` "Picking work" step 1 describes (a report said no
  script did it); the step is now one line plus the command.
- Metric: friction reports about the track draw, next 40 research runs; expect none.
- Candidates: unchanged (ventures 2 / research 1 overlap; review/2 has 6 runs).
  `derived/` regenerated (25 of 29 PRs). Audit not run (recent outputs
  mirrored or doc-only).
- Drift: `prompts/drift/2026-10-18d.md`.
- Result: (next review)

## E39: review 2026-10-18 (fifth)

- Change: no prompt or doc change. Audit sample (recent venture PRs) found
  one shipped regression (#8038, fixed by #8041); added a header/row cell-count
  test to `league-schedule-generator`.
- Metric: audit runs that find a defect in a recent venture PR; the audit is
  runnable when it names a venture with `node --test`.
- Candidates: unchanged. Drift: `prompts/drift/2026-10-18e.md`.
- Result: (next review)

## E40: review 2026-10-18 (sixth)

- Change: `session_gate.py` stale-snapshot reason now says "after your PR
  merges" up front. It used to say "before anything else" and then, three
  sentences later, that the script refuses a work branch (35 friction reports
  on the gate, the latest several on exactly this).
- Metric: friction reports naming `session_gate.py` about the publish order,
  next 20 runs that run the gate; expect none.
- Candidates: unchanged (ventures 2 / research 1 overlap; review/2 has 7 runs).
- Drift: `prompts/drift/2026-10-18f.md`.
- Result: (next review)

## E41: review 2026-10-18 (seventh)

- Change: `research/CLAUDE.md` now says the first `pyenv.py` call takes ~20s and
  prints install chatter on stderr (3 friction reports). The yosys/apt-get
  reports in `CLAUDE.md` friction were already fixed (lines 76-77); measure
  still lists them as latest.
- Metric: friction reports about pyenv first-use time, next 20 research runs; expect none.
- Candidates: unchanged (ventures 2 / research 1 overlap; review/2 has 7 runs).
  `derived/` not regenerated, audit not run (no GitHub API fetch attempted; recent outputs doc-only/research).
- Result: (next review)

## E42: review 2026-10-19

- Change: `research/CLAUDE.md` pyenv note now says first use can take over 2
  minutes and to run it with `run_in_background` (E41 said ~20s; 5 reports
  of a 120s foreground timeout since). `derived/` regenerated (53 PRs).
- Metric: friction reports about pyenv foreground timeouts, next 20 research
  runs; expect none.
- Candidates: unchanged (ventures 2 / research 1 overlap; review/2 has 7 runs).
  Audit not run (recent outputs doc-only or mirrored).
- Drift: `prompts/drift/2026-10-19.md`.
- Result: (next review)

## E43: review 2026-10-19 (second)

- Change: `allocate.py` `rank()` breaks merit ties by least-worked first
  (ledger entries + portfolio mentions, ascending) before name. Top rows were a
  merit tie sorted alphabetically, so every run met the same already-deep
  ventures (reverb, where-to-sell; the top friction in `CLAUDE.md` and
  `ventures/prompt-1.md`). Top 3 now include 0-ledger ventures.
- Metric: "allocator top rows already deep" friction reports, next 20 ventures
  runs; expect fewer.
- Candidates: unchanged. `test_allocate` passes (57 tests).
- Result: (next review)

## E44: review 2026-10-19 (third)

- Change: `platform/ci/pyenv.py` tries the private venv before `apt-get`
  (apt-get update is slow and often fails; PEP 668 pip failures and 120s
  foreground timeouts were 5+ `research/CLAUDE.md` friction reports). Tests pass (10).
- Metric: friction reports about pyenv PEP 668 / timeouts, next 20 research runs; expect none.
- Candidates: unchanged (review/2 has 7 runs; ventures 2 / research 1 overlap).
  Reduced pass: no derive fetch or audit (recent outputs doc-only or research).
- Result: (next review)

## E45: review 2026-10-19 (fourth)

- Change: `prompts/review/prompt-1.md` says a reduced pass (steps 1, 3, 7, 8
  plus one step 5 fix) is a valid scheduled review and not friction; 37
  reports said a full pass is too large for a scheduled run.
- Metric: "full review too large" friction reports on `prompts/review/prompt-1.md`, next 5 reviews; expect none.
- Candidates: unchanged (ventures 2 / research 1 overlap; review/2 has 7 runs).
  Audit and drift report skipped (recent outputs doc-only or research).
- Change: `research/_shared/pick_track.py` says when the drawn track already has
  40+ projects, that a redraw is fine, and names the three emptiest tracks
  (`research/PROJECTS.md` friction: draws landing on saturated tracks 4 and 5
  cost a run its first reads). `derived/` regenerated.
- Metric: "saturated track / micro-variant chain" friction reports in
  `research/PROJECTS.md`, next 20 research runs; expect fewer.
- Candidates: unchanged (review/2 has 7 runs; ventures 2 / research 1 overlap).
  Reduced pass: no audit (recent outputs doc-only or research); no new drift report
  (`prompts/drift/2026-10-19.md` is hours old).
- Result: (next review)

## E46: review 2026-10-19 (fifth)

- Change: `prompts/research/prompt-0.md` claim step greps `git ls-tree` for a
  keyword instead of reading the ~670-line listing (`research/CLAUDE.md` friction).
- Metric: "ls-tree prints ~670 lines" friction reports, next 20 research runs; expect none.
- Candidates: unchanged. Reduced pass: no audit or drift report (hours-old
  report, recent outputs research/doc-only). `pyenv.py` re-checked: works now.
- Result: (next review)

## E47: review 2026-10-19 (sixth)

- Change: none to prompts or docs. `derived/` regenerated (1372 runs). The
  "due counter ignores same-day reviews" friction on `prompts/review/prompt-1.md`
  is already fixed in `promptctl.py` (`route` comment near line 147), so no
  edit; the reports are from runs before that fix.
- Metric: unchanged from E45/E46.
- Candidates: unchanged (ventures 2 / research 1 intervals overlap; review/2 has
  7 runs). Reduced pass: no audit or drift report (hours-old report).
- Result: (next review)

## E48: review 2026-10-19 (seventh)

- Change: `research/CLAUDE.md` pyenv step now tells runs to test-import `pytest`
  along with the project's libraries before skipping the venv (friction: a plain
  attempt failed on missing pytest). The apt-get and `run_in_background`
  reports were already fixed in that file.
- Metric: "pyenv/pytest detour" friction reports on `research/CLAUDE.md`, next 20 research runs.
- Candidates: unchanged (review/2 has 7 runs; ventures 2 / research 1 overlap).
  Reduced pass: no audit or drift report (hours-old report).
- Result: (next review)

## E49: review 2026-10-19 (eighth)

- Change: `prompt.md` step 2 says to retry `create_pull_request` on HTTP 500
  (`prompt.md` friction: two 500s before success, no doc mentioned retrying).
- Metric: "create_pull_request 500" friction reports on `prompt.md`, next 20 runs; expect none.
- Candidates: unchanged (ventures 2 / research 1 intervals overlap; review/2 has
  7 runs). Reduced pass: no audit, drift report or `derived/` regeneration
  (reports hours old, recent outputs research/doc-only).
- Result: (next review)

## E50: review 2026-10-19 (tenth)

- Change: `prompt.md` step 2 gives the `pyenv.py pytest` one-liner (top
  `CLAUDE.md`/`prompt.md` friction: bare `python3` lacked pytest, runs ran tests by hand).
  `derived/` regenerated.
- Metric: "pytest absent" friction reports on `CLAUDE.md`/`prompt.md`, next 20 runs.
- Candidates: unchanged (review/2 has 8 runs; ventures 2 / research 1 overlap).
  Reduced pass: no audit or drift report (hours-old report).
- Result: (next review)

## E51: review 2026-10-20

- Change: `research/CLAUDE.md` intro names the root `CLAUDE.md` rules that still
  apply to research (public-repository and landing rules), not only the ones that
  do not (`prompt.md` friction: took a read to reconcile). `derived/` regenerated
  (1513 runs).
- Metric: "root CLAUDE.md reconcile" friction reports on `prompt.md`/`research/CLAUDE.md`, next 20 research runs.
- Candidates: unchanged (review/2 has 8 runs; ventures 2 / research 1 intervals
  overlap). Reduced pass: no audit or drift report (hours-old report).
- Result: (next review)

## E52: review 2026-10-20 (second)

- Change: `prompt.md` step 1 says which track an owner request that fits none
  takes (`prompt.md`/`routing.json` friction: 3 reports of forcing a track with
  no rule).
- Metric: "no track fits owner task" friction reports on `prompt.md`, next 20 runs.
- Candidates: research/1 vs 0: `measure` says retire (1 integrity issue in 110
  runs vs 4 in 618), but the one issue is a self-disclosed caveat (search-excerpt
  figures marked in the data and README), not a violation; success is 100% vs
  98%. Kept, 0.2 share. ventures 2 / review 2 unchanged (overlap, under 10 runs).
  Reduced pass: no audit, drift report or `derived/` regeneration.

## E53: guidance map and layers, 2026-10-20 (owner-requested, not a review)

- Change: one map of the guidance (`prompts/SYSTEM.md`, `prompts/system.json`,
  `promptctl.py map`), with seven layers and precedence. `validate` now fails
  on a guidance file that has no map entry. `INSTRUCTION_FILES` and the budgets
  are read from the map. Operational detail moved down a layer: from
  `CLAUDE.md`, "Reading CI" went to `verify-and-merge.md`, "Duplicate PRs" to
  `duplicate-work.md`, and the hosting state to `portfolio/hosting/README.md`.
  The cloud-container notes, which had been copied into `CLAUDE.md`,
  `prompt.md` (the E49 and E50 lines) and `land-your-work.md`, went to one
  file, `cloud-session.md`. `CLAUDE.md` went from 360 to 306 lines.
- Metric: the share of runs whose `doc_friction` names `CLAUDE.md`,
  `prompt.md` or `land-your-work.md` on gh/MCP, shallow clones, pytest or
  long commands, over the next 200 runs. The baseline (keyword matches, an
  upper bound) is, out of 1,491 runs since 2026-10-14: long commands 69,
  pytest 48, shallow 34, gh/MCP 23. E49 and E50 are now judged on
  `cloud-session.md`, which `prompt.md` links to. Also: any friction item that
  says a moved fact could not be found.
- Evidence strength: a before-and-after comparison, not A/B.
- Result: (next review)

## E54: review 2026-10-20 (reduced pass, 12:xx)

- Change: `verify-and-merge.md` line for `--for-changes` now says what to do
  when it stalls (docs-only diff, or a diff reaching 100+ workflows): run the
  reached workflows by name. Five friction reports in the window (the latest
  three on 2026-10-20) describe the stall.
- Metric: friction reports naming `run_workflow_locally.py --for-changes`
  stalling, per run, over the next 40 runs (baseline 5 in 1,658).
- Decisions: research candidate 1 kept again (116 runs, 99% vs 98% success; its
  one integrity issue is the disclosed search-excerpt caveat the retire rule
  counts). ventures 2 and review 2 unchanged (intervals overlap / under 10
  runs). `derived/` regenerated. No audit or drift report (reduced pass).
- Result: (next review)

## E55: review 2026-10-20 (reduced pass, evening)

- Change: none to prompts. `derived/` regenerated. A fix to the retire rule in
  `promptctl.py verdict` (retire on integrity issues only at two or more, since
  one self-disclosed caveat on research/1 keeps firing it) was blocked by the
  auto-mode classifier twice (this run and draft PR #8901), so it is a proposal.
- Proposal for the owner: allow `verdict` to require 2+ integrity issues before
  "retire: more integrity issues". Three review friction reports on 2026-10-20
  describe the manual look it costs each review.
- Decisions: research candidate 1 kept (99% vs 98% success). ventures 2 and
  review 2 unchanged (overlap / under 10 runs). No audit or drift report
  (reduced pass).
- Result: (next review)

## E57: review 2026-10-20 (reduced pass, night)

- Change: `portfolio/router/allocate.py` prints the first 500 characters of a
  flagship's `next:` in the work queue and points at `flagships.yaml` for the
  rest (84 friction reports on the file, mostly the multi-KB blob per row).
  `test_allocate.py` passes (73 tests). `derived/` regenerated.
- Metric: friction reports naming allocate.py output size, per run, over the
  next 40 runs (baseline 84 in 1,770, most of them the blob).
- Decisions: research candidate 1: the verdict says retire on one integrity
  issue (the disclosed search-excerpt caveat); kept, as in E54/E55, and the
  `verdict` fix remains a proposal for the owner (E55). ventures 2 and review 2
  unchanged (overlap / under 10 runs). No audit or drift report (reduced pass).

## E56: review 2026-10-20 (night)

- Change: `runcost.py attach` takes `--human-hours`/`--human-basis` as optional
  (basis still required with hours); `prompt.md` says so (and is back to its
  100-line budget). Scheduled runs skipped the whole cost step because the
  human-hours estimate had no basis, losing tokens and dollars with it
  (`prompt.md`/`runcost.py`: ~46 and 3 friction/deviation reports).
- Metric: share of new records with a `usage` block, over the next 40 runs
  (baseline: median API $ measured for about 55% of runs in `measure`).
- Decisions: ventures 2 and review 2 unchanged (intervals overlap / 8 runs).
  Research candidate 1: the retire suggestion fires on one disclosed caveat
  (see E55); kept, 99% vs 98% success. `derived/` regenerated. No audit
  (reduced pass), no new candidate.
- Result: (next review)

## E58: review 2026-10-21 (reduced pass)

- Change: `CLAUDE.md` says to fetch branches with `--depth=40` (a bare fetch
  pulled ~5 GB); `research/CLAUDE.md` names the exact `--write` command instead
  of "step 4's" (reported as pointing at a flag `build.py` lacks). `derived/`
  regenerated.
- Metric: friction reports on those two lines, per run, over the next 40 runs.
- Decisions: research candidate 1 kept (the retire verdict still fires on the
  one disclosed caveat; see E55). ventures 2 and review 2 unchanged (overlap /
  under 10 runs). No audit or drift report (reduced pass).
- Result: (next review)

## E59: review 2026-10-21 (reduced pass, morning)

- Change: `.github/prompts/verify-and-merge.md` makes the `pgrep -f` trap a
  bold "never" with its error count (it was a subordinate clause; 18
  run-record errors came from it).
- Metric: run-record errors naming `pgrep`, over the next 40 runs (baseline: 18).
- Decisions: research candidate 1 kept (the retire verdict still fires on the
  one disclosed caveat; see E55). ventures 2 and review 2 unchanged (overlap /
  under 10 runs). No derive fetch, audit or drift report (reduced pass).
- Change: `prompts/research/prompt-0.md` and `research/PROJECTS.md` no longer
  hard-code "nineteen tracks" (there are 21; a count in prose drifts). `derived/`
  regenerated.
- Metric: friction reports saying the track count is stale, over the next 40 runs.
- Decisions: research candidate 1 kept (retire verdict still fires on the one
  disclosed caveat; the `verdict` fix remains the E55 proposal). ventures 2 and
  review 2 unchanged (overlap / 9 runs). No audit or drift report (reduced pass).
- Result: (next review)

## E60: review 2026-10-21 (reduced pass, afternoon)

- Change: `CLAUDE.md` ("Hosting") and `portfolio/hosting/README.md` ("What is
  served now") name `duncan-haywood.github.io/oss-monorepo/`; the old
  `/monorepo-projects/` path 404s since the repo rename (2 reports today; the
  full URL sweep is the owner's draft PR #8592, left alone).
- Metric: friction reports that the Hosting URL is wrong, over the next 40 runs
  (baseline: 2).
- Decisions: research candidate 1 kept (retire verdict still fires on the one
  disclosed caveat; E55). ventures 2 and review 2 unchanged (overlap / 9 runs).
  `derived/` regenerated. No audit or drift report (reduced pass).
- Result: (next review)

## E61: review 2026-10-21 (full pass, evening)

- Change: process candidate 2 (`prompts/process/prompt-2.md`, share 0.2): after
  the first split row lands, take up to three rows in one run. Cause: 19 of 70
  process runs since 2026-10-20 ended `partial` on one-deletion slices.
- Change: `steering.md` "improvement loop" cut from 17 to 7 lines (duplicated
  `process/prompt-1.md`); 171 -> ~161 lines. `derived/` regenerated.
- Metric: process/2 `partial` rate vs process/1 (baseline 27%), once each has
  10+ runs; `steering.md` friction reports (baseline 0 this window).
- Decisions: research candidate 1 kept (retire verdict fires only on the one
  disclosed caveat; E55). ventures 2 (90% vs 89%, overlap) and review 2 (9
  runs) unchanged. Audit clean (3 PRs); drift report `drift/2026-10-21.md`.
- Result: (next review)

## E62: review 2026-10-21 (reduced pass, night)

- Change: `.github/prompts/cloud-session.md` ("Python and tests") says to
  install with `"$PY" -m pip` and not to run two pip installs at once (1 report
  today: pip went to python3.13, concurrent installs corrupted the env).
  `derived/` regenerated.
- Metric: friction reports about pip/python version mismatch, over the next 40
  runs (baseline: 1).
- Decisions: research candidate 1 kept (retire verdict still fires only on the
  one disclosed caveat; E55 proposal stands). ventures 2 (overlap), process 2 (1
  run) and review 2 (10 runs, 100% vs 90%, overlap) unchanged. No audit or
  drift report (reduced pass).
- Result: (next review)

## E63: review 2026-10-21 (reduced pass, late night)

- Change: `prompts/redteam/prompt-0.md` gives a cutoff for slow suites
  (`--timeout`; pick another target when baseline x mutants > ~20 min). Cause:
  3 reports today of changepoint-detector campaigns past 10-30 min. `derived/`
  regenerated.
- Metric: redteam/prompt-0 friction about slow suites, over the next 40 runs
  (baseline: 3).
- Decisions: research candidate 1 kept (E55 caveat); ventures 2, process 2
  and review 2 unchanged (overlap / too few runs). No audit or drift report
  (reduced pass; the 2026-10-21 report stands).
- Result: (next review)

## E64: review 2026-10-21 (reduced pass, late night)

- Change: `.github/prompts/cloud-session.md` gains "Browser and process
  tools": the Playwright/Chromium env vars for cloud sessions and the
  `pkill -f` self-kill trap (2 reports each in the last day). `derived/`
  regenerated (`fetch` ran).
- Metric: friction reports about playwright paths or `pkill`, over the next 40
  runs (baseline: 2 and 1).
- Decisions: research candidate 1 kept (retire verdict still fires only on the
  one disclosed caveat; E55 proposal stands). ventures 2, process 2 and review
  2 unchanged (overlap / too few runs). No audit or drift report (reduced
  pass; four reviews already ran today).
- Result: (next review)

## E65: review 2026-10-22 (reduced pass)

- Change: `prompt.md` trimmed from 103 to 102 lines, budget 100 (the explore/creative
  paragraph no longer restates percentages that live in `routing.json`).
  `derived/` regenerated (`fetch` ran, 25 of 43 PRs before its time cap).
- Metric: Instruction lines for `prompt.md` (baseline 103, budget 100) and
  friction reports against it, over the next 40 runs (baseline: 54 total).
- Decisions: research candidate 1 kept (retire verdict still fires only on the
  one disclosed caveat; E55 proposal stands). ventures 2, process 2 and review
  2 unchanged (overlap / too few runs). No audit or drift report (reduced
  pass; the 2026-10-21 report stands).
- Result: (next review)

## E66: review 2026-10-22 (reduced pass)

- Change: `portfolio/flagships.yaml` ai-bookkeeper `next:` cut from 18.7k to
  about 1.1k characters: open items only, landed history left to the README and
  git. Cause: 3 friction reports today that it was a duplicated run-on. The
  other flagships' `next:` (changepoint-detector 10.5k, einvoice-preflight 8k)
  are the same shape and are the next cut.
- Metric: friction reports against `portfolio/flagships.yaml`, over the next
  40 runs (baseline: 32 total, 3 on ai-bookkeeper today).
- Decisions: research candidate 1 kept (retire verdict still fires only on the
  one disclosed caveat; E55 proposal stands). ventures 2, process 2 and review
  2 unchanged (overlap / too few runs). `derived/` regenerated (`fetch` ran,
  25 of 44 PRs). No audit or drift report (reduced pass).
- Result: (next review)

## E67: review 2026-10-22 (reduced pass)

- Change: `portfolio/flagships.yaml` einvoice-preflight `next:` cut from about
  7.5k to 0.6k characters: open items only, landed history left to the README
  and git (the follow-up E66 named). changepoint-detector's `next:` is the
  remaining long one.
- Metric: friction reports against `portfolio/flagships.yaml`, over the next
  40 runs (baseline: 40 total; E66's ai-bookkeeper cut is in the same window).
- Decisions: research candidate 1 kept (retire verdict still fires only on the
  one disclosed caveat; E55 proposal stands). ventures 2, process 2 and review
  2 unchanged (overlap / too few runs). `derived/` regenerated (`fetch` ran,
  25 of 43 PRs). No audit or drift report (reduced pass).
- Result: (next review)

## E68: review 2026-10-22 (reduced pass)

- Change: `portfolio/flagships.yaml` changepoint-detector `next:` cut from about
  11k to 0.4k characters: open items only, landed history left to the README
  and git (the follow-up E67 named; all three long `next:` fields are now cut).
- Metric: friction reports against `portfolio/flagships.yaml`, over the next
  40 runs (baseline: E66/E67 window).
- Decisions: research candidate 1 kept (retire verdict still fires only on the
  one disclosed caveat; E55 proposal stands). ventures 2, process 2 and review
  2 unchanged (overlap / too few runs). `derived/` regenerated. No audit or
  drift report (reduced pass).
- Result: (next review)

## E69: review 2026-10-22 (reduced pass)

- Change: `portfolio/flagships.yaml` wall-framing-takeoff `next:` cut from
  about 5k to 0.6k characters: open items only, landed history left to the
  README and ROADMAP (the follow-up after E66 and E67). changepoint-detector's
  `next:` is the remaining long one.
- Metric: friction reports against `portfolio/flagships.yaml`, over the next
  40 runs (baseline: 42 total; E66 and E67 cuts are in the same window).
- Decisions: research candidate 1 kept (retire verdict still fires only on the
  one disclosed caveat; E55 proposal stands). ventures 2, process 2 and review
  2 unchanged (overlap / too few runs). `derived/` regenerated. No audit or
  drift report (reduced pass).
- Result: (next review)

## E71: review 2026-10-22

- Change: `prompts/steering.md` cut from 161 to 136 lines (budget 120): the
  rule/guideline example table, the "habits" list, the JSON deviation example
  and the Measuring paragraph folded into the prose that already says the same.
  `prompt.md` closing paragraph rewrapped.
- Metric: `measure` "Instruction lines" for steering.md and friction reports
  naming it, over the next 40 runs (baseline: 0 friction reports on it; the
  cut is for read cost, not for a known failure).
- Decisions: research candidate 1 kept (retire verdict fires on one disclosed
  integrity caveat; E55 proposal stands). ventures 2, process 2, review 2
  unchanged (overlap / too few runs). `derived/` regenerated (fetch ran, 50 PRs).
## E70: review 2026-10-22 (reduced pass)

- Change: `prompts/review/prompt-1.md` step 1 now names `measure --section`
  (it exists; the last four reviews still reported "measure is 50KB+ with no
  section flag").
- Metric: friction reports against `prompts/review/prompt-1.md` saying
  measure has no section flag, over the next 40 runs (baseline: 4 recent).
- Decisions: research candidate 1 kept (retire verdict fires on 1/154 vs 5/790
  integrity issues, a 0.0065 vs 0.0063 difference, not a real gap; E55
  proposal stands). ventures 2, process 2 and review 2 unchanged (overlap /
  too few runs). `derived/` regenerated (50 PRs). No audit or drift report
  (reduced pass).
- Result: (next review)

## E72: review 2026-10-23 (reduced pass)

- Change: `.github/prompts/cloud-session.md` "Python and tests" gained a
  3-line fallback for when `pyenv.py` fails (PEP 668, import name differing
  from the pip name): a plain venv, in the background.
- Metric: friction reports against `platform/ci/pyenv.py` or
  `research/CLAUDE.md` about pyenv/PEP 668 failures, over the next 40 runs
  (baseline: 5 recent on pyenv.py, 3 on research/CLAUDE.md today).
- Decisions: research candidate 1 kept (retire verdict fires on 1/158 vs 5/799
  integrity issues, 0.0063 vs 0.0063, not a real gap; E55 proposal stands).
  ventures 2, process 2 and review 2 unchanged (overlap / too few runs).
  `derived/` regenerated. No audit or drift report (reduced pass).
- Result: (next review)

## E73: review 2026-10-23 (reduced pass, second run)

- Change: `.github/prompts/cloud-session.md` "Long commands" gained one
  sentence: don't chain a long command with commit/push in one call, and use
  absolute paths for `rm -rf` after a `cd` (the safety check rejects relative
  globs).
- Metric: friction reports against `CLAUDE.md` about long commands delaying a
  commit or a blocked relative-glob `rm`, over the next 40 runs (baseline: 2
  recent).
- Decisions: research candidate 1 kept (same non-gap on integrity issues as
  E72; E55 proposal stands). ventures 2, process 2 and review 2 unchanged
  (overlap / too few runs). `derived/` regenerated. No audit or drift report
  (reduced pass).
- Result: (next review)

## E74: review 2026-10-23 (reduced pass, third run)

- Change: `.github/prompts/cloud-session.md` "Outbound hosts" gained one
  sentence: when a research next step needs a host that 403s, take another
  next step or source instead of working around it.
- Metric: friction reports on `research/PROJECTS.md` about next steps that
  need unreachable hosts, over the next 40 runs (baseline: 1 recent).
- Decisions: all four candidates keep collecting (intervals overlap / too
  few runs). `derived/` rebuilt from a partial fetch. No audit or drift
  report (reduced pass).
- Change: `CLAUDE.md` cloud-session pointer gained one clause: irs.gov,
  ssa.gov and data hosts often 403 through the proxy, probe first ("Outbound
  hosts" in `cloud-session.md`). Friction named CLAUDE.md for this
  (flagship items say "check against official sources").
- Metric: friction reports against `CLAUDE.md` or `research/PROJECTS.md` about
  blocked hosts discovered late, over the next 40 runs (baseline: 2 recent).
- Decisions: all four candidates kept (intervals overlap / too few runs).
  `derived/` rebuilt from the partial fetch (25/44 PRs). No audit or drift
  report (reduced pass).
- Change: `research/CLAUDE.md` gained a 3-line note that `wntr` `run_sim`
  writes `temp.*` in the cwd, so parallel EPANET runs need a distinct
  `file_prefix`.
- Metric: friction reports against `research/CLAUDE.md` about simulator temp
  files colliding, over the next 40 runs (baseline: 1 today).
- Decisions: all four candidates (ventures 2, research 1, process 2, review 2)
  unchanged: intervals overlap, or fewer than 10 runs. `derived/` regenerated.
  No audit or drift report (reduced pass).
- Result: (next review)

## E75: review 2026-10-23 (reduced pass, fourth run)

- Change: `.github/prompts/cloud-session.md` note on the process-kill hook
  trap now says the `pgrep` form is refused too (friction on
  `research/CLAUDE.md` reported two retries on the rejection).
- Metric: friction reports about that hook rejection, over the next 40 runs
  (baseline: 1 recent).
- Decisions: all four candidates keep collecting (intervals overlap / too
  few runs). `derived/` rebuilt. No audit or drift report (reduced pass).
- Result: (next review)

## E76: review 2026-10-23 (reduced pass, fifth run)

- Change: `CLAUDE.md` cloud-session pointer names the working
  `node --test '*.test.mjs'` form (friction on `CLAUDE.md`: `node --test .`
  fails; the fix lived only in `cloud-session.md`).
- Metric: friction reports about `node --test .` failing, over the next 40
  runs (baseline: 1 recent). Checked `session_gate.py` publish-branch friction:
  already fixed, so no change.
- Decisions: all four candidates keep collecting (intervals overlap / too few
  runs). `derived/` rebuilt (2524 rows). No audit or drift report (reduced pass).
- Result: (next review)

## E77: review 2026-10-23 (reduced pass, sixth run)

- Change: `.github/prompts/cloud-session.md` "Long commands" gained a two-line
  recipe for waiting with `Monitor` (until-loop on the output file, `echo DONE`
  at the end); friction on `prompt.md` and `research/CLAUDE.md` said waiting
  with `sleep` blocked was awkward.
- Metric: friction reports about waiting on background jobs, over the next 40
  runs (baseline: 2 recent).
- Decisions: all four candidates keep collecting (intervals overlap / too few
  runs). `derived/` rebuilt (2572 rows). No audit or drift report (reduced pass).
- Result: (next review)

## E78: review 2026-10-23 (reduced pass, seventh run)

- Change: `CLAUDE.md` pyenv pointer notes the first install can exceed the
  120 s tool timeout and should run in the background (friction on
  `research/CLAUDE.md`: pyenv.py took >120 s in the foreground).
- Metric: friction reports about pyenv.py foreground timeouts, over the next 40
  runs (baseline: 1 recent). The `sleep`/Monitor friction is already covered by
  `cloud-session.md` "Long commands", so no change.
- Decisions: all four candidates keep collecting (intervals overlap / too few
  runs). No audit or drift report (reduced pass).
- Result: (next review)

## E79: review 2026-10-24 (chronicle and lessons pass)

- Change: owner asked for a documentation review "from a chronicalling and
  lesson pov". `portfolio/hosting/README.md` rewritten as current state plus
  one-line lessons (362 → 122 lines); the old text moved verbatim to
  `docs/history/hosting-2026-08-25-to-10-24.md`; new `docs/history/README.md`
  indexes every history file with its lesson. Stale deploy-first advice fixed
  in `session_gate.py`, `allocate.py`, `AGENTS.md`, `PRODUCT_PLAYBOOK.md`,
  `DEVELOPMENT_QUALITY.md`. Report:
  `docs/reports/2026-10-24-reference-docs-are-not-chronicles.md`.
- Metric: friction reports naming `portfolio/hosting/README.md` or stale
  hosting/deploy-first advice, over the next 40 runs (baseline: count at the
  next review; a docs change is judged before/after, not A/B).
- Decisions: no candidate scoring this run (brief was a docs review).
- Result: (next review)

## E80: review 2026-10-24 (reduced pass, eighth run)

- Change: retired research candidate 1 (`routing.json`: candidate `null`,
  share 0): 3 integrity issues in 184 runs against 7 in 877 for the champion,
  and `measure` suggests retire. Small counts, so the call is soft; success
  rates are level (97% vs 98%). `prompt.md` trimmed from 103 to the 100-line
  budget (friction: 2 reports said it was over budget).
- Metric: `prompt.md` over-budget friction reports, over the next 40 runs
  (baseline: 2 recent). Research integrity issues per run on champion 0.
- Decisions: ventures 2, process 2, review 2 keep collecting (intervals
  overlap). No audit or drift report (reduced pass).
- Result: (next review)

## E81: review 2026-10-24 (reduced pass, ninth run)

- Change: `prompts/review/prompt-1.md` step 1 now says `derive.py fetch` takes
  2 to 5 min and how to wait for it (friction: 3 reports on fetch stalls and
  blocked waits). Regenerated `prompts/derived/`.
- Metric: `derive.py fetch` friction on review prompts, over the next 40 runs
  (baseline: 3 recent).
- Decisions: ventures 2, process 2, review 2 keep collecting (intervals
  overlap). E78 and E80 results: too few runs since. No audit or drift
  report (reduced pass).
- Result: (next review)

## E82: review 2026-10-24 (reduced pass, tenth run)

- Change: `prompts/review/prompt-1.md` trimmed from 136 to 129 lines, under the 130 budget
  (friction: "File is 139 lines vs 130 budget").
- Metric: over-budget friction reports on review prompts, over the next 40
  runs (baseline: 1 recent).
- Decisions: ventures 2, process 2, review 2 keep collecting (intervals
  overlap). No audit or drift report (reduced pass). E80 and E81 results: too
  few runs since.
- Result: (next review)

## E83: review 2026-10-24 (reduced pass, eleventh run)

- Change: none to prompts or docs. Candidates re-measured: ventures 2,
  process 2 and review 2 are all "keep collecting" (intervals overlap).
  Regenerated `prompts/derived/`. Top friction files are unchanged from E81;
  the live items are owner rows and the already-fixed entries in the process
  prompt's friction list (107 reports), a `measure` presentation problem.
- Metric: none new. E79, E80 and E81 results stay open: too few runs since.
- Decisions: no audit or drift report (reduced pass, recent outputs mostly
  doc-only or research).
- Result: (next review)

## E84: review 2026-10-24 (reduced pass, twelfth run)

- Change: none to prompts or docs. Candidates re-measured after regenerating
  `prompts/derived/`: ventures 2, process 2 and review 2 are all "keep
  collecting" (intervals overlap). The friction table already hides
  since-changed reports (`promptctl.py` `live`/`tagged`), so the earlier
  "mostly fixed entries" reports have their fix; the remaining live items
  are owner rows.
- Metric: none new. E79 to E83 results stay open: too few runs since.
- Decisions: no audit or drift report (reduced pass).
- Result: (next review)

## E85: review 2026-10-24 (reduced pass, thirteenth run)

- Change: none to prompts or docs. Candidates re-measured after regenerating
  `prompts/derived/`: ventures 2, process 2 and review 2 are all "keep
  collecting" (intervals overlap). Checked the "pyenv.py output needed tail -1"
  report: `platform/ci/pyenv.py` already prints only the path on stdout
  (progress goes to stderr), so nothing to fix.
- Change: none to prompts or docs. Regenerated `prompts/derived/`.
  Candidates re-measured: ventures 2, process 2 and review 2 are all "keep
  collecting" (intervals overlap). Checked the "pyenv.py output needed
  `tail -1`" friction in `prompt.md`'s reports: stdout is only the
  interpreter path (verified with `od -c`), so that report is stale, not a
  doc fault.
- Metric: none new. E79 to E84 results stay open: too few runs since.
- Decisions: no audit or drift report (reduced pass).
- Result: (next review)

## E86: review 2026-10-25 (reduced pass, fourteenth run)

- Change: none to prompts or docs. Regenerated `prompts/derived/`. Candidates
  re-measured: ventures 2, process 2 and review 2 are all "keep collecting"
  (intervals overlap). Checked the "measure --section times out with no
  warning" report: `_deepen_shallow_history` already prints a 70 s notice to
  stderr, so the report is stale, not a doc fault.
- Metric: none new. E79 to E85 results stay open: too few runs since.
- Decisions: no audit or drift report (reduced pass).
- Result: (next review)

## E87: review 2026-10-25 (reduced pass, fifteenth run)

- Change: `prompts/research/prompt-1.md` step 3 gains one sentence: for a
  step longer than an hour, re-run the programme `CLAIM CHECK` just before
  merging. Reason: three live reports in 24 h (`research/PROGRAMMES.md`,
  `prompts/research/prompt-0.md`, `prompts/research/prompt-1.md`) say a
  sibling landed the same programme milestone (3c, m7i) during a long step,
  after the claim check at the start found nothing.
- Metric: duplicated programme milestones reported in research
  `doc_friction`; compare the next 15 research runs against the 3 in the
  last day.
- Candidates re-measured after regenerating `prompts/derived/`: ventures 2,
  process 2 and review 2 all "keep collecting" (intervals overlap).
- Decisions: no audit or drift report (reduced pass).
- Result: (next review)

## E88: review 2026-10-25 (reduced pass, sixteenth run)

- Change: none to prompts or docs. Regenerated `prompts/derived/`. Candidates
  re-measured: ventures 2, process 2 and review 2 all "keep collecting"
  (intervals overlap). Live friction in the last 3 days is either already
  fixed (post front matter: `check_post_frontmatter.py`) or an environment
  hook report (`block_pkill_f.py`) with no clear doc fix.
- Metric: none new. E79 to E87 results stay open: too few runs since.
- Decisions: no audit or drift report (reduced pass).
- Result: (next review)

## E89: review 2026-10-25 (reduced pass, seventeenth run)

- Change: none to prompts or docs. Regenerated `prompts/derived/`. Candidates
  re-measured: ventures 2, process 2 and review 2 all "keep collecting"
  (intervals overlap). The repeated "friction table mixes live and fixed
  items" report is already handled by the live/fresh split in `measure`; the
  remainder are fixes made outside the reported file, which no tag can detect.
- Metric: none new. E79 to E88 results stay open: too few runs since.
- Decisions: no audit or drift report (reduced pass).
- Result: (next review)

## E90: review 2026-10-26 (reduced pass, eighteenth run)

- Change: none to prompts or docs. Regenerated `prompts/derived/`. Candidates
  re-measured: ventures 2, process 2 and review 2 all "keep collecting"
  (intervals overlap).
- Finding, not fixed: `platform/pages/writing.mjs` `loadPosts` checks that a
  post's date matches its file name but not that it is on or before today, so
  the 30 posts in `docs/posts/` dated 2026-10-27 to 2026-10-29 are already in
  the feed, Atom `<updated>` and `llms.txt`. Hiding them would drop 30 posts
  from the site, which the owner's "more posts per day" direction argues
  against, so this needs a decision: filter future dates, or keep and accept
  that dates run ahead. Left as a one-line question for the next process run.
- Metric: none new. E79 to E89 results stay open: too few runs since.
- Decisions: no audit or drift report (reduced pass).
- Result: (next review)

## E91: review 2026-10-26 (reduced pass, nineteenth run)

- Change: `loadPosts` in `platform/pages/writing.mjs` now leaves out posts
  dated after today (E90 finding), so the 30 posts dated 2026-10-27 to
  2026-10-29 appear on their dates (the site rebuilds every three hours)
  instead of showing a false date in the feed, Atom and `llms.txt`. No post is
  deleted. Test added in `writing.test.mjs`.
- Metric: none for prompts. Check the feed on 2026-10-27 shows them.
- Decisions: no audit or drift report (reduced pass).
- Result: (next review)

## E92: review 2026-10-26 (reduced pass, twentieth run)

- Change: `_landing_order` in `prompts/promptctl.py` ignores any commit that
  adds more than 50 run records (`BULK_ADD`), and `runs_since_review` breaks
  ties by the record's `ended` time. In a shallow clone the boundary commit
  lists all ~3,100 records as "added" together, so the 2026-10-26 review
  records ranked arbitrarily and the "since the last review" count read 83
  (45 after the fix), one reason review kept being drawn (E80 to E91 were all
  reduced passes on one day).
- Metric: fewer than one review per ~40 merged runs; compare review count per
  day over the next 3 days.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting"; no audit or drift report (reduced pass).
- Result: (next review)

## E95: review 2026-10-26 (reduced pass, twenty-first run)

- Change: deleted `research/lowcomm-training/tests/test_lowcomm.py`, the
  superseded numpy-model suite whose 7 tests failed on main
  (`lowcomm.model.Config` no longer exists; three live friction reports);
  `tests/test_harness.py` covers the torch harness. `prompts/review/prompt-1.md`
  now says to run `derive.py fetch && build` as its own background command
  (live friction: chaining it blew the 120 s tool timeout).
- Metric: friction reports naming `prompts/review/prompt-1.md` about derive
  timeouts, and `lowcomm-training/tests` reports; compare the next 3 days.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting"; no audit or drift report (reduced pass).
- Result: (next review)
- Change: none to prompts or code. Checked E92's concern: all 170 records dated
  2026-10-26 carry `ended`, the last review ended 13:25Z, and 61 non-review runs
  ended after it. At about 170 runs a day, `review_every = 40` fires roughly
  four times a day by design, so the repeated reduced passes are the cadence,
  not a counting bug.
- Metric: none new. Open question for the owner or a process run: raise
  `review_every` (e.g. to 150) if four reduced reviews a day add little.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting"; no audit or drift report (reduced pass).
- Result: (next review)

## E94: review 2026-10-26 (reduced pass, twenty-second run)

- Change: `prompts/review/prompt-1.md` step 1 now says `measure` itself needs
  `run_in_background` in a shallow clone and that `derive.py fetch && build`
  runs as its own command. Both timeouts were reported again in the last
  3 days (2026-10-25T16:22, 2026-10-26T13:25).
- Metric: "review/prompt-1.md" friction reports about the 120 s timeout;
  compare the next 40 runs.
- Decisions: candidates still "keep collecting: the intervals overlap". No
  derive fetch, audit or drift report (reduced pass).
- Result: (next review)

## E96: review 2026-10-27 (reduced pass, twenty-third run)

- Change: `research/CLAUDE.md` now documents the missing `pdflatex` (texlive
  install about 10 min, needs `apt-get update` first), beside the yosys line.
  Re-ran `derive.py fetch && build` (3279 rows, committed).
- Metric: "TeX is not in the image" friction reports naming `research/CLAUDE.md`;
  compare the next 40 runs (8 live in the last 3 days, 2 about TeX).
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting: the intervals overlap"; no audit or drift report (reduced pass).
- Result: (next review)

## E97: review 2026-10-27 (reduced pass, twenty-fourth run)

- Change: `research/CLAUDE.md` now says to check `import torch` before asking
  `pyenv.py` for torch, and how to install the CPU wheel (3 live reports in
  3 days, one a 35 min CUDA pull). Re-ran `derive.py fetch && build` (3319 rows).
- Metric: friction reports about `pyenv.py` and torch naming
  `research/CLAUDE.md`; compare the next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting: the intervals overlap"; no audit or drift report (reduced pass).
- Result: (next review)

## E98: review 2026-10-27 (reduced pass, twenty-fifth run)

- Change: `CLAUDE.md` cloud-session pointer now names the `pkill -f` /
  `pgrep -f` hook and the bracket workaround (live report 2026-10-27T07:17;
  it was documented only in `cloud-session.md`). Re-ran `derive.py fetch &&
  build` (3360 rows).
- Metric: friction reports about the pkill hook naming `CLAUDE.md`; compare the
  next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting: the intervals overlap"; no audit or drift report (reduced pass).
- Result: (next review)

## E99: review 2026-10-27 (reduced pass, twenty-sixth run)

- Change: `prompts/explore/prompt-0.md` audit-skip list now names the html
  `lang`/viewport/`alt`/`rel` attribute sweeps (3 live reports 2026-10-26 of
  re-sweeping them).
- Metric: friction reports naming `prompts/explore/prompt-0.md` about re-sweeps;
  compare the next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting: the intervals overlap"; no audit, drift report or derive re-run
  (reduced pass).
- Result: (next review)

## E100: review 2026-10-27 (reduced pass, twenty-seventh run)

- Change: `prompts/review/prompt-1.md` step 1 now says `measure` holds git's
  `shallow.lock`, so run it and `derive.py fetch` one after the other (live
  report 2026-10-27T16:14). Re-ran `derive.py fetch && build` (3442 rows).
- Metric: friction reports naming `prompts/review/prompt-1.md` about the lock;
  compare the next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting: the intervals overlap"; no audit or drift report (reduced pass).
- Result: (next review)

## E101: review 2026-10-27 (reduced pass, twenty-eighth run)

- Change: `review/prompt-2.md` says validate failures on other runs' posts and
  records are one-line fixes for this PR, and that `measure` holds the shallow
  lock (2 live reports). Fixed 2 records that failed `validate` (the posts were fixed on main meanwhile).
- Metric: friction reports naming `prompts/review/prompt-2.md` about validate
  or the lock; compare the next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting: the intervals overlap"; no audit, drift report or derive re-run
  (reduced pass).
- Result: (next review)

## E102: review 2026-10-28 (reduced pass, twenty-ninth run)

- Change: `prompts/creative/prompt-0.md` states the episode length range a test
  enforces (live report 2026-10-27T16:16). Re-ran `derive.py fetch && build`
  (3487 rows).
- Metric: friction reports naming `prompts/creative/prompt-0.md` about episode
  length; compare the next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting: the intervals overlap"; no audit or drift report (reduced pass).
- Result: (next review)

## E103: review 2026-10-28 (reduced pass, thirtieth run)

- Change: `.github/prompts/land-your-work.md` step 2 says a first push with
  `--force-with-lease` fails with "stale info" on a branch with no remote yet
  (live report 2026-10-28T00:22). Re-ran `derive.py fetch && build`.
- Metric: friction reports naming `land-your-work.md` about push failures;
  compare the next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting: the intervals overlap"; no audit or drift report (reduced pass).
- Result: (next review)

## E104: review 2026-10-28 (reduced pass, thirty-first run)

- Change: `research/CLAUDE.md` torch install line now installs `numpy` with
  `torch` and says not to use torch in the foreground before the job prints
  DONE (live report 2026-10-28T12:05). Re-ran `derive.py fetch && build`
  (3584 rows).
- Metric: friction reports naming `research/CLAUDE.md` about the torch install;
  compare the next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting: the intervals overlap"; no audit or drift report (reduced pass).
- Result: (next review)

## E105: review 2026-10-28 (reduced pass, thirty-second run)

- Change: only the `derive.py fetch && build` re-run (3624 rows). My
  `research/CLAUDE.md` torch edit was dropped on merge: another run landed the
  same fix first (`pyenv.py` now installs the CPU wheel).
- Metric: friction reports naming `research/CLAUDE.md` about the torch install;
  compare the next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting: the intervals overlap"; no audit or drift report (reduced pass).
- Result: (next review)

## E106: review 2026-10-28 (reduced pass, thirty-third run)

- Change: (research/CLAUDE.md torch fix landed on main first by another run; mine dropped on merge.) Re-ran `derive.py fetch && build`
  extra-index install (about 2 min) and warns plain pip took 25 min (live
  reports 2026-10-28T14:12 and 17:18). Re-ran `derive.py fetch && build`
  (3624 rows).
- Metric: friction reports naming `research/CLAUDE.md` about the torch install;
  compare the next 40 runs.

- Change: `prompts/redteam/prompt-0.md` step 1 names two traps from live
  reports (2026-10-27): `--test-force-exit` truncating output, and pyenv
  install blocking a node-target run. Re-ran `derive.py fetch && build`
  (3624 rows).
- Metric: friction reports naming `prompts/redteam/prompt-0.md` about those two
  traps; compare the next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting: the intervals overlap"; no audit or drift report (reduced pass).
- Result: (next review)

## E107: review 2026-10-28 (reduced pass, thirty-fourth run)

- Change: `CLAUDE.md` says node/venture suites "can" outlast the 120 s tool
  timeout (the ai-bookkeeper suite, 1748 tests, finished well under it; live
  report 2026-10-28T22:20) instead of "outlast". Re-ran `derive.py fetch &&
  build` (3669 rows).
- Metric: friction reports naming `CLAUDE.md` about `run_in_background` for
  node tests; compare the next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting: the intervals overlap"; no audit or drift report (reduced pass).
- Result: (next review)

## E108: review 2026-10-29 (reduced pass, thirty-fifth run)

- Change: `prompts/redteam/prompt-0.md` warns that `--target` skips the
  slow-suite probe (live report 2026-10-29T02:07: 300 s baseline timeout).
- Metric: friction reports naming `prompts/redteam/prompt-0.md` about baseline
  timeouts; compare the next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting: the intervals overlap"; no audit or drift report, no derive
  re-run (reduced pass).
- Result: (next review)

## E109: review 2026-10-29 (reduced pass, thirty-sixth run)

- Change: `platform/ci/wait_for.py` docstring warns that piping it or chaining
  `&& echo` hides its exit 1 (reports 2026-10-29T06:37 and T07:52, which
  blamed the tool; it does exit 1 on timeout). Re-ran `derive.py fetch &&
  build` (3758 rows).
- Metric: friction reports naming `wait_for.py` or background waits; compare
  the next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting"; no audit or drift report (reduced pass).
- Result: (next review)

## E110: review 2026-10-29 (reduced pass, thirty-seventh run)

- Change: `prompts/redteam/prompt-0.md` says a stdlib `unittest` target needs no
  `pyenv.py` either (live report 2026-10-29T11:28). No derive re-run.
- Metric: friction reports naming `prompts/redteam/prompt-0.md` about
  `pyenv.py`; compare the next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting: the intervals overlap"; no audit or drift report (reduced pass).
- Result: (next review)

## E111: review 2026-10-29 (reduced pass, thirty-eighth run)

- Change: `prompts/review/prompt-1.md` step 1 says `wait_for.py` gives up after
  100 s (re-poll) and to redirect `measure` plainly, not via a chained subshell
  (reports 2026-10-28T18:13, 2026-10-29T04:09, T13:22). No derive re-run.
- Metric: friction reports naming `prompts/review/prompt-1.md` about
  `measure` or `wait_for` timing; compare the next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) not re-decided here
  beyond the standing "keep collecting"; no audit or drift report (reduced pass).
- Result: (next review)

## E112: review 2026-10-30 (reduced pass, thirty-ninth run)

- Change: `.claude/hooks/check_posts_before_push.py` block message says to fix
  and commit in a separate Bash call (7 live reports 2026-10-29: a fix chained
  before `git push` is still blocked). Re-ran `derive.py fetch && build`
  (3884 rows).
- Metric: friction reports naming `check_posts_before_push.py`; compare the
  next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting"; no audit or drift report (reduced pass).
- Result: (next review)

## E113: review 2026-10-30 (reduced pass, fortieth run)

- Change: `research/CLAUDE.md` torch note says download.pytorch.org was refused
  by the proxy in three runs on 2026-10-30 (18 to 25 min), so plan for it
  (reports 2026-10-30T01:35, T03:06, T03:33). Re-ran `derive.py fetch && build`
  (3932 rows).
- Metric: friction reports naming `research/CLAUDE.md` about `pyenv.py` torch
  time; compare the next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting: the intervals overlap"; no audit or drift report (reduced pass).
- Result: (next review)

## E114: A perf track, about 5% of runs (2026-10-24, owner request)

- Change: new track `perf` (`prompts/perf/prompt-0.md`) at weight 0.05 in
  `routing.json`; ventures and research go from 0.315 to 0.29 each (the `polish` track had
  already taken them from 0.34 to 0.315). A perf
  run measures (`ci_profile.py`, cProfile, `node --cpu-prof`), takes the top
  `perf:` item in the process backlog or the largest consumer in a fresh
  reading, ships a change whose output is unchanged, and writes the before
  and after numbers in `docs/history/`. Backlog items P048 (guard checkouts),
  P049 (jobs per PR head) and P050 (Pages test job) seed it.
- Why: the owner, 2026-10-24: "add some work distribution to overall
  performance engineering across the repo". Three earlier passes each found
  a large saving (Pages build 3m02s to 1m21s; checkout trimmed by ~135
  job-minutes per 98; agent-permission-harness 55s to 4.5s), so the work has
  paid when done, and only happened when someone asked.
- Measure: per `perf` run, the metric moved and its before/after in the
  record's `notes`; pool-wide, checkout share and job-minutes per merged PR
  from `ci_profile.py` at each review (baseline 2026-10-24: checkout 40% of
  750 job-minutes per 80 minutes; 15 jobs per PR head).

## E115: Review 2026-10-30 (reduced pass)

- Change: `promptctl.py record` no longer refuses when a record for the same
  session id exists; it writes `-2`, `-3`... (scheduled routines reuse session
  ids; reports 2026-10-29T09:11 and 2026-10-30T02:10 wrote the file by hand).
  Re-ran `derive.py fetch && build` (3976 rows).
- Metric: friction reports naming `promptctl.py record`; compare the next 40 runs.
- Decisions: candidates (ventures 2, process 2, review 2) still "keep
  collecting: the intervals overlap" (review/2 100% on 23 runs vs review/1 95%
  on 94; ventures/2 86% vs 87%; process/2 74% vs 78%). No audit or drift
  report (reduced pass). Still over budget: steering.md (137/120),
  land-your-work.md (167/160).
- Result: (next review)

## E117: Review 2026-10-30 (second reduced pass)

- Change: none to prompts. The 2026-10-30T11:21 friction (post dated one day
  ahead, "never says to date with `date -u +%F`") is already fixed: the check
  in `platform/ci/check_post_frontmatter.py` now prints that advice, so the
  report predates the fix.
- Metric: friction reports naming `check_post_frontmatter.py` or the push hook;
  compare the next 40 runs.
- Decisions: no candidate changes; same overlap as E115. Top live friction
  (process/prompt-1.md 8, polish 6, research 5) is run-specific routing
  or timing, nothing a single edit fixes. No audit or drift report.
## E116: Review 2026-10-30 evening (reduced pass)

- Change: `land-your-work.md` loses its duplicated open-PR search tip (kept in
  `duplicate-work.md`), 167 to 163 lines (budget 160). Candidates unchanged:
  ventures 2, process 2, review 2 all "keep collecting: the intervals overlap".
  No audit or drift report (reduced pass). E115 result: too soon.
- Metric: instruction-line count for `land-your-work.md`; compare next review.
- Result: (next review)

## E118: Review 2026-10-30 night (reduced pass)

- Change: `steering.md` loses the "Measuring it" paragraph, the doc_friction
  vs deviations reminder and the "improvement loop" section (restated in
  `prompts/README.md`), 137 to 125 lines (budget 120). Lesson from outside:
  Google's "a rule should pull its weight" (already cited there): each cut
  text was a pointer to a tool a run finds through `measure` anyway.
- Metric: instruction-line count for `steering.md`; compare next review.
- Decisions: candidates unchanged (ventures 2, process 2, review 2: "keep
  collecting: the intervals overlap"; review/2 100% on 23 runs vs review/1 94%
  on 97). Router count is correct: five reviews landed today, 44 runs merged
  since the last. Re-ran `derive.py fetch && build`. No audit or drift report.
- Result: (next review)

## E119: Review 2026-10-31 (reduced pass)

- Change: `land-your-work.md` loses its "Why this has its own prompt" section
  (the 2026-10-05 stranded-branch story; the opening already says it) and a
  repeated duplicate-search pointer, 163 to 157 lines (budget 160). Lesson from
  outside: Google's "a rule should pull its weight" again: history that
  explains no current action goes.
- Metric: instruction-line count for `land-your-work.md`; compare next review.
- Decisions: candidates unchanged (ventures 2, process 2, review 2: "keep
  collecting: the intervals overlap"). 47 runs merged since the last review.
  The 2026-10-30 friction that `measure` printed no DONE line is already fixed
  (promptctl prints it). Re-ran `derive.py fetch && build`. `steering.md` still
  over budget (125/120). No audit or drift report (reduced pass).
- Result: (next review)

## E120: Process 2026-11-01 (steering.md back under budget)

- Change: `steering.md` "Amplification" section condensed (the "nothing is
  served" anecdote and restated points dropped), 125 to 118 lines (budget 120).
- Metric: instruction-line count for `steering.md`; compare next review.
- Notes: `main_health.py` 33/33 green; no agent-owned backlog item open.
- Result: (next review)

## E121: Process 2026-11-01 (verify P048, P050, P059)

- Change: wrote `result` on the three done-but-unchecked backlog items from
  `ci_profile.py --runs 200` and the run records: P048 checkout share 40% to
  20%; P050 test step 1.63 to 1.28 min per job; P059 hook friction 10 reports
  on 2026-10-29 to none since 2026-10-31.
- Metric: none new. `main_health.py` 33/33 green; no agent-owned item open
  (P056 blocked), so no fix to ship; the review PR dated 2026-11-01 holds the claim.
- Result: (verification only; no unverified done items left)
