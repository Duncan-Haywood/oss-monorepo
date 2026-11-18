# einvoice-preflight: the Flux 10 sniffing regex was exponential (2026-11-18)

**Track:** perf. Both perf backlog items (P063, P064) are owner-gated workflow
edits, and the two suites the last runs ranked next (garmin `citydata.test.mjs`,
tournament-pairing-manager) already have open PRs (#17162, #17159). So this run
timed every venture suite instead.

## Reading

- Sweep: every `ventures/*` suite, `node --test` on its `*.test.mjs`, 4 at a time,
  120 s cap, idle 4-core container (1,389 suites). Largest ones not yet covered by a
  perf note: contingency-table-tests 13.0 s, conformal-prediction-intervals 12.2 s,
  stl-decomposition 9.1 s, scale-reliability 8.7 s, spc-control-charts 8.3 s,
  stable-matching 8.2 s, robust-pca 7.6 s (wall clock, under contention).
- One suite was **red on main**: regex-redos-check, test "check_redos: this
  repository's product code has no un-allowlisted exponential suspect". It flagged
  one new pattern in two places, added the day before by PR #17149:
  `ventures/einvoice-preflight/schematron-core.mjs` `detectSyntax` and
  `ventures/einvoice-preflight/flux10.mjs` `looksLikeFlux10`.

## What the time was

```
/^(?:﻿)?\s*(?:<\?[\s\S]*?\?>\s*|<!--[\s\S]*?-->\s*)*<Report\b[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*<ReportDocument\b/
```

A lazy `[\s\S]*?` body can run past its own `-->` or `?>`, so n comments in a row
can be split into items in about 2^n ways, and on any root other than `<Report`
the engine tries all of them. Timed in Node 22 (`"<!--a-->".repeat(n) + "<X/>"`):

| leading comments | old pattern | new pattern |
| ---: | ---: | ---: |
| 24 | 29.7 ms | 0.006 ms |
| 26 | 124.8 ms | 0.009 ms |
| 28 | 478.7 ms | 0.018 ms |
| 40 | ~30 min (x2 per comment, extrapolated) | under 0.01 ms |
| 10,000 | out of reach | 0.72 ms |

`detectSyntax` runs on the whole pasted or uploaded file in the visitor's browser
(no 8 KB slice), before any parsing: a UBL invoice with 40 leading comments, or
a crafted one, froze the tab. `looksLikeFlux10` slices to 8 KB, which still
holds about 1,000 short comments.

## Change

Each processing instruction or comment now ends at its first terminator, which is
what XML says, written as an unrolled loop, `<\?[^?]*(?:\?(?!>)[^?]*)*\?>` and
`<!--[^-]*(?:-(?!->)[^-]*)*-->`, with the shared `<` factored out of the
alternation so the repo's own static checker (`platform/ci/check_redos.mjs`)
can see the branches are disjoint. A tempered-token version
(`(?:(?!\?>)[\s\S])*`) was equally fast but the checker still flagged the
alternation; the factored form passes it with no allowlist entry.

## Verification

- `ventures/einvoice-preflight/flux10-detect-redos.test.mjs` (new):
  200 leading comments or PIs answer under 500 ms (actual: well under 1 ms);
  20,000 generated well-formed prologs give the same answer as the old pattern
  (over 1,000 of them positive); the two inputs where the answers differ are pinned:
  `<?a?>x?><Report>...` and `<!--a-->x--><Report>...` were Flux 10 to the old
  pattern only because it read `x?>` as part of the PI. Those prologs are not
  well-formed XML, so "not Flux 10" is the right answer.
- Against the old code the new test hangs (stopped by hand after several minutes),
  so it catches a regression.
- `python3 platform/ci/run_venture_tests.py einvoice-preflight regex-redos-check`:
  both ok (2,732 and 40 tests).

## Why CI did not catch it

The repo-wide ReDoS sweep is a test inside `ventures/regex-redos-check/`, so it
only runs on PRs that touch that venture (and in `devsec-toolkit-ci.yml` on the
same paths). PR #17149 touched einvoice-preflight only. Running `check_redos.mjs`
on every PR that changes `ventures/**` source (about 2 s for the whole tree)
would have caught it. That is a workflow edit (`.github/`, owner-gated), or a
change to `platform/ci/run_venture_tests.py` so the ventures job sweeps the
touched ventures; not done here, ranked first below.

## Not changed, ranked for the next run

1. **Run the ReDoS sweep on every ventures PR** (above). Scope it to the
   touched ventures' files so an unrelated PR is never red for another venture's regex.
2. **Unprofiled mid-tier suites** from this sweep: contingency-table-tests 13.0 s,
   conformal-prediction-intervals 12.2 s, stl-decomposition 9.1 s, scale-reliability
   8.7 s, spc-control-charts 8.3 s, stable-matching 8.2 s (all wall clock, four
   suites at a time; time them alone first).
3. P063 and P064 remain owner-gated.
