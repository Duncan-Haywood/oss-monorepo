---
title: "Not Enough Ones: when Benford's law flags an honest ledger"
seo_title: "Why Benford's law gives false flags on small, fixed-price ledgers"
date: 2026-11-14
tags: [fiction, hearth-and-horizon, science-fiction, statistics]
description: "A new Hearth & Horizon story and its sums: a first-digit screen, nine fixed bills, and why a 0.015 MAD line flags an honest 300-line ledger one time in three."
---

[Not Enough Ones](../../ventures/hearth-and-horizon/stories/not-enough-ones.md)
is a new Hearth & Horizon story, about 4,900 words. An AI wrote it. It is
text only, because the shelf's audio folders are over the repository's
400 MB cap (471 MB this run).

**The story.** It is 2053, in an invented Iowa farm town of about six hundred
people. A diocese's screening assistant runs a Benford's-law test on every
parish's payments. One rural parish turns red on the dashboard the deans can
see. A dean mentions it in a meeting of thirteen people. By the next evening
the parish's treasurer of thirty-one years has been asked about it in the
gas station, and she has handed in the checkbook. A young auditor drives
out. The story turns on what the test was built to find, and what a red
square next to a name says that the statistic never did.

## The sum in the story

Benford's law says that in a big pile of numbers that grew by multiplying,
spread over several powers of ten and weren't chosen by anyone, the first
digit d turns up with probability log10(1 + 1/d). That is 30.1% for a 1 and
4.6% for a 9. Auditors use it as a first screen, because invented figures
tend not to step down that way.

The story's ledger is invented, built in a short script so every figure in
the story comes from one set of numbers:

1. **Five hundred payments, two hundred of them fixed.** The organist, the
   snowplowing and the mowing are all $45.00 (90 lines). The bulletin is
   $62.00 a week (52). Then the custodian, the diocesan assessment, the
   phone, the insurance and the candles. That makes nine amounts and 200
   lines, none of them starting with a 1.
2. **The full-year screen.** Ones come out at 20.0% where Benford expects
   30.1%, and fours at 30.2% where it expects 9.7%. The mean absolute
   deviation (MAD) is 0.064. Mark Nigrini's book on Benford's law in
   auditing calls anything above 0.015 nonconformity, so the parish goes red.
3. **Take the fixed bills out.** The 300 variable lines give a MAD of 0.020,
   which is *still* over the line.
4. **The line was drawn for big data sets.** I drew 5,000 samples straight
   from the exact Benford proportions. At 300 lines the average MAD is
   0.0136, and about **34%** of perfectly natural samples land above 0.015.
   At 500 lines it's about 7%. A chi-square test on the same 300 lines gives
   11.6 on 8 degrees of freedom, against a 5% line of 15.5 (p ≈ 0.17):
   nothing to see.
5. **The right test finds something else.** A duplicate test (same payee,
   same amount, close together, not on a schedule) finds one pair, a $1,184
   boiler repair paid by check and then again two weeks later through
   online bill pay. It's an honest, recoverable mistake, the kind every
   office makes, and it's what a two-signature rule is for.

If you run a first-digit screen on small ledgers, three things follow from
the arithmetic. Take out the amounts people set (prices, fees, assessments)
before testing. Report the sample size and the false-flag rate next to the
result. And don't put a colour next to a name before a person has looked.

## What the story is about

The statistic was never wrong about the digits. The harm came from the
steps after it: a field called *Risk: high*, a red square, a dashboard
opened to more people, and a remark in a meeting. The parish priest
remembers the Catechism's paragraph on rash judgment and detraction
(2477): assuming without enough ground that someone has done wrong is a
fault even when nobody says anything false. And a good name that has been
harmed has to be repaired where the harm was done. So the dean reads his
apology in the same room, and it goes in the bulletin of all fourteen
parishes.

Everyone in the story, the town, the diocese and its ledger are invented.
Benford's law, Newcomb's 1881 note, Benford's 1938 paper and Nigrini's
thresholds are real, and the story's closing note has every count and every
date check.
