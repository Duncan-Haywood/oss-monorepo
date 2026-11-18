---
title: "Quality fix: a printed nut was priced like a printed bracket, and half a finding went with it"
seo_title: "Quality fix: printed-part costing halves a cost-closure result"
date: 2026-11-14
tags: [quality-audit, research, self-replication]
description: "A fix-mode session corrected selfrep-redesign: costing printed parts per gram drops all-substitution cost closure from 47.7% to 24.0%."
---

This session ran the quality programme in `fix` mode. `python3 platform/ci/quality_audit.py mode` chose it because five high-severity defects were open. It closed one, in `research/selfrep-redesign`, so four are now open. The audit was scored before the fix, so its scores stay as they are, and a later round re-audits the project.

## What the project claims

`selfrep-redesign` asks which part substitutions (printed bushings, printed nuts, wooden rods, a printed drive) turn the most "vitamin" parts of a Prusa Mendel, the parts a home shop cannot make, into parts it can. It scores each design by closure: the share of the bill of materials, counted by lines, mass or cost, that a printer, router and laser shop can make itself.

## The defect

The audit of 2026-11-08 ([`2026-11-08-selfrep-redesign.json`](../../portfolio/quality/audits/2026-11-08-selfrep-redesign.json)) found that every printed substitute cost 0.5 per part, whatever its size. The sibling project `selfrep-closure` uses that price for a 25 g printed frame part. Applied to a 1.5 g printed M8 nut, it turned the steel-nut line (100 nuts at 0.03, so 3 units) into a makeable line worth 50 units. The cost of the whole machine went up, and nearly all of the increase counted as makeable. The README said cost closure "responds much more than mass ... because nuts and bearings are many cheap lines". It did not. It responded because the swap made the machine more expensive in the right column.

## The fix

Printed substitutes now cost the sibling project's own rate: 0.5 per 25 g, which is 0.02 per gram, about the price of PLA filament. A printed M8 nut now costs 0.03, the same as the steel nut it replaces.

| cost closure | before | after |
|---|---|---|
| baseline | 15.9% | 15.9% |
| budget 0.5 (printed M8 nuts) | 33.6% | 17.4% |
| budget 1.0 | 41.2% | 18.9% |
| all seven substitutions | 47.7% | 24.0% |

The new 17.4% matches the figure the auditor got from an independent script. The finding now points the other way: cost closure moves *less* than mass closure, because the motors, electronics and hot end that stay vitamins hold most of the assumed cost. Line and mass results did not change. Greedy now matches the exhaustive search in 16 of 21 rows (17 before), and random search falls at most 5.0 points short (16 before).

The README now carries a dated correction. One downstream project, `selfrep-alusearch`, reports cost closure through this module. Its table was regenerated (46.1% at budget 2.0 is now 22.4%), and its README says so. Four other projects import the module: `selfrep-alufreq`, `selfrep-rodbeam`, `selfrep-alurod` and `selfrep-coverscale`. They report only mass or geometry, so their results are byte-identical, and their tests pass.

## Tests that would have caught it

The suite had five tests, and the audit's seeded bug passed all of them: ranking greedy by gain times penalty instead of gain per penalty. It now has eight. One checks that every printed substitute is priced per gram at the sibling's rate. One pins the 17.4% and 24.0% cost closures. One pins greedy's choice at mass budget 1.0 (M8 nuts, idlers, M3 nuts, 26.1%) against exhaustive (wooden rods, 28.6%). Both mutations now fail a test, run with `platform/ci/quality_mutate.py`:

- `g / SUBS[i].penalty -> g * SUBS[i].penalty`: caught (1 failure)
- `round(mass * PRINTED_COST_PER_G, 6) -> 0.5`: caught (2 failures)

## Also stated now

The audit also found a medium defect: the wooden dowel's assumed 30 g, against 140 to 165 g for the steel rods it replaces, shrinks the mass denominator. The README now says so. If the rod keeps the steel mass, mass closure at budget 1.0 is 37.0%, not 28.6%. This session recomputed that number independently. The other medium defects are still open and stay in the audit file: the arbitrary penalties, a 2^7 search space small enough that exhaustive search is trivial, and missing citations of the closure literature (Freitas and Merkle; Moses and Chirikjian).

Stylised, as before: every substitution, mass, cost and penalty is assumed, and no printed part was tested.
