---
title: "Why a composite of SaaS metrics misses short downturns, and the one-line rule change that finds them"
seo_title: "Dating short SaaS downturns: a 3-month phase rule"
date: 2026-11-24
tags: [ventures, changepoint-detector, business-cycles, research]
description: "On simulated SaaS lines, a 3-month minimum phase lifts a composite's turn dating from F1 0.833 to 0.915 and keeps NBER's 16 of 16, but misses a pre-set bar."
---

The [changepoint detector](../../ventures/changepoint-detector/) can date peaks and troughs on
several business lines at once. It builds a composite index from the lines, using the
Conference Board's method, and dates it with Bry and Boschan's 1971 rule. On four public US
indicators that matched all 16 of NBER's recession turns since 1969. Earlier today a simulated
shop showed where it falls short. The composite missed short contractions, because the rule
throws out any phase shorter than six months unless the line moves 5% or more across it.

This round tested two fixes on a fresh make: a simulated SaaS company. Its sign-ups lead by two
months and are noisy. Active users and paid invoices lag by a month. MRR lags by three months, is
smooth and moves half as much. Both fixes and five pass marks were committed before the script
first ran.

## What came out

| rule on the composite | mean F1 (500 draws) | missed turns a draw | false turns a draw |
|---|---|---|---|
| shipped: phases of at least 6 months | 0.833 | 1.46 | 0.07 |
| P3: phases of at least 3 months | **0.915** | 0.76 | 0.10 |
| REL: keep a short phase that moves a quarter of the median phase | 0.858 | 1.21 | 0.08 |
| best single line, picked after the fact | 0.960 | | |

P3 beat the shipped rule in 168 draws and lost in 3. The gain held at half and double the noise,
and on histories of 8 and 20 years. On the shop round's draws it reached that round's
hindsight figure, 0.974. On the real FRED composite it still dated NBER's 16 turns. It added one
pair, November 2002 and April 2003, the soft patch after the 2001 recession that NBER did not date.

## Why nothing ships

The pass marks included one that the composite must come within 0.03 of the best single line
picked with hindsight. P3 came within 0.045, so it failed, and REL fell further short. The bars
were written first, so the default stays as it is. The same rule kept earlier near-misses out of
the tool. We do not loosen a bar after seeing the result.

The SaaS make showed one more thing. With today's 6-month minimum, the composite (0.833) does
worse on average than its best line (active users, 0.872). The reason is that the smoothest line,
MRR, gets the most weight, and its three-month lag blurs contractions further. If your real
metrics look like these, read the composite's dates with that in mind.

## What next

A third make, an agency's billable hours, pipeline, invoices and headcount, will test P3 alone
with fresh draws against the same five bars. The full tables are in the venture's README, section
"A short-phase rule for composites, on SaaS lines". The script is `eval/turns-saas-lines.mjs`.
This is a simulation. The lags, loadings and noise were chosen before the run, not fitted to any
real company.
