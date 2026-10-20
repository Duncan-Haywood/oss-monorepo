---
title: "Simulation-first mechanical design: what 58 small studies found"
date: 2026-10-20
description: "Beam theory vs 3D FE, an LLM agent vs CMA-ES and Bayesian optimisation, topology optimisation and stress singularities: findings from 58 simulation studies."
tags: [research, engineering, finite-elements, topology-optimisation, optimisation]
---

# Simulation-first mechanical design: what 58 small studies found

This repository has a research track called simulation-first design. Its goal,
from [`research/PROJECTS.md`](/research/PROJECTS.md), is "the shared engine for
the other tracks: a design written as code is simulated, optimised and turned
into manufacturing files, with an open toolchain kept in-house." Its five
milestones: a finite-element-sized printable bracket, a Python port of
Sigmund's 99-line topology optimisation, beam theory against 2D and 3D
elements, LLM-proposed designs against CMA-ES and Bayesian optimisation, and
manufacturability rules for four shop processes.

All five exist, among 58 `research/simdesign-*` projects; most of the rest
are follow-ups on one result. AI coding agents (Claude sessions) did the
research, with the repository's owner steering. Each README has a method,
results, limitations and a reproduce command, and every number below is
copied from one.

The caveats come first. Everything is simulated, mostly in 2D plane stress.
Material properties and rule values are assumed round numbers, not datasheet
values, and nothing has been built or tested. This is not engineering advice,
and none of it is validated for real parts.

## 1. Cheap beam models pick nearly the same design as 3D elements, and the error has a sign

[`research/simdesign-fidelity/`](/research/simdesign-fidelity/) sizes a
cantilever (100 N tip load, deflection limit L/50, 20 MPa stress limit) with
four models and judges each design with 3D finite elements. Over 12 cases the
cheaper models chose a depth within about 5% of the 3D optimum.

Which way they miss matters. Euler–Bernoulli was the only
model that ever violated a limit: 1.051 of the deflection limit at L = 40 mm,
b = 5 mm, a stubby, narrow beam where it ignores shear. Timoshenko and 2D
plane stress never violated a limit but were heavier than needed, by up to 4.9%
in mass, most for the widest sections. A wide beam behaves closer to plane
strain, stiffer by about 1/(1 − ν²) = 1.15 for ν 0.36, so plane stress suits
narrow beams only.

A sibling study, [`research/simdesign-rank/`](/research/simdesign-rank/),
asked whether cheap models put candidates in the same order. On 3 seeds of 80 random cantilevers, all three
cheap models ranked designs by stiffness per mass with Kendall τ 0.987 to 0.996
against the 3D reference, and the 3D-best design was rank 1 in every cheap
model in all 9 cases. Yet merit relative to 3D ranged from 0.89 to 1.15 per
design. In the README's words, "a cheap model can be a good *ranker* and a poor
*predictor*." Stress was read away from the clamp, so neither study probes
stress concentrations.

## 2. An LLM agent beat CMA-ES and Bayesian optimisation, for reasons that say little about LLMs

[`research/simdesign-llm/`](/research/simdesign-llm/) gives four methods 40
finite-element calls each to minimise an L-bracket's mass (15 MPa stress and
2.5 mm deflection limits). Baselines get 20 seeds each. The "LLM" was the
Claude session itself, writing four rounds of ten proposals after reading the
scores.

| method | n=10 | n=20 | n=30 | n=40 |
|---|---|---|---|---|
| random search (median of 20) | 50.04 g | 44.68 g | 42.27 g | 38.96 g |
| CMA-ES (median of 20) | 54.13 g | 42.37 g | 35.75 g | 33.28 g |
| Bayesian opt, GP-EI (median of 20) | 52.00 g | 37.93 g | 34.41 g | 32.19 g |
| session agent (n = 1) | 29.71 g | 23.73 g | 23.25 g | 22.99 g |

The best-known design, from differential evolution with 1,845 evaluations, is
22.39 g. The agent finished 2.7% above it; no baseline seed out of 20 beat it.

The README calls this weak evidence. The agent had read the earlier bracket
project, which put the optimum at the upper width bound with a large fillet.
Its first round, written before any score, reached 29.71 g, better than every
baseline's median at 40 evaluations: "That is prior knowledge, not search."
It is one trajectory on a three-variable problem with untuned baselines, and
a fair test would hide the prior results from the proposer.

## 3. Peak stress at a fillet keeps rising: the reading is at fault, not the solver

[`research/simdesign-bracket/`](/research/simdesign-bracket/) found that with
a sharp inner corner the peak stress grew without bound under refinement (24.9
to 43.0 MPa from h = 3 to 0.7 mm). With a 6 mm fillet it still rose from 22.7 to 26.3 MPa, and the optimum moved
from 19.44 MPa to 20.81 MPa on the finest mesh, just over its 20 MPa limit.

[`research/simdesign-kirsch/`](/research/simdesign-kirsch/) checked the same
code against Kirsch's exact peak of 3σ at a hole in a plate under tension. The
field error fell at second order, so the solver is right. But the largest
element-centroid stress, the reading the bracket studies used, sat below the exact value on every mesh:
−27.2% on the coarsest mesh (h/a = 0.393) and −1.1% on the finest (h/a =
0.012), converging only at first order. Reading the stress at the vertices on
the hole edge instead was within +0.69% on every mesh. The centroid
effectively samples the stress about 0.3–0.4 element sizes inside the edge.
That explains the drift, though it gives no knock-down factor for other
geometries.

## 4. Designs that pass on a coarse mesh can all fail on a fine one

