---
title: "Quality fix: our skylight bid framed and drywalled a sun tunnel"
seo_title: "Tubular skylight install cost: no shaft, no framing"
date: 2026-11-25
tags: [quality-audit, skylight-install-bid-calculator, for-customers, contractors, bidding]
description: "Our skylight bid framed and drywalled a sun tunnel, which needs neither, and priced a blank wage as $0 labor. Both are fixed, with tests."
---

A tubular skylight, or sun tunnel, is a 10 to 14 inch tube. It goes in
through a round hole in the roof deck, runs through the attic between the
rafters and ceiling joists, and ends at a round diffuser in the ceiling.
There is no header to frame. And because the tube is the light shaft, there
is no drywall box to build, tape and paint.

The [Skylight Install Bid Calculator](../../ventures/skylight-install-bid-calculator/)
did not treat it that way. On a new cut-in it gave a tube the same scope
kit as a glass curb unit: 1.4 hours of framing per unit. In its "same
openings, three unit types" table it also kept the job's drywall shafts on
the tube row, at 2.8 hours and $95 each. So on the Typical job (two units,
new cut-in, two shafts) the tube row said $3,954.58, about three quarters of
the $5,404.15 for two fixed glass units. Much of that tube price was framing
and shaft work the job does not have. The [quality audit of 2026-11-23](../../portfolio/quality/audits/2026-11-23-skylight-install-bid-calculator.json)
flagged this as defect 2.

## What changed

**A tube cut-in has its own kit.** `suggestedScopeKit('new-cut-in', 'tubular')`
now returns 1.2 hours to cut the deck and the ceiling and run the tube, and
no framing. A glass unit keeps 1.6 hours of cutting and 1.4 of framing. As
with every figure in the tool, these are starting numbers to replace with
your own crew's times.

**The comparison table prices the tube without shafts.** On the Typical job
the tube row is now 12.82 crew hours and $2,628.57. The fixed-glass row is
28.22 hours and $5,404.15. The
table also has a column for the share of cost that is extra work, which the
comparison page had promised and the tool never showed. If you type drywall
shafts on a tube job, the price uses them, since you may be boxing one in,
but the page warns you that a tube is usually its own shaft.

**A blank field is now an error.** In JavaScript `Number('')` is 0. Clear
the wage field to retype it, and the old page priced the default job with
no labor at all: $808.45 instead of $1,379.84, with nothing on screen to
show it (defect 1). It now says "Hourly wage is blank: enter a number (0 if
there is none)" in place of a price. Unit, shaft and story counts must also
be whole numbers. 2.5 skylights used to be accepted.

**The tests now catch the bugs the audit seeded.** The auditor made six
small changes to the pricing engine. Four of them left every test green:
story hours not multiplied by the number of units, shaft paint charged per
unit instead of per shaft, laminated glass charged once per job instead of
once per unit, and the "losing bid" flag compared against the target price
instead of cost. Each now has a test with the expected figure worked out by
hand. The Typical job is also recomputed line by line: 28.22 hours, $1,540.81
of loaded labor, $2,143.60 of material, $4,323.32 total cost and $5,404.15 at
a 20% margin. We reran all four mutants and the suite now fails on each one.

**The page says less, and pins what it does say.** One FAQ answer claimed
that "nearly every skylight leak traced back to installation is a flashing
failure". We have no source for that, so it now says only what flashing
does. A preset called "steep asphalt" is now "asphalt", because the tool has
no roof-pitch input. The FAQ's dollar and hour figures ($1,379.84, $22.40,
1.68 hours, 7.28 hours) are now checked against the engine by a test, so a
kit change cannot leave them out of date.

## What is still not at the bar

The tool still has no roof-pitch or steep-slope labor factor. It has no
crew-size input, so you have to enter a wage that covers the whole crew. And
it has no permit, disposal or electrician line. These are listed under
"Known gaps" in the
[README](../../ventures/skylight-install-bid-calculator/README.md). The
audit's scores stay as they were. A later quality round will re-audit the
tool against the code as it is now.
