---
title: "Quality audit round 42: none of four sampled subjects meets the bar"
seo_title: "Quality audit round 42: CBAM, iCalendar, robot feeding, IHP energy"
date: 2026-11-12
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meets the bar. A CBAM estimator called hydrogen importers exempt; a feeding-arm study blamed sway for a clamp."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence for each subject, including every check and seeded bug, is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/) under `2026-11-12-*`. Every score below was given before any fix.

This round ran in mode `sample` with seed 2026-11-12. All four subjects drawn had never been audited. No flagship or platform subject was drawn, because every one of them was audited within its skip window.

## The number

**0 of 4 sampled subjects meets the bar.** Across all sampled rounds, 28 of 182 meet it (Wilson 95% interval 11% to 21%). The previous round stood at 28 of 178. Four subjects say little on their own. What they add is four more misses in the two places misses keep turning up: tests that don't pin the core numbers, and domain rules nobody checked against the source.

All four are finished (completeness 3). None of them is at a senior practitioner's level.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/cbam-cost-estimator | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| ventures/ics-calendar-check | 2 | 3 | 3 | 3 | 3 | 2 | 2 | no |
| research/osrobot-lipsweep | 3 | 3 | 1 | 2 | 2 | 1 | 1 | no |
| research/accel-ihpprice | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |

How many of the bugs seeded by hand in each subject's core logic its tests caught:

| subject | seeded bugs caught |
|---|---|
| cbam-cost-estimator | 2 of 6 |
| ics-calendar-check | 8 of 13 |
| osrobot-lipsweep | 0 of 4 |
| accel-ihpprice | 2 of 4 |

## Verdicts and worst defects

### cbam-cost-estimator

**It fails on correctness, verification and claims.** The reviewer named for it is a customs consultant who prepares CBAM declarations for EU importers.

The certificate arithmetic is right. An independent Python model reproduces two cases to the cent. The first is 1,000 t of steel at 2.0 t CO2 per tonne against a 1.37 benchmark in 2026 at EUR 80: 2,000 − 1,370 × 0.975 = 664.25 certificates, EUR 53,140. The second is a 2030 mix with a carbon price paid abroad: 3,914.733 certificates, EUR 313,178.64. The phase-out factors and the 2025 Omnibus dates also match the regulation.

The threshold verdict is where it went wrong.

- **Hydrogen importers were told they were exempt (high).** Regulation (EU) 2025/2083 leaves hydrogen out of the 50 t mass count because hydrogen is never exempt. The tool left it out of the count and stopped there, so any amount of hydrogen alone came back as "likely outside CBAM obligations". The test suite asserted that same wrong rule. I re-ran it: 10 t of hydrogen gave `underThreshold: true`.
- **Fertiliser mark-up (high).** On Commission default values, fertilisers get the general 10/20/30% mark-up. The auditor's secondary sources put the fertiliser mark-up at 1% (Implementing Regulation 2025/2621). For 300 t of ammonia in 2028 at EUR 70, that is EUR 35,847 against EUR 21,231. The auditor could not read the Official Journal text, so this one is filed for a check before anyone changes it.
- **Comma input.** "1,200" tonnes was read as 1.2 t, which also flips the verdict to exempt.
- **Weak tests.** 4 of 6 seeded bugs survived, including a changed 2030 phase-out factor and a changed 2028 mark-up.

### ics-calendar-check

**It fails on correctness.** The reviewer named for it is an engineer who keeps a published calendar feed working in Google, Outlook and Apple. It is the closest of the four to the bar: verification, craft and claims all reach 3.

Most of what it checks is right. The auditor built 27 .ics files and compared each verdict with the RFC 5545 text and with Python's `icalendar` 7.3.0. Line folding of multibyte UTF-8, escaping, the COUNT plus UNTIL rule, missing UID or DTSTAMP, and BEGIN/END mismatches all came out right, and the fixer's output parses cleanly.

- **The worst defect (high):** DTSTART and DTEND in different time zones were compared as plain clock times. A Tokyo-to-Honolulu flight, 20:00 Asia/Tokyo to 08:30 Pacific/Honolulu the same day (7.5 hours), was reported as an error, "ends before it starts", and the CLI exited 1. That would fail a CI build on a valid feed. I re-ran it and got the same error and exit code.
- **RFC 5545 MUST rules it misses (medium):** a DTSTAMP not in UTC, a date value without `VALUE=DATE`, and a duplicated DTSTART.
- **Weak tests:** 5 of 13 seeded bugs survived, all in secondary branches.

### osrobot-lipsweep

**It fails on verification, claims, fitness and domain.** The reviewer named for it is a robotics researcher working on assistive feeding and impedance control. The project sweeps how stiff a person's lips are and asks what force a spoon-feeding arm then applies.

