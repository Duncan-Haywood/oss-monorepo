---
title: "Quality fix: our detention sizer treated a riser slot as a full-width weir"
seo_title: "Contracted vs suppressed weir in a detention outlet: L' = L - 0.2H"
date: 2026-11-27
tags: [quality-audit, stormwater-detention-sizer, for-customers, contractors, site-work]
description: "Our detention pond sizer treated a riser slot as a full-width weir. Now contracted by default (L' = L - 0.2H), with a warning when the head is too deep."
---

The [Detention Pond Sizer](../../ventures/stormwater-detention-sizer/) sizes a
two-stage outlet: a low orifice for the small storm and a weir above it for
the large one. Quality round 108
([audit file](../../portfolio/quality/audits/2026-11-26-stormwater-detention-sizer.json))
found that it got the weir wrong, in a way that mattered.

## What was wrong

The tool used Francis's weir equation, Q = 3.33 L H^1.5, at every length and
every head. That form is the *suppressed* weir, one whose crest spans the
whole width of the channel, so the water does not have to squeeze in at the
ends. The second stage of a detention outlet is almost never like that: it is
a notch or slot cut in a riser, narrower than the box behind it. That is a
*contracted* weir, and Francis takes its effective length as L' = L - 0.1 n H,
with n = 2 end contractions, so L' = L - 0.2 H.

In the tool's own worked example (5 acres, curve number 61 to 85, a 100 by
60 ft basin), the suppressed form sized a **0.62 ft weir running 2.27 ft
deep**. A contracted slot that size passes much less than the 8.2 cfs the
tool reported, so the 100-year water level would have come out higher than
the page said.

There was a second problem underneath: at 2.27 ft of head over 0.62 ft of
crest, no form of the weir equation applies. Francis's formula is fitted to
heads up to about a third of the crest length (Brater and King, *Handbook of
Hydraulics*). A slot that narrow and that deep is acting as an orifice.

## What changed

- **Contracted by default.** The weir now uses L' = L - 0.2 H, with a
  "Weir ends" choice on the page (and `--weirType suppressed` on the command
  line) for a crest that spans its channel. The example now sizes a 1.10 ft
  weir and a 4.26 ft 100-year level (5.26 ft deep with freeboard).
- **A warning when the head is too large.** When the large storm runs more
  than L/3 over the crest, the result says so and tells you to check the
  opening as an orifice. The example triggers it, on purpose: its honest
  answer is that this site's second stage should be a second orifice or a
  wider opening, and the guide now says that.
- **The time-step check follows the cited handbook.** The old warning used
  0.29 x Tp, which traces to nothing. NEH-630 chapter 16 gives Tp = D/2 + 0.6
  Tc and Tc + D = 1.7 Tp, so the unit duration is D = 0.133 Tc. For the
  example's 12-minute developed Tc that is 1.6 minutes; the example's old
  2-minute step failed its own source, so it is now 1.5 minutes (the
  100-year post-development peak moves from 28.15 to 28.81 cfs, about 2%).
- **No silent 96 inch orifice.** When the small storm needs no detention,
  the orifice search stopped at its upper bound and printed "96.0 in" as a
  size. It now says the diameter is not a design value.
- **Tests for every warning.** Round 108 found that changing either warning
  threshold left all 31 tests green. There are now tests for the weir hand
  calculation, the contracted-versus-suppressed lengths, the H/L warning on
  both sides of L/3, the time-step limit at two Tc values, the small-orifice
  warning and the bound finding; 38 tests in all.

## What is still not at the bar

The tool warns about an over-deep weir but does not model the alternative: a
rectangular orifice for the upper stage, with the change from weir to orifice
flow as the water tops the opening. Its storm is an alternating block from an
IDF curve, not an NRCS Type II or III 24-hour distribution, which most US
drainage manuals require. Both are listed in the tool's README under "Known
gaps". It is a screening tool for a first layout and for checking someone
else's model, not a stamped design.

A later quality round re-audits the tool. This fix does not change its
round 108 scores.

*Not engineering advice. A licensed engineer must review any detention design
before it is built or submitted.*
