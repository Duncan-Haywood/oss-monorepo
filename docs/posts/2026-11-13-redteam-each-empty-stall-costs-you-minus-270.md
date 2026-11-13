---
title: "\"Each empty stall costs you -$270\": red-teaming six calculators that only knew how to win"
seo_title: "Negative margins in profit calculators: six fixed, one lint"
date: 2026-11-13
tags: [testing, mutation-testing, redteam, calculators, wording, ci]
description: "Sixteen faults seeded, eight caught. Reading the code found a sentence that turned a loss into a gain, copied into six calculators."
---

Today's red-team run seeded faults into two calculators with
`redteam.py campaign` (change one operator or constant, run the tests, put the
file back), then read the code looking for wrong answers.

| File | Seeded | Caught before | Equivalent | Caught after the new tests |
|---|---|---|---|---|
| `turo-earnings-report-analyzer/calc.mjs` | 8 | 5 | 2 | 1 of 1 |
| `horse-boarding-stall-profit-calculator/calc.mjs` | 8 | 3 | 0 | 5 of 5 |

## What got through

- **Turo: two weekdays.** The "trips starting Tuesday paid most per day"
  finding needs at least two weekdays with five trips each. Raising that to
  three went unnoticed; the only test either had one qualifying weekday or
  none. A new test has exactly two.
- **Horse boarding: five boundaries.** Occupancy of 1.5% (the "looks like a
  fraction" check), a board price of $0.50, a blank profit target, a per-horse
  margin of 50 cents and half a minute of care a day: every one sat between a
  `0` and a `1` that no test reached. Each now has a test.
- **Two equivalent mutants** in the Turo file: an `&&` that becomes `||` where
  the second half is already false when the first is, and the length of a
  made-up trip in the "Load an example" file.

## The real bug: a sentence written for the good case

Reading the horse boarding calculator turned up this, on a barn where each
horse costs $270 a month more than it pays:

> Each extra boarded horse adds about -$270.00 a month; each empty stall costs
> you that, because fixed costs run regardless.

An empty stall saves that barn $270. And when board exactly covers feed,
bedding and care, the page said each horse "costs more to keep than it brings
in ($0.00 a month)". Neither is a rounding issue; the sentence was written for
a profitable barn and nothing stopped it running for a losing one.

The campground calculator had the same template, word for word. The pet-waste
route calculator said "each client adds about -$19.11 a month". So the run
wrote a scan rather than three tests: import every calculator that exports a
`SAMPLE` and a `compute()`, run the sample with each number scaled by 0, 0.1,
0.5, 2 and 10, and look for a gain word in front of a negative amount ("adds
about -$", "leaves -$", "nets -$") or "costs more than ... ($0.00)". It probes
128 calculators in under three seconds and found three more: a self-serve dog
wash whose full-service line "adds -$9" when the price is too low, an ice cream
shop that "leaves -$1,000 a year against your owner draw target", and a rental
arbitrage lease that "nets -$3,000". One hit, an injury settlement's "the
client would net -$X", is right as written (the client would owe), and sits on
an allowlist with that reason.

All six now say "loses" when the number is negative and drop the gain line when
there is no gain. The scan is `platform/ci/check_signed_gain_wording.py`, and
because no workflow names it yet, `unwired_checks.py` runs it on every venture
pull request: the next calculator that copies the template fails its PR.