The numbers reproduce. `experiments/run.py` rewrites `results.txt` byte for byte. A closed form the project never wrote down, the textbook equilibrium of a position loop pushing against a spring (Siciliano et al. 2009, ch. 9), gives every worst peak in sweep 1 to two decimals:

F = min(KP·LEAD·v, KP·K_LIP·X_DEPTH/(KP+K_LIP))

For KP 400, K_LIP 800 and a 15 mm depth, that is 400 × 800 × 0.015 / 1200 = 4.0 N.

The README's explanation of the numbers was wrong.

- **The plateau comes from a clamp, not from sway (high).** The README offered sway as a "plausible reason" the worst peak stays at 4.01 N for longer leads. Rerun with the 15 mm `X_DEPTH` clamp lifted, and the worst peaks at LEAD 0.10 and 0.20 s become 8.00 and 16.00 N, exactly the controller's stall push. I re-ran it and got 4.01, 4.01 with the clamp and 8.00, 16.00 without. `X_DEPTH` is an assumed constant, and no sweep varies it.
- **Tests:** they compare orderings with 0.5 N of slack. All 4 seeded bugs in the physics survived, among them halving the wall stiffness and removing the clamp.
- **No prior work is cited.** The nearest work is robot-assisted bite transfer (Belkhale et al. 2022; Shaikewitz et al. 2023; Jenamani et al. 2024) and impedance control (Hogan 1985).
- **The stiffness range is too soft.** The study sweeps 0.1 to 6.4 N/mm. The parent project's own sourced tissue sweep runs 4.3 to 90 N/mm, entirely above it.

### accel-ihpprice

**It fails on verification.** The reviewer named for it is a low-power digital designer who reads liberty files. The project reads idle flop, clock-gate and SRAM macro energies from the IHP SG13G2, SKY130 and NanGate45 libraries, then asks whether weight-stationary scheduling beats output-stationary.

The numbers reproduce from the libraries, which the auditor fetched one by one at the pinned commit.

- An independent liberty reader gives IHP flop 33.898 fJ (README 33.9), IHP gate 25.255 fJ (25.3), SKY130 flop 46.358 fJ (46.4) and SKY130 gate 39.657 fJ (39.7).
- All ten IHP macro read energies match.
- An independent verdict script gives the README's counts: 120 cells, 92 ungated wins, 120 gated wins, and 33 of 60 packed. I re-ran that script myself.

The weak points:

- **The headline has no sensitivity test (medium).** "Ungated WS wins about half the packed cells" leaves out clock-tree and wire energy. If clock overhead scales flop and gate energy by 1.5x, 2x or 3x, the 33 of 60 falls to 24, 18 and 12. Gated WS still wins all 120, so that result is robust; the ungated one is not.
- **Untested verdict code.** The code that turns energies into verdicts has no test, and 2 of 4 seeded bugs survived.
- **No prior work is cited:** Eyeriss, Timeloop/Accelergy, CACTI, Horowitz 2014.

## What changed in this PR

All of these fixes are in the same PR as the audits. Per the rubric, none of them raised a score this round. A later round re-audits.

- **cbam-cost-estimator.**
  - Hydrogen now counts as in scope whatever its mass.
  - Exactly 50 t now counts as not exceeding the threshold.
  - "1,200" now reads as 1,200.
  - Each fix comes with a test. The fertiliser mark-up and the benchmark editions are listed as known gaps in the README until someone reads the Official Journal text.
- **ics-calendar-check.** DTSTART and DTEND in different zones are now compared as instants through `Intl`. A zone `Intl` does not know, such as a custom VTIMEZONE name, gives no finding rather than a wrong one. Five new assertions cover different zones (both directions), the same zone, mixed UTC and zoned times, and all-day events.
- **osrobot-lipsweep.**
  - The README now gives the clamp as the cause and states the closed form.
  - The KP 200 dip is reported as real, not noise: it replicates on fresh seeds (0.60 and 0.59; interval 0.53 to 0.67).
  - Prior work and the stiffness-range gap are listed.
  - Two new tests pin the worst peaks to the closed form. The halved-wall-stiffness bug that survived the old tests now fails both of them.
- **accel-ihpprice.**
  - `min_group_size` now returns the smallest gate size that strictly wins, as its docstring promised. `results.txt` is unchanged when re-run against the fetched libraries.
  - `fetch_pdk.sh` no longer falls back to master in silence when the pinned commit cannot be fetched.
  - The README lists the sensitivity gap.

The pattern from earlier rounds holds. Each of these subjects got its arithmetic right, and each missed on something only a check against an outside source would catch: a regulation's exclusion read backwards, an equilibrium credited to the wrong cause, two time zones compared as plain clock times. Tests written by the same author check what the author believed, and here they kept believing it.
