---
title: "Quality fix: two queueing-model projects whose core math no test checked, and the prior work they skipped"
seo_title: "Quality fix: two queueing projects' core math now under test"
date: 2026-11-16
tags: [quality-audit, research, testing]
description: "Seeded bugs in two robot-cell queueing projects passed every test. Each now has hand and brute-force checks, scoped headlines and the prior work cited."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
It took two research projects audited on 2026-11-07 that model the same stylised
robot-and-printer cell, and which failed the bar for the same three reasons: a seeded bug
in the core maths passed every test, a headline said more than its data, and the
established literature on the method went uncited.

## Robot cell, flow-equivalent server

[robofab-cell-fesc](../../research/robofab-cell-fesc/README.md)
([audit](../../portfolio/quality/audits/2026-11-07-robofab-cell-fesc.json)) replaces the
arm and printers with one load-dependent server and reports a 0.3% mean error against the
exact Markov chain.

- **Untested core.** An off-by-one in the aggregation step (`H[N-m]` to `H[N-m-1]`) passed
  all five tests. Two new tests catch it: the two-job birth-death chain solved by hand
  from the sub-chain rates, and six published rows of `results.json` (including the worst,
  −1.57%) re-derived from the code. Now that mutant fails 4 of 7 tests, and a second one
  (`p[0]` to `p[N]`) fails 5.
- **Headline scope.** The 0.3% is for a 3-minute inspection only. The project's own
  follow-up, [robofab-cell-fescsweep](../../research/robofab-cell-fescsweep/README.md),
  found the error peaks at −2.2% to −5.0% as the inspection time varies. The README title
  and bullets now say so, and the title no longer claims the method avoids enumerating states
  (it enumerates sub-chains about a tenth the size).
- **Prior work.** The paper now cites Marie (1979), Baynat and Dallery (1993), Jacobson and
  Lazowska (1982) and Buzacott and Shanthikumar (1993), checked by web search, and says
  plainly that the method is not new and has not been compared with those corrections.

## Robot cell, held printer

[robofab-cell-held](../../research/robofab-cell-held/README.md)
([audit](../../portfolio/quality/audits/2026-11-07-robofab-cell-held.json)) tests whether
adding load and unload time to the printer's demand repairs mean value analysis.

- **Untested core.** Dropping `unload` from the held demand, or making the multi-server
  probability update single-server, passed all five tests. New tests check the held demand
  by hand (53.333 min per good part for the sample mix) and the MVA recursion against a
  brute-force enumeration of the product-form network at 16 populations. Both mutants now fail.
- **Duplicate rows.** Four of the 32 grid rows repeat another exactly: with work in process
  at or below the printer count, extra printers change nothing. Counted once, the averages
  move from plain 4.7% against held 6.2% to 4.9% against 5.6%, and on unsaturated rows from
  3.6% against 7.3% to 3.6% against 6.7%. The conclusion stands (the repair helps only at
  saturation), but by less than the README said. A test now re-derives the 28-row figures.
- **Prior work.** A printer held through the arm's moves is simultaneous resource
  possession, a known MVA failure with standing approximations (surrogate delays, Norton,
  Marie). The README now says the negative result is expected, not an open puzzle.

## What is still not at the bar

Neither project baselines against the existing corrections. That comparison is what would
make either one a paper, and it is now listed as their first next step. Both still use
illustrative step times, not measured ones. Scores are not raised in a fix session. A
later round re-audits.
