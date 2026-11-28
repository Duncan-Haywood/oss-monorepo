# Money-sign check: skip files that cannot match (perf, 2026-11-28)

`platform/ci/check_money_sign.py` runs twice in every `Portfolio validate` job: once as the check
("Check no calculator puts the minus sign inside the currency symbol") and once inside its unit
tests (`test_no_venture_source_signs_inside_the_symbol`). Each run took about 5 s.

## Reading (before)

- Pool: `python3 platform/ci/ci_profile.py --runs 600 --top 25` at 05:04Z put
  `Portfolio validate` fourth, at 59.5 job-minutes in 19 jobs (median job 204 s). Its heaviest
  single step is only 2.4 min across those jobs: the time is spread over 112 serial steps.
- Local: `run_workflow_locally.py portfolio-validate --foreground` took 3m42s, and its per-step
  times add to 222 s, so the time is real work, not runner overhead per step. Among the steps
  around 5 s, these two shared one cause.
- Profile: `python3 -m cProfile -s cumulative -m unittest test_check_money_sign`: 5.4 s, of
  which `findings_in` has 3.9 s of self time across 9,267 calls. That self time is the regex
  iterators (a C iterator's `next` is billed to its caller). Timed one at a time over the 9,185
  sources (145 MB): `BODY_START` 2.54 s, `PATTERNS[0]` 1.06 s, `PATTERNS[1]` 0.14 s. A pattern
  that opens with an alternation (`(?:const|let)…|function…`) gets no literal-prefix scan in
  Python's `re`, so it is tried at every offset. Adding a `(?=[clf])` lookahead or reordering
  the branches changed nothing (2.28 s and 2.52 s).

## Change

Every finding needs one of six literals in the file: `` `$${ ``, a quoted `"$"`/`'$'` (four
quote combinations), or `${currency}${`. The two `PATTERNS` end in `OPENS_WITH_SYMBOL`, and a
`BODY_START` finding needs `INTERPOLATES_AFTER_SYMBOL` (the same regex) or `PARAMETER_SYMBOL`
in its body, which is a slice of the file. `findings_in` now returns early when the file holds
none of `SYMBOL_NEEDLES`. 1,201 of the 9,185 files (28 MB) have one, and the `str in` scan of
all of them takes 0.33 s.

`test_check_money_sign.SymbolNeedles` pins this. It asserts the two regexes' source is
unchanged (if either changes, the needles have to be re-derived), checks every spelling the
regexes accept against a needle (all quote pairs, with and without whitespace before `+`),
checks that a mixed-quote concatenation is still flagged, and checks that a file with no
needle yields nothing.

## Same answers

`same.py` (in the session's scratchpad; it loads `origin/main`'s module next to the new one)
ran both `findings_in` over every tracked `*.html`, `*.mjs` and `*.js` in the repository
(20,715 files, tests and fixtures included, so there are findings to compare). Both returned
85 findings, identical lists: **old 7.73 s, new 1.97 s**.

## After

Median of 5 runs each, the CI step's own command, same machine, `git stash` for the before:

| step | before | after |
| --- | ---: | ---: |
| `python3 platform/ci/check_money_sign.py` | 4.95 s | 1.85 s |
| `python3 -m unittest test_check_money_sign` (26 tests after, 22 before) | 5.39 s | 1.97 s |

About 6.5 s off every `Portfolio validate` job (~3% of its 216 s median), and the same off a
local run. What is left is mostly `sorted(VENTURES.glob("*/*"))` and reading the files.

## Not changed (ranked, for the next run)

1. **`Portfolio validate` is 112 serial steps.** Running its independent unit-test modules
   in one parallel step (four cores on the runner) could take the job from ~216 s to well
   under 100 s. It is a large edit to an 881-line workflow, the per-step names are what a
   reader sees when a step fails, and `validate` must keep its job name. Worth doing with a
   runner script that keeps one log group per check.
2. **`CI policy` and `Conflict markers`** spend 88% and 80% of their jobs on checkout
   (median 63 s and 50 s). Both are `priv-*` workflows, owner-owned per
   `prompts/perf/prompt-0.md`; a sparse or blobless checkout is the likely fix.
3. `test_check_storage_guard` (6.5 s): 2.4 s of it waits in `select.poll` on a child
   process. Find out what it spawns before changing anything.
4. `check_payment_keys` (2.9 s, run twice) is already gated by substring tests; the cost
   left is `bytes.lower()` and the gate scans over 50,584 files. Little more to win.
5. Checked and found already tight: the einvoice-pro and ai-bookkeeper suites (no file over
   2.6 s alone), and the industry front doors (median DOMContentLoaded 609-682 ms at 4x CPU,
   150 ms, 1.6 Mbit/s, `page-bench.mjs`). Residential-takeoff has its own open perf PR (#19996).
