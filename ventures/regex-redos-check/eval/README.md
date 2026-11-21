# Measuring the static engine against an exact oracle

`ambiguity.mjs` is an exact exponential-backtracking oracle for a small regex
grammar, written separately from `engine.mjs` (its own generator and automaton,
no parser). `ambiguity-sweep.mjs` draws random patterns, labels each one with
the oracle, confirms every "exponential" label by timing V8, and compares the
engine's verdict. `../ambiguity.diff.test.mjs` runs a 150-pattern version of the
same comparison in the venture suite.

## Method

A backtracking engine that fails to match tries every parse of the input. It is
exponential on some input exactly when the parse automaton is exponentially
ambiguous (EDA): a reachable state has two different paths back to itself on
the same word `w`, so `prefix + w×n + "!"` has at least 2^n failing parses.

- Criterion: N. Weideman, B. van der Merwe, M. Berglund and B. Watson,
  "Analyzing Matching Time Behavior of Backtracking Regular Expression Matchers
  by Using Ambiguity of NFA", CIAA 2016, LNCS 9705,
  [doi:10.1007/978-3-319-40946-7_27](https://doi.org/10.1007/978-3-319-40946-7_27).
- EDA test: C. Allauzen, M. Mohri and A. Rastogi, "General algorithms for
  testing the ambiguity of finite automata and the double-tape ambiguity of
  finite-state transducers", International Journal of Foundations of Computer
  Science 22, 2011, pp. 883-904 ([author PDF](https://cs.nyu.edu/~mohri/pub/namb.pdf)). EDA iff the squared automaton has a
  strongly connected component with a diagonal pair `(p,p)` and another pair.
- Automaton: a position (Glushkov) automaton whose transitions carry
  multiplicities, so `(a*)*` counts as ambiguous (the step `a -> a` can be the
  inner or the outer loop; the plain Glushkov automaton merges them). Repeats
  follow ECMAScript's RepeatMatcher: an iteration past the minimum may not be
  empty, so `(a?)+` is *not* exponential and V8 confirms it (30 `a`s and `!`
  in 0.03 ms).
- Grammar: literals `a`, `b`, `c`, the class `[ab]`, concatenation, `|`, `*`,
  `+`, `?`; every pattern is tested full-match, `^(?:R)$`.
- Ground truth for "exponential": the oracle says EDA **and** V8 slows down on
  the oracle's witness (time at least triples between two pump counts once it
  passes 25 ms, or a 200 ms timeout). Patterns the oracle calls EDA but V8 runs
  fast are counted separately as "unconfirmed".

The code is our own; the papers give the criterion, not code.

## Results (2026-11-21, Node 22.23.5)

`node eval/ambiguity-sweep.mjs 3000 <seed> <maxSize>`; `ENGINE=<file>` measures
another copy of the engine (main's was taken with `git show`).

| sweep | engine | caught (of exponential) | missed | false alarms (of non-exponential) |
| --- | --- | --- | --- | --- |
| seed 7, size ≤ 8 | before (main) | 873 of 1,314 (66.4%) | 441 | 19 of 1,669 |
| seed 7, size ≤ 8 | with exact check | 1,314 of 1,314 | 0 | 0 of 1,669 |
| seed 11, size ≤ 10 | before (main) | 1,065 of 1,615 (65.9%) | 550 | 10 of 1,365 |
| seed 11, size ≤ 10 | with exact check | 1,615 of 1,615 | 0 | 0 of 1,365 |

Unconfirmed (oracle EDA, V8 fast): 17 and 30. Every one of the 17 listed for
seed 7 repeats a single character inside an alternation of three or more
branches, such as `(?:a|b|a)+`. V8 runs those fast; `^(?:a|a)*$` with two
branches is slow (154 ms at 24 characters). Python's `re` was fast on
`^(?:a|a|b)+$` and slow on `^(?:a|a)*$` too. The engine still flags 16 of the
17: they are ambiguous, and another engine may not optimise them.

What the old rules missed, by shape: repeats nested directly around a compound
body (`((?:bb)+)*`, `((?:[ab][ab])+)*`), alternations with an optional branch
(`(a|a?)+`), and bounded repeats inside a loop (`(a{2,5})+$`). What they flagged
wrongly: bodies separated by a mandatory delimiter that the shape rules read
through (`(?:[ab]+bca)*`, `(?:aab|a)+`).

**The probe.** On 100 random confirmed-exponential patterns (seed 99,
`--probe` style), the old probe's single-character pumps confirmed 58 as
exponential, 5 as polynomial, and reproduced nothing on 37. Pumping the exact
check's witness confirmed 100 of 100. The run shared the CPU with two sweeps, so
treat the timings as rough; the thresholds are coarse.

**This repository.** 14,714 distinct patterns in the code `check_redos.mjs`
reads, plus `platform/`. The exact check covers 13,313 of them (90.5%; the rest
use lookaround, backreferences, atomic groups or possessive repeats, or are too
big). It proves 13,000 not exponential. It found one exponential pattern the
shape rules had flagged but nobody had fixed (`docker-cache-order-check`'s
`setupRe`: a version like `==1.0pip` could end before `pip`, so 18 copies of
`PIPUV!*` took 23 ms and every 2 more took 4× longer; now fixed). It turned two
shape-rule errors into warnings, both timed flat: the sales-agent date phrase
(already allowlisted after recheck 4.6.2 called it safe, entry removed) and a
`/(\^(?:\\/|[^/])*)/` pattern in `platform/` (20,000 pumps, ≤ 1 ms).

**Cost.** Analysing the 11,696 distinct patterns under `ventures/` took 433 ms
with main's engine and 2,147 ms with the exact check (one run each).

## Limits

- Exact only inside the model: lookaround, backreferences, atomic groups,
  possessive repeats and anchors other than at the start or end are not
  modelled, and the check returns `null` (the shape rules still run).
- Bounded repeats are cut to 3 extra copies. A path found in the cut automaton
  is a real path, but "none found" is then not a proof, and no demotion happens.
- Without a closing `$`, a pattern whose witness reaches a match state is not
  reported: the engine stops at the first match. That is conservative; a
  higher-priority branch can still blow up before a lower one matches.
- Exponential only. Polynomial (IDA) patterns are left to the shape rules and
  `--probe`.
- The sweep grammar is small (three letters, one class). Real patterns are
  checked against the 100-character sample alphabet plus their own literals.
