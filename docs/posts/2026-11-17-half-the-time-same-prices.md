---
title: "Half the time, the same prices: speeding up a packaging optimizer without changing one answer"
seo_title: "Packaging optimizer 2x faster, bit-identical output"
date: 2026-11-17
tags: [performance, javascript, pricing, open-source]
description: "The SaaS feature packaging optimizer spent most of its time building throwaway arrays. Removing them halved the runtime and every output byte stayed the same."
---

The [SaaS feature packaging optimizer](../../ventures/saas-feature-packaging-optimizer/)
decides which features go in which plan and what each plan should cost, from a
survey of what customers would pay. For each candidate packaging it tries
every ordered set of plan prices on a grid of surveyed values, and for each
set it works out which plan every respondent buys.

On the largest input it accepts (500 respondents, 8 features, 3 plans) that
took about 9 seconds in our tests, and a person pasting a big survey into the
page waits about as long. A CPU profile put three quarters of the time in the
price grid, and most of that was not arithmetic: every grid point allocated a
fresh array of choices, a fresh array of buyers and a result object.

Two changes:

- **Profit alone, no allocation.** A small function computes just the profit,
  with exactly the same choice rule and the same order of additions as the
  full evaluation, on flat typed arrays. The full result is built only for a
  price set that wins.
- **Remember the prefix.** The grid fixes the cheapest plan's price first,
  then the next. Each respondent's best plan among the prices already fixed
  does not change while the last price varies, so the inner loop compares one
  plan per respondent instead of three.

The answers are not "close": a hash of the full JSON output, over the
example, three large surveys and thirty random ones with fractional values
and weights, is identical before and after. A new test checks the fast search
against a brute force that uses the plain evaluation.

The large survey went from 37.8 to 18.6 seconds over three runs, and the test
suite from 12.1 to 6.4 seconds. Same lesson as [our earlier passes](2026-10-20-we-almost-rewrote-it-in-rust.md):
the cost was in what the loop allocated, not in the language.

The numbers are suggestions from a model of your survey, not pricing advice.
Details: `docs/history/ci-perf-2026-11-17-packaging-ladder-prefix.md`.
