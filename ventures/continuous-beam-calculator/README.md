# Continuous beam calculator

Free browser tool and CLI for a beam over any number of supports. You type the spans, the supports (pin, fixed or free for an overhang), the loads and the member. It returns exact moments, shears, reactions (with uplift) and deflections, with the **live load patterned span by span** so every point gets its worst case. Results are checked against the allowables and deflection limits you type.

Live: https://marisstella.app/continuous-beam-calculator/ · Explainer: [why loading every span is not the worst case](why-pattern-live-load-matters.html)

**Why it exists.** Span tables, free beam calculators and the framing tools in this repository (`wall-framing-takeoff`'s header, trimmer and cantilever checks) stop at a simple span or a single overhang. A deck or floor beam over three posts, or one that runs past a post, is indeterminate. On such a beam, loading every span is not the worst case: on two equal spans, live load on one span gives a 36% bigger sagging moment and lifts the far end.

## Use

```
node cli.mjs --example
node cli.mjs --spans 1.5,8,8,1.5 --supports free,pin,pin,pin,free --E 1400000 --section 1.5x9.25x3 \
  --udl D:60 --udl L:240 --Fb 1000 --Fv 175
node cli.mjs --json beam.json          # the object run() takes
node cli.mjs ... --no-pattern          # live load on every span at once
node cli.mjs ... --factors 1.2,1.6     # LRFD strength combination (deflection stays unfactored)
node cli.mjs ... --units metric        # m, kN, kN/m, GPa, mm⁴; deflection in mm
```

Loads: `--udl CASE:w[@x1-x2]`, `--udl CASE:w1..w2@x1-x2` (tapered), `--point CASE:P@x`, `--moment CASE:M@x` (clockwise). CASE is D or L. Loads and deflection are positive down, reactions positive up, moments positive sagging.

From code: `import { run, analyse } from './beam.mjs'`. `run()` takes practical units, while `analyse()` takes any consistent units, with EI as one number or one per span.

## Method

- **Exact elements.** The beam is cut at every support and at every load start, end and point. Inside each piece the load is linear, so an Euler-Bernoulli element with a consistent load vector (three Gauss points integrate it exactly) gives exact nodal displacements. Shear (quadratic), moment (cubic) and deflection (quintic) inside each piece come in closed form from the piece's end forces. The stiffness matrix is factorised once.
- **Pattern envelope by superposition.** Dead load is solved once and each span's live load once. At any station, the largest effect is dead plus every span's contribution with the same sign, which is exact without enumerating 2ⁿ patterns. The governing pattern is then re-solved and its exact peak found inside the span: roots of the shear for moment, and bisection on the slope for deflection. Contributions below 1e-10 of the largest at a station count as zero, so a determinate overhang doesn't list spans that do nothing.
- **Checks.** Live deflection is checked against L/360 and total against L/240 (both typed). Cantilevers are judged on twice the overhang. Bending stress is M/S and shear is 1.5V/A, each against the allowable exactly as typed. A support whose reaction goes negative under dead load plus the worst live pattern is reported as uplift.

## Verification

- `node --test beam.test.mjs page.test.mjs usage.test.mjs` (24 tests). They cover textbook closed forms (simple span uniform and off-centre point, cantilevers, propped cantilever, fixed-fixed, two equal spans 3/8-10/8-3/8, three equal spans −0.1wL² and the patterned 0.10125wL², 0.075wL² and −0.1167wL²), the three-moment equation with unequal I, equilibrium and slope and deflection continuity on a beam with a fixed end, overhang, tapered load and point moment, and the patterned envelope against brute force over all 16 live arrangements of a four-span beam with an overhang. The explainer's numbers are pinned to the CLI's output.
- `python3 check/differential.py` builds an independent solution with no stiffness matrix. It uses Macaulay singularity functions in exact `fractions.Fraction` arithmetic, with the reactions, fixed-end moments and integration constants solved from support and equilibrium conditions. On 60 random beams (1 to 5 spans; pin, fixed and free supports; point loads, point moments, partial trapezoids), at 201 stations each, the worst relative difference is 6.5e-12 for moment, 8.8e-12 for deflection and 5.9e-12 for reactions (`check/RESULT.txt`).
- Page driven in headless Chromium: both presets, the unstable-beam and bad-load errors, the units switch, no console errors, no horizontal scroll at 390 px.

## Not in it

It doesn't choose a member or adjust allowables (duration, size, wet use, repetitive member, beam stability factor), and it doesn't check lateral-torsional buckling, bearing, notches, connections, vibration, shear deformation (Timoshenko), internal hinges, spring supports or settlement. Moving vehicle loads and partial-span live patterns (live on part of one span) are also left out: patterning is span by span. The example E, Fb and Fv are typed for illustration and aren't from a grade table. **Not engineering advice.**

## Next

- Internal hinges and spring supports (posts on soil, a beam bearing on another beam).
- A section picker that runs the check across a list of typed sizes and reports the lightest that passes.
- Wire it into `wall-framing-takeoff` so the floor and deck beams over several posts are checked as continuous members, not simple spans.

MIT licensed. Free and as-is, no warranty.
