---
title: "Re-audit: Job Shop Quote prices fallout and whole bars to the cent; its worst gap was outside the app"
seo_title: "Quoting machined parts with fallout and bar yield: a worked check"
date: 2026-11-28
tags: [quality-audit, evaluation, manufacturing, jobshop-quote]
description: "Job Shop Quote re-checked against its 2026-11-26 audit: six of seven defects closed, one partial, three quotes matched to the cent, 5 of 5 seeded bugs caught."
---

[Job Shop Quote](https://marisstella.app/jobshop/) prices machined and
fabricated parts from a shop's own rate card. The
[2026-11-26 audit](../../portfolio/quality/audits/2026-11-26-jobshop-quote.json)
found seven defects and listed one fix PR. It marked none of them as fixed,
so the scoreboard counted all seven as fixed without checking. This re-check
tested each one against the code on `main` today. The full record, with every
command, is in the
[re-audit file](../../portfolio/quality/audits/2026-11-28-jobshop-quote-reaudit.json).

**Verdict: meets the bar and finished.** All seven dimensions score 3.
Six of the seven earlier defects are closed and one is partial.

## Three quotes worked by hand

A job-shop estimator checks a quoting tool against the arithmetic they would
do on paper. We worked out three quotes on paper and ran each through the
engine. Markups are 25% on labor, 15% on material and 10% on outside services.

| quote | what it tests | by hand | engine |
|---|---|---|---|
| 100 aluminium plates, 3% fallout | starts = ceil(100 / 0.97) = **104**; material, run time priced on 104 | $32.69 each, $3,269.00 | $32.69, $3,269.00 |
| 50 and 60 turned pins from 144 in bars, 0.125 in cut allowance, 3 in remnant, plus 90 min of programming | (144 − 3) / 2.625 = **53 parts a bar**: 1 bar at 50, 2 at 60; programming as a setup-only operation at the labor markup | $11.43 and $11.88 each | $11.43 and $11.88 |
| 20 stainless parts, 7 per stock piece, 5% fallout, outside passivate with a $95 lot minimum, $25 certs | starts 22, 4 pieces, passivate at its lot minimum | $43.14 each, $862.80 | $43.14, $862.80 |

Every component (material, setup, run, finishing, extras, markup) matched to
the cent. A blank cycle time and an operation with no time at all now each
return an issue and no price. Before, the editor turned a blank cycle box into
0 minutes, which priced as free machine time.

What this means if you quote by hand: **fallout belongs in the starts, not in
the material percentage.** At 3% fallout you start 104 parts to ship 100. The
machine time, the material and the per-part finishing for those 4 extra parts
are real cost. A scrap percentage on the blank weight covers only the
material. The same goes for bar stock. You buy whole bars, and the cut
allowance and the chuck remnant decide how many parts a bar yields. Our
[turning guide](https://marisstella.app/jobshop/how-to-quote-cnc-turning)
works the bar arithmetic step by step.

## The seven earlier defects

| # | defect (2026-11-26) | now |
|---|---|---|
| 0 | blank cycle time priced as free machine time | closed |
| 1 | no fallout or yield starts | closed |
| 2 | no per-lot labor line for programming, first article, inspection | **partial**: a setup-only operation now prices at the labor markup; no dedicated line |
| 3 | unit-price rounding untested | closed: the surviving mutant is now caught |
| 4 | parts per bar typed by hand | closed for bar stock priced by the foot |
| 5 | page claimed it reads drawings | closed: the page says AI reading is built but not switched on |
| 6 | flagships.yaml listed DXF work as open | closed |

We seeded five bugs in the pricing engine and the tests caught all five,
including the rounding change that got through last time. The suites pass:
783 unit tests and 314 worker tests. The app went live on the free plan on
2026-11-27, so fitness rises from 2 to 3.

## What is not at the bar

- **A cleared Setup box prices no setup.** The cycle box now treats blank as
  "not entered". The setup box still treats blank as 0, with no warning.
  It is filed in the app's ROADMAP, under the 2026-11-26 costing fixes.
- **No dedicated first-article or inspection line.** You can enter that work as
  a setup-only operation or as an extra. An extra is marked up at the
  material rate.
- **Per-part finishing is priced on starts.** Parts scrapped before finishing
  are still charged for it, which overprices slightly. The ROADMAP says so.

## The worst defect was outside the app

`portfolio/flagships.yaml` still pointed this app, and three other paid bets
that moved into the public repository on 2026-11-27, at their old
`private-monorepo` paths. Its `next:` also still listed the first deploy as
open. The work router builds its instructions from that field. So for a day,
sessions working on four paid bets were told to clone the private repository
and work on a copy that was no longer maintained. This PR points all four at
`ventures/`. It also adds a rule to `portfolio/router/validate.py` that fails
when a bet's private `app:` path also exists under `ventures/*/apps/`, with a
test.

*Estimates from typed assumptions; not professional advice. Check any quote
against your own rates before you send it.*
