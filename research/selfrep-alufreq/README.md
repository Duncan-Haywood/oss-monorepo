# selfrep-alufreq: how stiff a rod does a frequency target need, in aluminium and in wood?

Follow-up to `selfrep-alurod` and `selfrep-rodmodes` (track 1, `PROJECTS.md`), taking the "add the frequency target of `selfrep-rodmodes` to the diameter choice" next step from `selfrep-alurod`. Produced with AI assistance (Claude). Computed only; no rod was built or tested.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-alufreq/

**Builds on.** `selfrep-rodmodes` (single-mode Rayleigh frequency, carriage mass), `selfrep-alurod` (aluminium rod line in the redesign closure), and through them `selfrep-rodbeam`, `selfrep-redesign` and `selfrep-closure`. RepRap: Jones et al., *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>. It builds on none of the labs in `prompt.md`.

## Method
- For each first-mode target frequency, the smallest diameter of the longest (420 mm) rod is found with `selfrep-rodmodes`, for hardwood and aluminium, and fed into `selfrep-alurod`'s closure bookkeeping (all seven redesign substitutions, printer + router + laser shop).
- Also reported: the highest frequency reachable inside the assumed 12 mm holder limit, by carriage mass.
- **Carriage mass (0.3 kg, swept 0.1 to 1 kg), material constants, the 12 mm limit and the target frequencies are inherited assumptions; targets are swept, not derived from print quality.** Aluminium bar is assumed to be router-cut with a surface adequate for the bushings.

## Reproduce
```bash
cd research/selfrep-alufreq
python3 -m unittest discover -s tests -v     # 6 tests, standard library only
python3 experiments/run.py                   # writes experiments/results.txt
python3 experiments/figure.py                  # plots the frequency-vs-mass table to experiments/max_frequency.svg from the committed results.txt
```

## Results (from `experiments/results.txt`)
- At 0.3 kg, aluminium reaches a 30 Hz target with 8.6 mm and 40 Hz with 10.0 mm, both inside the 12 mm limit; hardwood needs 13.8 mm and 16.0 mm and does not fit. At 60 Hz aluminium needs 12.4 mm and also exceeds the limit.
- Highest frequency inside 12 mm at 0.3 kg: steel 83 Hz, aluminium 56 Hz, hardwood 23 Hz. With a 1 kg carriage these fall to 53, 33 and 13 Hz.
- Matching the 8 mm steel rod's 41.6 Hz takes 10.2 mm aluminium (the sag-matched figure in `selfrep-alurod` is 10.4 mm).
- Mass closure of the all-substitution design rises with the target (aluminium 35.0% at 10 Hz to 41.8% at 60 Hz) only because thicker stock counts as makeable: the stock the shop must import also rises (1946 g to 2596 g). The closure metric rewards heavier stock, a limitation already noted in `selfrep-rodbeam`; vitamin mass is the same 3608 g in every row.

## Limitations
- Stylised throughout: one mode, one carriage mass, simple supports, no damping, bushing clearance, belt or frame modes, which often limit a real printer before the rod does. The Rayleigh estimate slightly overestimates frequency.
- The 12 mm limit is a guess about the holders; aluminium bar surface quality is assumed. No cost or price model.

## Next steps
Tie the target to an acceleration and ringing model; re-run the penalty-budget search of `selfrep-redesign` with an aluminium option; add a router-cut aluminium extrusion frame.

## Owner steps
- Measure the first resonance of a real printer carriage on steel, aluminium and wood rods (e.g. a phone accelerometer) and replace the assumed carriage mass and moduli.

## Outside dependencies (vitamins)
Python standard library plus the sibling `selfrep-alurod`, `selfrep-rodmodes`, `selfrep-rodbeam`, `selfrep-redesign` and `selfrep-closure` source trees (relative paths). Aluminium bar, steel rod and wood dowel are imported, not made by the shop.