[`research/simdesign-meshconverge/`](/research/simdesign-meshconverge/) took a
2 mm laser-cut steel bracket with a small coarse-mesh feasible region and
rescanned it against a 100 MPa limit. On h = 1.5 mm,
1 to 5 widths per fillet radius were feasible. On h = 1.0 mm and h = 0.5 mm,
none were, for every radius scanned. The lowest peak stress rose by 11 to 14
percent from h = 1.5 to 0.5 mm (for example 91.2 to 103.0 MPa at r = 14 mm).
It does not show that no feasible design exists (a slenderness rule cut the
scan off at w = 16 mm), but the coarse-mesh feasible region did not survive.

## 5. What manufacturing rules cost: casting +43%, CNC +24%, laser cutting nothing

[`research/simdesign-dfm/`](/research/simdesign-dfm/) sized the same bracket
per process with and without its rules, same material, and reports the mass
ratio as the "price of manufacturability":

| process (material) | mass with rules | mass without | price |
|---|---|---|---|
| FDM (plastic) | 16.28 g | 16.28 g | 1.000 |
| CNC routing (aluminium plate) | 14.09 g | 11.37 g | 1.239 |
| laser cutting (steel sheet) | 33.32 g | 33.55 g | 0.993 |
| casting (cast aluminium) | 25.41 g | 17.81 g | 1.427 |

The causes were not the obvious ones. In casting, the even-section
(hot-spot) rule drove the price, not the 1.5° draft: switching the wall-ratio
rule off gave 18.0 g. For CNC routing, the 3 mm thinnest stock plate did it,
not the tool radius; for tool radii 0.5 to 9 mm the best mass stayed between
14.1 and 14.2 g. Laser cutting's 0.993 is noise. Two caveats matter: every
rule value is assumed, and re-solving the chosen designs at h = 0.7 mm gave
peak stresses 17% to 26% above the working stress, the mesh effect from
finding 3.

## 6. Heaviside projection makes the optimiser's number honest, not the part stiffer

After [`research/simdesign-topopt/`](/research/simdesign-topopt/) ported
Sigmund's SIMP code,
[`research/simdesign-heaviside/`](/research/simdesign-heaviside/) compared
filters on a 90×30 half-MBB beam (dimensionless units). With the sensitivity
or density filter, the thresholded black-and-white part's compliance was
10–15% below what the optimiser's grey field reported. With a
density filter, Heaviside projection and β continuation from 1 to 64, the two
agreed to 0.1%. The three discrete parts had the same compliance within 0.9%
(190.3 to 192.0). Continuation mattered: starting directly at β = 64 gave a
model compliance of 344.8 against 192.1.

[`research/simdesign-robust/`](/research/simdesign-robust/) then eroded each
design with a 0.2 threshold error. The plain Heaviside design disconnected on
every mesh, so it no longer carried the load. The robust
eroded/blueprint/dilated formulation kept its eroded compliance at 224–226,
for a nominal cost of 3.4%, 0.9% and 0.8% on three meshes and about 2.5× the
wall time. Neither showed a fixed physical minimum feature size ("not shown",
not "absent", on a homemade measure).

## 7. Topology optimisation depends on where it starts, unless you ramp the penalty

[`research/simdesign-starts/`](/research/simdesign-starts/) started the same
SIMP optimiser from 30 random density fields per setting. With the penalty
fixed at p = 3, compliance varied by 1.4–2.8%, but a median of 12–23% of
elements changed state for noise of ±0.3 and above. The uniform start, which
the 99-line code uses, was not special: on the 90×30 mesh, 25–28 of 30 random
starts beat it. With continuation (p from 1 to 3), the spread fell to
0.0–0.4%.

[`research/simdesign-stuck/`](/research/simdesign-stuck/) adds a warning.
Five starts that stayed in a different layout after 1200 iterations were all
sent by continuation to one and the same design, with compliance 204.01. That
was worse than the 202.83 that three of them reached by just running 1200
more iterations at p = 3. Continuation removes the start dependence; it does
not guarantee the best optimum (one problem, one mesh).

## 8. A buckling rule pointed the wrong way, and the load direction decides the margin

The laser-cut bracket chain used a w/b ≤ 8 slenderness ceiling as a crude
guard against out-of-plane buckling, which a 2D model cannot see.
[`research/simdesign-webbuckle/`](/research/simdesign-webbuckle/) checked it
with closed-form lateral-torsional buckling. The factor rises with width at
fixed thickness, so a ceiling on w/b protects nothing for this mode. At
b = 1 mm the old rule would allow w = 8 mm, where the factor is 0.41.

[`research/simdesign-lbuckle/`](/research/simdesign-lbuckle/) then modelled a
1.5 mm design as one 3D body. Under the design load the buckling factor was
4.01, above the closed form's 3.47 and the assumed floor of 3. With the load
reversed, putting the vertical arm in compression, it fell to 2.25, below the
floor and 35% below the closed form, which cannot see that case at all. These
are linear buckling factors of a perfect elastic body, so upper bounds on real
sheet; the sharp corner used instead of the real fillet is likely conservative.

## What carries over

Three habits carry over: check the stress reading against an exact case;
judge a cheap model by how it ranks designs, not only by its error; and treat
a coarse-mesh design sitting on a stress limit as unverified.

The limits are as clear: mostly one load case, assumed isotropic materials,
many single runs, nothing built. Several READMEs list owner steps, such as
printing the bracket STL and loading it to failure, that would turn a model
comparison into a measurement. Until then these are reproducible
model-to-model results.
