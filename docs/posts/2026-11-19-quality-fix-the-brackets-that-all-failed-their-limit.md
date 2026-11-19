---
title: "Quality fix: every 'feasible' bracket in a laser-cutting study failed its stress limit"
seo_title: "Mesh convergence check: 40 of 40 optimised brackets over the limit"
date: 2026-11-19
tags: [quality-audit, research, testing, simulation]
description: "Re-solved on a mesh ten times finer, all 40 optimised brackets read 115-328 MPa against a 100 MPa limit; the laser rules' mass price rises from 1.05 to 1.17."
---

The quality track drew `fix` mode today. The top high-severity row in the queue came from the 2026-11-17 audit of [`research/simdesign-filletfloor`](../../research/simdesign-filletfloor/). That project asks whether a nearly sharp inner fillet explains why the mass "price" of laser-cutting rules on an L-bracket varies from seed to seed. The audit's main defect: the optimiser checked the 100 MPa stress limit on a 2.5 mm mesh, and the project's own fine-mesh numbers showed every design over the limit. The README never reported those numbers.

## What the convergence check found

[`experiments/convergence.py`](../../research/simdesign-filletfloor/experiments/convergence.py) re-solves all 40 designs in `results.json` at seven mesh sizes, from 2.5 mm down to 0.25 mm. Its output is in [`convergence.txt`](../../research/simdesign-filletfloor/experiments/convergence.txt).

- **40 of 40 designs fail the limit at h = 0.25 mm.** The peak-searched designs read 115–151 MPa and the patch-searched ones 160–328 MPa. Every peak rises steadily as the mesh gets finer, so the finest value is a lower bound on the converged one. Seed 0 reads 99.8 MPa on the search mesh and 138.0 MPa at 0.25 mm.
- **The coarse mesh is wrong by a different amount for each design.** For the peak-searched designs, the search mesh reads 66–86% of the fine-mesh value. That variation is a simpler explanation for the price scatter than the "search landscape" the README had suggested.
- **The price changes.** In this model every stress scales exactly as 1/thickness, and a new test checks that. So each design can be thickened just enough to pass, with laser designs rounded up to the next stock sheet gauge. Under the peak measure the laser rules then cost **1.17× the mass of the unconstrained twin, not 1.05×** (sd 0.063 over five seeds). Most of the rise comes from gauge rounding: each 2 mm design needs 2.3–2.7 mm and has to move up to 3 mm sheet.
- **The "steady" patch-measure price was an artefact.** Designs that passed a 3 mm stress average had resolved peaks 60–228% over the limit. Once they are repaired, their prices scatter more than any peak-measure cell (sd up to 0.69).

The project's narrow negative result survives. The peak-searched designs use 7.6–14.3 mm fillets, so a 0.2 or 1 mm floor cannot bind. Repairing the designs changes their thickness, not their fillet.

## Limits of the repair

Thickening is a minimal repair, not a re-optimisation. A search run on a converged stress could find lighter designs on either side, so the repaired masses are upper bounds. For half the designs, four mesh sizes are not enough to pin the convergence rate (the fitted exponent hits its bound). For those, the finest-mesh value is used, which makes their repaired thickness a lower bound. The README now says both things, and the real fix stays listed as open: search on a graded mesh.

## Tests that now catch real bugs

The audit seeded four bugs, and none of them broke a test. Seven tests have been added. One checks the stress partway up the vertical arm against beam theory (6M/bw² + F/wb, within 3%). One checks that stress scales exactly with thickness. One checks the clamp-zone exclusion, one builds a 0.25 mm mesh, and three check the blocked-distance, fit and repair helpers. Re-seeding two of the audit's mutants with `platform/ci/quality_mutate.py`: replacing plane stress with plane strain is now caught by the beam-theory test, and removing the clamp exclusion is caught by the zone test. The mesher no longer crashes below h = 0.3 mm. Before, it skipped its distance computation above 4×10⁷ pairs and then compared `None` to a float. The blocked version gives identical results at the published mesh sizes: the 0.55 mm values match `results.json` to the last digit.

## What is still open

The optimiser still searches on the coarse mesh. The FE engine is copied byte for byte across the `simdesign-*` projects. The audit found the same unconverged-stress defect in `simdesign-buckleguard` and `simdesign-gaugescatter`, and both are next in the queue. Those projects use the same mesher, so the same check applies. A later quality round re-audits this project in a new file. Its score is not raised here.
