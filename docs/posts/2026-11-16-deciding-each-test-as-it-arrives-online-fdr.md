---
title: "Deciding each test as it arrives: online false discovery rate control, measured"
seo_title: "Online FDR calculator: LORD++, SAFFRON and LOND compared"
date: 2026-11-16
tags: [fdr-multiple-testing, statistics, research-algorithms, multiple-testing]
description: "The multiple-testing tool now decides streams of tests one at a time with LORD++, SAFFRON and LOND. A seeded simulation shows what that costs against batch BH, and when it costs nothing."
---

Benjamini-Hochberg needs the whole list of p-values before it can say
anything, and one more test can flip an earlier verdict. That is fine for a
gene screen. It does not work for a team that ships an A/B test every week,
a monitor that checks a model every night, or a lab that runs assays for
months. They have to decide each test when it lands.

The [multiple-testing tool](../../ventures/fdr-multiple-testing/) now has an
online mode for that. Paste the p-values in the order the tests arrived and
it runs four rules side by side:

- **LOND** (Javanmard & Montanari 2018) gives test *t* the level
  alpha × gamma_t × (discoveries so far + 1).
- **LORD++** (Ramdas, Yang, Wainwright & Jordan 2017) spends from an error
  budget, "alpha-wealth", and earns some back with each discovery.
- **SAFFRON** (Ramdas, Zrnic, Wainwright & Jordan 2018) does online what
  Storey's q-values do offline. It guesses how much of the stream is null,
  so the levels stay high when the stream is rich in signal.
- **Alpha-spending** is the online Bonferroni, and the only one of the four
  that holds under any dependence between tests.

Each test's level depends only on the tests before it, so no decision is
ever revised. The test suite checks this: cutting a stream short never
changes the decisions before the cut.

## How much waiting for the whole list is worth

The simulation draws 1,000 independent z-tests with a mean shift of 3 for
the real effects, and runs 400 times per setting at a 5% target
(`eval/simulate_online.mjs`). Here is the share of real effects each rule
found:

| Real effects | LORD++ | SAFFRON | LOND | Batch BH |
| --- | --- | --- | --- | --- |
| 2%, random order | 0.11 | 0.11 | 0.11 | 0.37 |
| 10%, random order | 0.32 | 0.45 | 0.18 | 0.60 |
| 50%, random order | 0.63 | **0.88** | 0.35 | 0.83 |
| 10%, effects first | 0.65 | **0.98** | 0.46 | 0.60 |

Every rule kept its actual false discovery rate under 5% in every setting.
Three things stand out:

1. **LORD++ leaves most of its budget unspent.** Its actual false discovery
   rate was about 0.01 against a 0.05 target, and that unspent budget is
   power it never uses. SAFFRON spent close to the full 0.05.
2. **An online rule can beat batch BH.** When half the stream is real
   effects, SAFFRON found more than BH with the whole list in hand. BH's
   false discovery rate sits at the null share times alpha (0.025 here),
   and SAFFRON adapts past that.
3. **Order is part of the design.** The same tests with the effects first
   let SAFFRON find 98% of them. Sparse streams are where waiting pays most:
   with 2% real effects, every online rule found about a third of what
   batch BH found.

These numbers come from one effect size and independent tests, so treat
them as a pattern to check, not a guarantee.

## A constant that sums to 0.976

The usual step sequence, gamma_j ∝ log(j) / (j·e^√(log j)), comes with a
normalising constant of 0.07720838, the default in the
[online-fdr](https://pypi.org/project/online-fdr/) Python package. The
series converges so slowly that the first million terms add up to only
0.52. Adding the closed-form tail of the integral gives the full sum: 0.976,
not 1. The rules therefore spend about 97.6% of their budget. That is still
valid, since the proofs only need the sum to be at most 1, and only slightly
conservative. The constant that sums to exactly 1 is 0.0790819667. The tool
keeps the usual value so its answers match other software.

## How it was checked

A second implementation in Python (`eval/online_reference.py`) follows the
papers' formulas directly and recomputes every sum from scratch at each
step. The JavaScript matches it on 13,680 test levels to 1e-12, and on every
decision. The online example on the page is a simulated stream, labelled as
such, with 51 real effects among 400 tests. None of the four rules kept a
false one. LORD++ kept 17 tests, SAFFRON 27, and batch BH in hindsight 38.

## Next

ADDIS (Tian & Ramdas 2019) is the natural next mode. It drops p-values
that pile up near 1, which happens with one-sided tests pointed the wrong
way. It is now on the research-tools candidate list.

*Written with AI assistance. Statistical output, not advice.*
