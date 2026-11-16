# gitignore-explainer: git's basename shortcuts for `name` and `*.ext` rules (2026-11-16)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner. The three biggest suites in
`platform/ci/venture_suite_times.json` (league, shift-roster, shed) and the
~40 s band all had perf runs in the last two days, so this run looked lower
down the list for a suite whose time looked wrong for what it does.
gitignore-explainer stood out: 13.4 s for a text tool.

## Reading

- Each test file timed alone with `node --test <file>`: `gitignore.test.mjs`
  3.2 to 3.4 s, `gitignore.diff.test.mjs` 3.5 s (it shells out to real git),
  everything else under 0.6 s.
- `--test-reporter=spec`: one test, "a large list stays fast", took
  **3,083 ms** of the 3.2 s. It runs `analyze` on 200 rules (two thirds of
  them `*.extN`, a third `dirN/`) and 20,000 paths, with a 15 s budget.
- That is product time, not test overhead: `index.html` imports the same
  `analyze` from `gitignore.mjs`, so it is what a visitor waits for after
  pasting a large `git status`.
- A bench of that input, three runs: 2,672 / 2,648 / 2,953 ms.
  `node --cpu-prof`, self time over the three runs: `dowild` (the wildmatch
  port) **5,958 ms**, `ruleMatches` 834, `lastMatchIn` 398, `analyze` 352.

`analyze` calls `ruleMatches` for every rule and every path and implied
folder (the per-rule tallies), plus once per rule removed for the "what does
this rule change" pass. For an unanchored `*.ext5` and a basename like
`f123.ext7`, the recursive matcher tries the rest of the pattern at every
position after the `*`.

## Change

`gitignore.mjs`, `ruleMatches`: unanchored rules whose pattern has no
wildcard compare the basename as text, and `*` followed by wildcard-free
text is a suffix test. This is what git itself does in `dir.c`
(`match_basename`: the `nowildcardlen == patternlen` compare and the
`PATTERN_FLAG_ENDSWITH` case). On a basename, which has no `/`, both give
exactly what wildmatch gives. The shape is computed once per rule and cached
as a non-enumerable property, so JSON, CSV and `{...rule}` copies are
unchanged.

A first version cached the shape in a `Map` keyed by pattern text: 914 ms,
with the map lookup (798 ms self) costing as much as the match it saved.
Caching on the rule object took it to the numbers below. An intermediate
draft also dropped the "first character is `*`" check, so `?` read as
"matches anything"; the git differential test failed on it at once (trial
11), which is the reason to trust that test.

## Verification

- Bench, same input: **2,650 to 2,950 ms before, 650 to 715 ms after**
  (three runs each, 4-core container).
- `gitignore.test.mjs` wall time, three runs: 3,371 / 3,209 / 3,201 ms before,
  1,084 / 1,109 / 1,025 ms after. "a large list stays fast": 3,083 to 801 ms.
- `run_venture_tests.py gitignore-explainer`: 0 failed, three runs.
- `GITIGNORE_DIFF_TRIALS=1500 node --test gitignore.diff.test.mjs` (ten times
  the default against git 2.43): 1,500 random repositories, 23,810 paths, all
  agree; the suggested-fix test passes too.
- `node cli/check.mjs --json` on this repository (51k files), before and
  after: the 14,062,661-byte reports are byte-identical (`cmp`). Its wall time
  is unchanged (3.7 to 4.0 s): this repo's rules are mostly anchored and the
  time is git's.
- New test, "the literal and *suffix shortcuts agree with wildmatch": 17
  patterns (including `?`, `?log`, `[ab]`, `\*x`, which must not take the
  shortcut) on 17 basenames under three folder prefixes, file and
  directory-only, checked against `wildmatch` itself.

## Not changed, ranked for the next run

1. The remaining 650 ms is spread over `ruleMatches`/`lastMatchIn` call
   overhead (about 4 million calls). A first-character or suffix index of
   rules per basename would cut the per-rule tally loop from rules × paths to
   candidates × paths. Worth it only if real pastes get that big.
2. Anchored rules with a literal tail after one wildcard (`build/*.js`) still
   go through wildmatch; git has no shortcut there either.
3. `gitignore.diff.test.mjs` (3.5 s) is mostly `git` process start-up per
   random repository; batching repositories per `git check-ignore --stdin`
   call would help but changes the test's shape.
