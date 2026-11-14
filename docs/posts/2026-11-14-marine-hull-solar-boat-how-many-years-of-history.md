---
title: "One year of a solar boat's own log is not enough to fix its sun forecast"
seo_title: "How many years of history a solar USV needs to correct its forecast"
date: 2026-11-14
tags: [research, marine-hull]
description: "A solar boat that corrects its sun climatology from one earlier year does worse than no correction; three years recover the gain, five match an oracle."
---

The [last step](2026-11-14-marine-hull-solar-boat-learned-seasonal-correction.md) gave a solar boat a memory. It multiplied its sun climatology (the average sun for each day of the year) by a month-by-month table of its own harvest against what the climatology promised. It learned the table over five earlier years. With it, the boat's self-tuning battery rule matched an oracle that knew each day's forecast error. A boat on its second deployment has one earlier year, not five, so this step asks how much history the table needs.

We reran the same 168 cases with the table learned from the 1, 2, 3 or 5 earlier years nearest the scored ones. Everything else was frozen: the sun, the boat, the 50 W payload, the 2.5 to 20 kWh packs. We wrote eight predictions down before running anything. Four held.

What came out:

- **One year is worse than none.** Corrected from one year, the rule beats the plain 7-day rule (further, with no more payload downtime) in 97 of 168 cases. Uncorrected it wins 139. Using only the climatology's own error, with no added bias, it wins 4 of 8 pooled cases against 8.
- **The reason is noise.** A one-year monthly ratio differs from the five-year one by a median 4.4%, which is that year's weather. The climatology's real seasonal error is 1.8% at a typical point. So the correction adds more error than it removes. The boat trusts a sunny month, runs the battery low, and the payload goes dark more often.
- **Three years recover it.** The noise falls to 2.7% with two years and 1.7% with three. The corrected rule then wins 116, 142 and 158 of 168 cases for two, three and five years. With three or more years it goes at least as far as the 7-day rule in all 168 cases.
- **High latitudes are the exception.** Above 50 degrees the climatology's real seasonal error is 4.5 to 8.5%, larger than one year's noise. There even one year helps: 77 of 168 against 25 uncorrected. Two years did best there (138), better than three or five (104, 105). The nearest years are also the most recent, so this run cannot say whether that is luck or staleness in older years.

For anyone building a solar boat's energy manager: wait for about three years on the same water before trusting a month-by-month correction. Only use it after one season where the forecast's seasonal error is several per cent, which in this data means above about 50 degrees. The obvious fix to test next is to shrink each learned month toward no correction in proportion to its noise.

Limits: the pooled real-data test is 8 cases, and the per-point cases at high latitude moved only 43 to 49 of 72 across every rule, so small differences are not meaningful. One set of learning years per history length mixes history length with recency. Simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zzb).
