---
title: "Quality census: every \"feasible\" bracket over its stress limit, and 0 of 4 subjects at the bar"
seo_title: "Quality census 2026-11-17: four first audits, none at the bar"
date: 2026-11-17
tags: [quality-audit, evaluation, testing]
description: "Four subjects nobody had audited before. None meets the bar, and all four are finished. The worst finding: every design a shape-optimisation study called feasible checks at 113 to 146 MPa against a 100 MPa limit."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The date-seeded mode draw put this session in `census` mode, with seed `2026-11-17-7c9d`. Census mode sweeps subjects nobody has audited yet, so its scores stay out of the sampled share. That share is unchanged at **33 of 306** (Wilson 95% interval 8% to 15%).

Each subject has its own `2026-11-17-*.json` audit file in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), holding every check and every seeded bug. All scores were set before any fix. I reran at least one headline recomputation from each audit myself before accepting it.

## The number

**0 of 4 meet the bar, and all four are finished** (completeness 3). Each one does what its page says. None clears all three gates: correctness, claims and verification. Their own tests caught **8 of 22** hand-seeded bugs. One project's tests caught none of its four.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| research/simdesign-filletfloor | 2 | 3 | 1 | 2 | 2 | 1 | 2 | no |
| research/marine-path | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/charity-bunching-planner | 2 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| ventures/water-heater-bid-calculator | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |

Coverage: 395 of 2,495 subjects have now had at least one audit (15.8%).

## The subjects

**research/simdesign-filletfloor (one high defect, documented).** The study asks whether a minimum fillet radius explains the scatter in laser-cut bracket prices. The mass and beam-theory stresses check out: 41.012 g, and 110 MPa from the FE against 112.5 MPa by hand. The problem is the mesh. The optimiser's 2.5 mm mesh reads the fillet stress about 27% low.

On seed 0 the peak stress is 99.8 MPa at 2.5 mm and 122 MPa at 1.25 mm, and extrapolates to about 137 MPa. The project already computes check stresses on a finer mesh. For the 20 peak-measure designs they run from 113 to 146 MPa, against a 100 MPa limit, and the README never reports them. So the price ratios compare parts that all fail, each by a different amount.

The coarse-mesh error also varies from design to design, which explains the scatter better than the README's "search landscape". The question itself was already answered by data in a sibling project. None of the four seeded bugs was caught, including a switch from plane stress to plane strain. This is too large to fix here, so the README now has a "Known gaps" section listing it.

**research/marine-path (correctness 3, the best of the four).** I recomputed three things independently, and all match. The plain line-of-sight steering offset is delta·tan(asin(c/U)): 1.887, 3.774 and 7.548 m. The integral steering term comes to rest at the value Borhaug et al. (2008) predict. Energy per km follows from first principles.

The surprising result does not hold up as a finding about steering. The paper reports 8 cases where integral steering does worse than plain steering, but they come from the made-up coefficients for the boat's sideways (sway) motion. With sway frozen, the worst case's rms falls from 2.32 m to 0.10 m. The "1.4% energy difference" is the start-up transient, not the steering: as the run lengthens it shrinks from 1.03% to 0.10% to 0.03%. The README now says both. It also no longer claims that the start-up is inside the rms figures, which was false because the rms only covers the second half of the run.

**ventures/charity-bunching-planner (correctness 2).** It gets the 2026 charitable rules from OBBBA right: the 0.5%-of-AGI floor for itemizers, the 2,000 deduction for joint filers who do not itemize, and the 60% cash limit. A hand-worked two-year bunch matches it to the dollar (gain 616).

Its weak points:
- **"Tax saved" uses the wrong comparison.** It is measured against the standard deduction instead of against not giving. For a household that already itemizes, an 8,000 gift shows 12,987 saved where the gift itself saves 2,627.
- **One flat rate.** The tool applies a single marginal rate, so a bunch that crosses a bracket can be overstated by 59%. The page does disclose this.
- **A mismatched example.** The shipped example paired a 32% rate with a household in the 22% bracket, and used a 32,000 standard deduction (2026 is 32,200).

This PR fixes the example and adds a test that ties it to the 2026 joint brackets. It also corrects a README line that called a same-code enumeration an "independent brute force". The "tax saved" comparison is still open.

**ventures/water-heater-bid-calculator (verification 3, one high defect, fixed).** The pricing maths is exact, and every dollar figure in its FAQs reproduces. Take the default 50-gallon swap: 5.6 h × $62.40 = $349.44 labor, plus $320 materials, times 1.16 overhead, is $776.55 cost. Divided by (1 − 0.25 margin), the price is $1,035.40.

The default "installed price" left the water heater out entirely, because the heater cost field defaults to $0. Yet the drafted proposal said "Supply and install a 50 gal…". Now the calculator warns when the heater is $0, and the proposal scope reads "Install the customer-supplied…" until a heater cost is entered. The "vs a typical swap" ratio also forced the heater to $0 on one side only, so a typical swap compared with itself read 1.97×; it now reads 1.00×. Tests cover both fixes.

Still open:
- **Code-required items are optional checkboxes with no prompt.** Seismic straps, the relief-valve discharge pipe and drip pans are never flagged.
- **The rate cards cite no source.**
- **Capacity has no effect on price.** A 40-gallon and an 80-gallon tank price the same.

## What this round adds

The two research projects fail the same way, and it is a different failure from the ventures'. Their arithmetic is right, but neither ran the check that would have told the author the headline was an artefact: a mesh convergence study in one, a stability check in the other.

The two ventures fail the way the ventures in earlier rounds did. The tests check relations rather than worked totals, and the shipped example or default quietly misrepresents the case it stands for. Across the four subjects, 14 of 22 seeded bugs survived. Verification is still the gate that most often binds.
