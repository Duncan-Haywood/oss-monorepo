---
title: "Cutting a 14,600-word lab notebook into a 7-page hydraulics paper"
seo_title: "Load-sensing vs fixed gear pump excavator paper, venue length"
date: 2026-11-15
tags: [research, heavy-equipment, hydraulics, gear-pump, load-sensing, excavator, writing]
description: "The heavy-hydraulics draft grew to 14,600 words, one subsection per milestone. The venue cut is 4,573 words, organised by claim, with no new numbers."
---

The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md)
programme asks whether a small excavator burns less fuel with a
load-sensing pump or a smaller fixed gear pump on an open-centre valve.
Its answer, after some forty milestones, is one number: the gear pump's
overall efficiency at 150 bar, at the size the fuel optimum picks. A
fitted curve puts the 50% point at 0.821. Makers' catalogue curves put
the same pump at 0.759, 0.849 and 0.898, and the one bench test found
reads 0.913.

The draft that carried that answer had grown the way lab notebooks do:
one bold run-in subsection per milestone, in the order the work was done,
3.1a to 3.7r. That made it 14,557 words, 11,394 of them results. The
target journal asks for about 8 to 12 printed pages, and a reviewer has
to follow an argument, not a history.

## What the cut kept

The [manuscript](../../research/heavy-hydraulics/paper/manuscript.md)
is 4,573 words from abstract to conclusions. It is organised by claim:

1. On the measured 6 t wheel loader, load-sensing wins whatever fixed
   pump it is given (best fixed size 53.5 cc, still 11.5% more fuel).
2. The break-even load-sensing margin is a volume ratio times the
   pressure the surplus flow is pushed at, exactly.
3. On measured excavator motion a smaller fixed pump costs little time,
   so the answer moves to the engine, and then to the pump.
4. Part-stroke losses, drag at small stroke and idle hours each move it
   toward the fixed pump.
5. Three makers' gear pumps and one bench test fall on one curve.

A new table sets the five efficiency sources against that curve: each
catalogue, the bench unit and the piston pump, with the share of 384
cylinder geometries in which the fixed pump wins.

Payback, energy recovery, independent metering, cycle-time flow sharing
and the per-milestone sensitivity runs went to the supplement, which is
the old draft, kept whole.

## A check against new numbers

Rewriting prose is where numbers drift. The repository already checks
339 quoted numbers in the draft against the results files they came from.
The manuscript gets its own 29-claim list, plus a blunter audit: every
decimal number in the manuscript must appear in the checked draft or in
a committed results file. The run ended with 0 orphans, and a test plants
fake numbers to confirm the audit catches them.

## One target missed

Before cutting, the run wrote down four targets. Three held: under
7,000 words, 0 orphan numbers and 0 unresolved citations. The page target
did not. The PDF build comes out at 7 pages, not 8 to 12, in a 10 pt
two-column layout. The journal's template, a nomenclature table and an
author block will add some length. The range is a ceiling, so nothing was
padded to reach it.

The next research step is unchanged: a multi-unit gear-pump test read at
150 bar, to tell whether the one bench unit is typical. Details are in
the programme's [log](../../research/heavy-hydraulics/LOG.md).
