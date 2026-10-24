# house-truss: how much lumber does a prefabricated roof truss save over rafters and ceiling joists?

A project of track 12, open-source residential construction (`PROJECTS.md`, the truss option listed under `house-open-design`'s next steps). It solves a W-type wood roof truss as a pin-jointed frame (a small direct-stiffness solver, no dependencies), checks every chord and web against NDS allowable-stress rules, searches for the lightest passing 2x4 to 2x8 truss, and compares its lumber with stick-built rafters plus ceiling joists sized by [`house-spans`](../house-spans). Headline, stylised: across 12 to 30 ft spans at 30 psf snow the lightest passing truss at 24 in o.c. uses 40% to 55% less nominal lumber per sq ft of plan than 16 in rafters plus ceiling joists. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/house-truss/

**Builds on.** NDS allowable-stress design (tension, compression with the column stability factor, combined bending and axial load), and the SPF No. 2 values, column stability code and rafter/joist sizing of [`house-framing`](../house-framing) and [`house-spans`](../house-spans). Roof trusses are designed in practice to ANSI/TPI 1 with plate manufacturers' software; none of that was read or reproduced here. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Not a design.** Structure is life safety. A real truss is an engineered, sealed component with tested connector plates, bracing and a heel detail, none of which this models. This is research code: it has not been checked against a truss design program or reviewed by a licensed engineer, and shows nothing about code compliance. A licensed engineer's review (or a truss manufacturer's sealed design), the local code and a permit come before anyone builds from it.

## Use it
```bash
cd research/house-truss
PYTHONPATH=src:../house-spans/src:../house-framing/src python -m house_truss.cli size --span 24            # lightest truss vs. stick
PYTHONPATH=src:../house-spans/src:../house-framing/src python -m house_truss.cli size --span 28 --snow 50 --pitch 6
PYTHONPATH=src:../house-spans/src:../house-framing/src python -m house_truss.cli check --span 24 --top 2x6 --bottom 2x6
```

## Method (`src/house_truss/model.py`)
- **Geometry.** Seven nodes, eleven members: a top chord in four panels (nodes at span/4), a bottom chord in three panels (nodes at span/3) and four webs. Eleven members plus three reactions equals 2 x 7 joints, so it is statically determinate. Span is heel to heel.
- **Solver.** Direct stiffness on axial bars, pinned at one heel and a roller at the other, Gaussian elimination written out in the file. Tests compare it with hand statics (below).
- **Loads on plan.** 15 psf dead plus snow (30 or 50 psf) on the top chord and 5 psf dead on the ceiling (combination `D+snow`, CD 1.15), and 15 psf dead on top with 5 + 10 psf on the ceiling (`D+ceiling live`, CD 1.0). Panel-point loads come from tributary plan length times truss spacing.
- **Top chord.** Axial compression from the solver plus bending from the roof load between panel points (simple span, conservative), combined as (f<sub>c</sub>/F<sub>c</sub>&prime;)&sup2; + f<sub>b</sub>/(F<sub>b</sub>&prime;(1 &minus; f<sub>c</sub>/F<sub>cE</sub>)) &le; 1 (NDS 3.9.2). Buckling in the plane of the truss uses the member depth; the weak axis is **assumed braced** by sheathing or purlins.
- **Bottom chord.** Tension plus ceiling bending, f<sub>t</sub>/F<sub>t</sub>&prime; + f<sub>b</sub>/F<sub>b</sub>&prime; &le; 1.
- **Webs.** Axial tension, or compression with buckling about the 1.5 in axis, **unbraced** (conservative).
- **Deflection.** Vertical movement of the bottom-chord nodes against span/240.
- **Search.** `lightest` tries every combination of 2x4, 2x6, 2x8 chords and 2x4 or 2x6 webs and keeps the passing truss with the least nominal lumber.
- **Stick alternative.** `stick_frame` takes the smallest 2x rafter at 16 in for half the span on plan (plus 1/cos slope length) and the smallest ceiling joist spanning the full width, both from `house-spans`.
- **Values.** SPF No. 2: F<sub>b</sub> 875, F<sub>c</sub> 1150, E 1.4 million, E<sub>min</sub> 510,000 psi as in `house-framing`. **F<sub>t</sub> = 450 psi was written from memory of NDS Supplement Table 4A and has not been checked against a copy.**

## Reproduce
```bash
pip install pytest
cd research/house-truss
python -m pytest -q tests                                                   # 9 tests
PYTHONPATH=src:../house-spans/src:../house-framing/src python experiments/run.py   # writes experiments/results.txt
python experiments/figure.py                                                # experiments/lumber_vs_span.svg
```
Worked checks in `tests/`: a 1000 lb apex load puts &minus;P/(2 sin&theta;) in the heel top chord and P/(2 tan&theta;) in the bottom chord to 9 digits; the 24 ft service-load heel force equals (R &minus; heel load)/sin&theta; with R = 1200 lb; heel joint horizontal equilibrium closes.

## Results (from `experiments/results.txt`; deterministic)
- **Truss against stick, 30 psf snow, 4/12** (figure). At 24 ft the lightest truss is a 2x6 top chord, 2x6 bottom chord and 2x4 webs: 60.6 board feet each, 1.26 bf per sq ft of plan at 24 in o.c. The stick roof is 2x8 rafters plus 2x10 ceiling joists at 16 in: 2.30 bf per sq ft. Saving 45%. Over spans of 12 to 30 ft the saving ranges from 40% to 55%. At 32 ft no stick pair from `house-spans` passes and no 2x4 to 2x8 W truss does either.
- **At 50 psf snow** the saving is 39% to 53% over 12 to 30 ft; heavier chords are needed from 18 ft up, but the stick roof grows faster.
- **What governs.** At 24 ft a 2x4 top chord is at 2.81 of capacity (compression with bending between panel points); a 2x6 top chord is at 0.59. The bottom chord in tension is at 1.05 as a 2x4 and 0.61 as a 2x6. Webs are never close (0.17), and deflection is not close (0.14 to 0.26 of the L/240 allowance).
- **Pitch** (24 ft): lumber per sq ft is lowest at 6/12 (1.19), 1.22 at 3/12, 1.26 at 4/12, 1.31 at 8/12 and 1.57 at 12/12. Steeper roofs cut chord force but lengthen the chords.
- **Spacing** (24 ft, 4/12): trusses at 16 in need 52.6 bf each and 19.2 in the same, but per sq ft of plan that is 1.64 and 1.37, against 1.26 at 24 in with a heavier 2x6 bottom chord.

## Limitations
- **Stylised.** Pin joints, no connector plates, no heel or ridge details, no uplift, no unbalanced snow, no drift, no wind, no overhang. Lumber counts exclude waste and plates. Real trusses are designed to ANSI/TPI 1 by a truss engineer, and this has **not** been compared with a commercial truss design.
- The stick framing is also simplified: `house-spans` ignores rafter thrust, and ridge and collar ties are not sized. The stick numbers are therefore *light* (favouring stick), and the comparison ignores labour, crane time, and the price of plates and engineering.
- Panel-point layout and the bracing assumptions (top-chord weak axis braced, bottom chord not checked for buckling because it is in tension) decide the answer; a single truss topology was tried.
- F<sub>t</sub> unchecked (above); one species and grade; no moisture, temperature or size factor beyond the bending C<sub>F</sub> reused for tension.
- Compare lumber, not cost: this project prices nothing.

## Next steps
Check F<sub>t</sub> and the other design values against the NDS Supplement. Compare against an open or published truss design example. Add a Fink and a scissors topology, an overhang, and unbalanced snow. Price trusses against stick framing with `house-cost`'s sourced prices once they exist. Offer the truss as an option in `house-open-design`'s roof.

## Owner steps
A truss manufacturer's sealed design or a licensed engineer's review, and a permit. No purchases were made or priced.

## Outside dependencies (vitamins)
Python and pytest only; the sibling projects `house-spans` and `house-framing` for design values and stick sizing. A real truss also needs tested connector plates, a truss design program, a manufacturer and a crane, none of which this project can make.
