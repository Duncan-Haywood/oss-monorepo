# house-continuous: does a joist that runs over a middle support span farther than a simple-span joist?

Follow-up to [`house-spans`](../house-spans) in track 12, open-source residential construction (`PROJECTS.md`; the "continuous spans" next step of `house-spans`). A floor or ceiling joist lapped over a beam or bearing wall in the middle is a two-span continuous member. The tool answers how much longer each span can be than a simple-span joist's, once you check every load pattern (live load on one span or both) against bending, shear, bearing and deflection. Headline result: **under full uniform load a two-span joist's peak moment equals a simple span's (wL&sup2;/8, at the middle support), so a bending-governed joist gains nothing from continuity; only deflection-governed members gain, mostly ceiling joists, by up to 18.5% in this sweep.** Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/house-continuous/

**Builds on.** The NDS allowable-stress checks and base values of `house-spans`, which this project imports, and classical continuous-beam theory (three-moment equation). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Not a design.** Structure is life safety. This is research code, not reviewed by a licensed engineer, not checked against published span tables, and it shows nothing complies with a building code. A real member needs a licensed engineer's or architect's review, or the local code's prescriptive path, and a permit.

## Use it
```bash
cd research/house-continuous
PYTHONPATH=src:../house-spans/src python -m house_continuous.cli compare --size 2x8 --case ceiling --spacing 16
PYTHONPATH=src:../house-spans/src python -m house_continuous.cli compare --size 2x10 --case floor --spans 3 --interior-bearing 1.5
```
The output gives the longest equal clear span per span for the simple, and the 2- or 3-span, member, and the governing check.

## Method (`src/house_continuous/model.py`)
- A pure-Python Euler-Bernoulli finite-element beam (16 elements per span, pin supports at each span end, consistent nodal loads, dense Gaussian elimination). Moments and shears come from the support reactions by statics, so the closed-form tests check the solver independently of its own element forces.
- **Pattern loading.** Dead load acts on every span. Live load acts on every subset of spans (4 patterns for two spans, 8 for three). Bending, shear and bearing take the worst pattern. Live deflection takes live load alone on the worst subset; total deflection takes dead plus the worst live subset.
- Allowables, size and repetitive factors, loads and cases are `house_spans.model`'s, including L/360 and L/240 for floors. Shear is taken at distance d from each face of a support. Design span = clear span + 1.5 in. No creep, dry service, lateral support assumed.
- **Interior bearing.** The middle support carries 1.25wL (2 spans) or 1.1wL (3 spans). The middle support bears over `interior_bearing_in`, default 3.5 in (a 2x4 plate or a 3.5 in beam). A joist lapped over a narrower support is checked at that width.
- Tests (11) check the two-span reactions (3wL/8, 5wL/4, 3wL/8), support moment wL&sup2;/8, peak positive moment 9wL&sup2;/128 and deflection 0.005416wL<sup>4</sup>/EI; the three-span reactions and moment; the one-span-loaded case (M = wL&sup2;/16, R = 7wL/16, from the three-moment equation); equilibrium for unequal spans; convergence to 5wL<sup>4</sup>/384EI for a single span; and that the one-span check reproduces `house-spans`' simple-span ratios.

## Reproduce
```bash
cd research/house-continuous
python -m pytest -q tests                        # 11 tests, under a second
python experiments/run.py                        # about a minute; writes experiments/results.txt
python experiments/figure.py                     # experiments/ceiling_gain.svg from results.txt
```

## Results (from `experiments/results.txt`; deterministic, SPF No. 2)
- **The rule: a two-span joist gains only where deflection governs the simple span.** In all 16 floor cells where bending governs the simple span, the two-span joist's span is unchanged (0.0%, one cell -0.1% from rounding) and the three-span joist gains 5.0% to 5.1%. Where live-load deflection governs the simple span (the 2x6 at all four spacings, 2x8 at 12 and 16 in, 2x10 at 12 in), two spans gain 2.6% to 12.2% and three spans 7.8% to 9.8%. Example, 2x10 at 16 in: 15 ft 3 in simple, 15 ft 3 in two-span, 16 ft 0 in three-span.
- **Ceiling joists gain the most**, since deflection governs every simple-span cell: 2x8 at 16 in goes from 19 ft 4 in (simple) to 22 ft 10 in (two spans, +18.1%) and 22 ft 0 in (three spans, +13.8%). Across 16 ceiling cells the two-span gain is 0.6% to 18.5% and the three-span gain 6.8% to 13.9%. Two spans can beat three: the end spans of a three-span member deflect more under pattern loading (2x6 at 12 in: +18.5% against +13.8%).
- **Snow rafters** are bending-governed in all 16 cells, so two spans gain nothing (-0.1% to +4.6% over 16 cells).
- **The middle support's bearing is the trap.** At 1.5 in over the middle support, the 2x10 at 16 in floor joist is limited to 11 ft 4 in by bearing on the 1.25wL reaction, 26% below the simple span. At 3.5 in or 5.5 in bearing governs no longer and bending gives 15 ft 3 in.
- **Stiffer deflection limits favour continuity.** At L/480 on live load the simple 2x10 at 16 in falls to 14 ft 1 in (deflection), the two-span joist stays at 15 ft 3 in (bending).

## Limitations
- Equal spans only (unequal spans are supported by `Beam`, but `check` and `max_span` take one span length). 2 or 3 spans.
- The span is clear span + bearing at every span. A real lapped joist's design span, splice and lap length, and the beam it sits on are not modelled. Beam deflection, support settlement and uplift at the end supports are not checked.
- All the limits of `house-spans`: two species at one grade, DF-L values unchecked there, no vibration (often what governs a real floor), no point loads, no notches, no creep. Loads are the usual minima.
- The numbers have not been compared with the AWC or ICC tables, which this project did not read.

## Next steps
Unequal spans (a 12 ft + 8 ft joist over a central beam). Model the beam under the joists. Floor vibration. Compare with the published tables a reader holds. Feed the 2-span option to `house-plan`'s framing search so the layout can choose a central beam against longer joists.

## Owner steps
None required. A licensed engineer's review of any member before a house is built is an owner step.

## Outside dependencies (vitamins)
Python, pytest, and `house-spans`' NDS base values, size factors and loads, which come from outside the model.

## References
- Hibbeler, R. C. *Structural Analysis* (continuous beams, three-moment equation), the standard textbook source of the closed forms the tests use. Formulas were derived and checked in the tests; the book was not read for this run.
- American Wood Council, *National Design Specification for Wood Construction*, sections as cited in [`house-spans`](../house-spans) (not re-read).
- [`research/house-spans`](../house-spans), this repository.
