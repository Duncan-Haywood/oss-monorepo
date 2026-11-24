---
title: "When the smoothest metric runs your composite: an agency's downturns dated late"
seo_title: "Composite indexes and the smooth, late metric problem"
date: 2026-11-24
tags: [ventures, changepoint-detector, business-cycles, research]
description: "On simulated agency lines, inverse-volatility weights give headcount 70% of a composite, so it dates turns late and one line picked in advance beats it."
---

The [changepoint detector](../../ventures/changepoint-detector/) can date peaks and troughs on
several business lines at once. It builds a composite index with the Conference Board's method
and dates it with Bry and Boschan's rule. Two rounds earlier today found that a shorter minimum
phase (3 months instead of 6, called P3) helps the composite catch short downturns on simulated
shop and SaaS lines. P3 still did not ship, because it fell short of a bar set before the run:
come within 0.03 of whichever single line happened to date best.

Nobody can use that bar in practice, because you only know which line dated best once the answers
are in. So this round, written down and committed before it ran, replaced it with something a user
could actually do. Date every line on its own, then pick the line whose turns agree most with the
other lines' turns. P3 would ship if the composite did no worse than that advance pick on a fresh
make: an agency's pipeline, billable hours, invoices and headcount.

## What happened

| on 500 simulated agencies, 12 years each | F1 |
|---|---|
| composite, shipped rule | 0.708 |
| composite, P3 | 0.755 |
| one line, picked in advance | 0.857 |
| billable hours alone | 0.934 |

P3 beat the shipped rule for the third make in a row (+0.047, winning 107 draws and losing 7). But
the composite lost to the advance pick by 0.102, so by the rules written beforehand nothing changes.

## Why the composite lost

The Conference Board weights each line by one over its volatility. Headcount is the smoothest line
an agency has, so it took a mean 70% of the weight. It is also the latest: people are hired and let
go about four months after the work turns. The composite inherited that delay and dated turns a
median two months late. Rebuilt without headcount, the same composite scored 0.924. That comes from
a look after the run, so it is a lead for the next round, not a result.

The same thing happened more mildly on the SaaS make, where MRR, the smoothest and latest line, got
the most weight. A line that is both the calmest and the slowest to react (headcount, MRR, active
customers) will take over the composite and drag it late.

## What to do with it today

When you run `--turns --columns`, the output already lists each column's weight. If the heaviest
column is one you know reacts late, date the composite again without it, or date your most direct
activity line on its own with `--column`. The next pre-registered round will test a warning, or a
cap on the weight, for exactly this case.

The script, its output and the after-the-run look are in the venture's `eval/` folder
(`turns-agency-lines.mjs`, `turns-agency-lines-posthoc.mjs`). The README section "A short-phase
rule for composites, third make" has the full table.
