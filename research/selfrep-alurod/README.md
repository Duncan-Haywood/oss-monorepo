# selfrep-alurod: does an aluminium rod fit the printer where a wooden one cannot?

Follow-up to `selfrep-rodbeam` (track 1, `PROJECTS.md`), taking the "add aluminium rod as a substitution" next step from its README. Produced with AI assistance (Claude). Computed only; no rod was built or tested.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-alurod/

**Builds on.** `selfrep-rodbeam` (beam model), `selfrep-redesign` (substitution search) and `selfrep-closure` (RepRap-class bill of materials, via the RepRap wiki; RepRap: Jones et al., *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>). Beam theory is textbook Euler-Bernoulli bending. It builds on none of the labs in `prompt.md`.

## Method
- The rod line of `selfrep-redesign` (all seven substitutions) is replaced by hardwood or aluminium rods, each sized with `selfrep-rodbeam`'s `min_diameter` to hold a mid-span deflection spec on the longest (420 mm) rod, with per-rod mass from geometry.
- Aluminium bar is imported stock cut to length on the router, the same assumption `selfrep-closure` makes for washers. Its surface is assumed good enough for the bushings. This is an assumption of this project, not a checked fact: real bearing-grade rod is ground, which a router cannot do.
- Outputs: diameter, whether it fits the assumed 12 mm holder limit, mass closure (printer + router + laser shop), the mass of stock the makeable lines still need imported, and the mass of vitamins.
- **Material properties (steel 200, aluminium 69, hardwood 10 GPa), the 5 N load and the 12 mm limit are inherited assumptions from `selfrep-rodbeam`, not looked-up values.**

## Reproduce
```bash
cd research/selfrep-alurod
python3 -m unittest discover -s tests -v     # 6 tests, standard library only
python3 experiments/run.py                   # writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
- Matching the 8 mm steel rod's sag (0.192 mm) takes aluminium 10.4 mm, `(E_steel/E_Al)^(1/4)` times 8 mm, which is inside the 12 mm limit. Hardwood needs 16.9 mm and does not fit. Across E = 68 to 72 GPa the aluminium diameter moves only 10.3 to 10.5 mm.
- Aluminium meets every sag spec down to 0.2 mm within 12 mm; hardwood only meets 1 mm and looser. At 0.1 mm aluminium needs 12.3 mm, just outside the limit.
- At a 0.2 mm spec the all-substitutions design has mass closure 39.5% with aluminium rods, 37.8% with wood and 28.7% with steel rods left as vitamins. Vitamin mass falls from 4538 g (steel) to 3608 g.
- The closure gain has a cost the headline metric hides: the aluminium design imports about 170 g more stock than the wooden one at the 0.2 mm spec (2360 g against 2190 g), and 530 g more than the steel-rod design (1828 g), because it counts bar stock as makeable. Closure by mass rewards heavier stock (a limitation already noted in `selfrep-rodbeam`), so the real gain of aluminium is that a stiff rod fits the existing holders, not the closure figure.

## Limitations
- Stylised throughout: assumed moduli, one 5 N load, static deflection only, no vibration, shear, bushing clearance or rod straightness.
- Cutting aluminium bar on a router and getting a smooth, round bearing surface is optimistic; a ground rod is a different part. The 12 mm limit is a guess about the holders.
- The substitution penalty (0.9 in `selfrep-redesign`) is not re-derived for aluminium; this project does not run the penalty-budget search.
- Cost and price of aluminium bar are not modelled.

## Next steps
Re-run the penalty-budget search of `selfrep-redesign` with an aluminium option and a penalty tied to rod sag; add the frequency target of `selfrep-rodmodes` to the diameter choice; add a router-cut aluminium extrusion frame.

## Owner steps
- Bend-test a real aluminium bar and a steel rod on a jig and replace the assumed moduli and the 5 N load. Check whether cut bar runs smoothly in printed or brass bushings.

## Outside dependencies (vitamins)
Python standard library plus the sibling `selfrep-rodbeam`, `selfrep-redesign` and `selfrep-closure` source trees (relative paths). Aluminium bar, like steel rod and wood dowel, is imported, not made by the shop.
