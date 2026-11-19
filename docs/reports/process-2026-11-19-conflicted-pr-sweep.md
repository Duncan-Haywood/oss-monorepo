---
kind: note
topics: [guidance-system, software-for-routine]
date: 2026-11-19
---
# The "conflicted" stalled PRs: most were already on main (process, 2026-11-19)

**Reading** (~13:20 UTC): 95 open PRs. `python3 platform/ci/stalled_prs.py`:
25 touch no CODEOWNERS path and stopped moving; 16 of them are in the
**conflicted** bucket (11 to 34 days quiet). The 2026-11-18 sweeps worked the
ready and orphan buckets and left this one alone, so it does not drain.
`main_health.py` was 293/293 green; the process backlog had only owner rows.

**Method.** For 9 of the 16, I took the PR's own diff (from its base commit,
run records excluded), tried `git apply -3` on today's main, and checked
by hand whether main already does what the PR does: searched merged PR
titles (`gh api search/issues ... is:merged`) and ran the behaviour on
main.

| PR | verdict | evidence |
|---|---|---|
| #11151 ai-bookkeeper numeric flags | **landed here** (narrowed) | `fx rate EUR 2026-01-01 abc` still saved a NaN rate on main |
| #7341 cron-dst-drift-check `@daily`, `?`, never-fires | **landed here** | all three inputs still failed or misled on main |
| #14012 401(k) answer-first lead | superseded | merged as #14189, same title |
| #11730 cra-evidence-desk llms.txt | superseded | merged as #11811 |
| #12119 wall-framing validators | superseded | #12706 plus main's `validators-shape.test.mjs`, which covers all 12 |
| #13116 check_local_assets tests | superseded | the same `main()` and help tests are on main (#16767) |
| #13070 shift-roster split-shift report | superseded | main has `scheduleFlags` splits, `splitShiftPay` and `--split-premium` |
| #13074 changepoint noise-floor bracket | superseded, and its claim is contradicted | main runs airmiles in `noise-floor-real.mjs`, and its 2026-11-09 entry shows Peace Bridge loses its documented break at k=1.25, against the PR's "k between 1 and 2" |
| #8649 csv-to-sepa-pain008 | superseded | `ventures/csv-to-sepa-pain008` is on main |

So 7 of 9 were already on main by another route, and 2 were live bugs worth
porting. A line-share heuristic (share of the PR's added lines found in
today's file) did not separate the two groups: the superseded ones scored 0
to 67% because the later PR reworded messages and tests. That is why
`stalled_prs.py`'s **landed** bucket (byte-for-byte) misses them.

**Porting needed judgment, not just a merge.** #11151's flag list included
`--other`, `--min` and `--gross`. On today's main `receipts split --other` takes
an account, and `--min` and `--gross` go through `parseCents` (which accepts
`$75`). Applied as written, it would have refused valid input. Also, two of
the three estimate money helpers it never touched still turned `x` into NaN.

**Not done:** #7442, #8630, #10600, #10881 (check_third_party_requests.py is
on main: probably superseded), #12130, #12779, #5967, #8509. The next sweep
should start with the same two questions per PR: does a merged PR with a
similar title exist, and does main still show the bug?

**Suggestion for `stalled_prs.py`** (not built here; it needs the search API,
which is limited to a few calls a minute): for a conflicted PR, list merged
PRs that share the title's slug and a key phrase, so the reader starts from
"probably superseded by #N" instead of a merge attempt.
