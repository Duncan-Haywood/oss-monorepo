# selfrep-rodmodes: what natural frequency must a printer's rod reach, and what does a wooden rod cost?

Follow-up to `selfrep-rodbeam` (track 1, `PROJECTS.md`), taking the next step its README asked for: derive the rod's stiffness spec from a vibration target instead of an assumed sag limit. Produced with AI assistance (Claude). Computed only; no rod was built or tested.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-rodmodes/

**Builds on.** `selfrep-rodbeam` (beam model, materials, rod lengths) and through it `selfrep-redesign` and `selfrep-closure` in this repository. RepRap: Jones et al., *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>. The single-mode Rayleigh estimate with a 17/35 effective beam mass is a textbook result for a point mass at mid-span of a simply supported beam (see Blevins, *Formulas for Natural Frequency and Mode Shape*; I have not re-checked the coefficient against the book, but the test compares the mass-free limit with the exact beam mode). It builds on none of the labs in `prompt.md`.

## Method
- Carriage mass `M` sits at mid-span of a simply supported rod of mass `m`: `f = (1/2pi) sqrt(k / (M + 17/35 m))`, `k = 48 E I / L^3`.
- **Carriage mass (0.3 kg, swept 0.1 to 1 kg), the target frequencies, and all material constants (from `selfrep-rodbeam`) are assumptions.** No print-quality model links a frequency to acceptable ringing; targets are swept, not derived.
- Smallest diameter reaching a target by bisection; wooden diameters fed back into `selfrep-rodbeam`'s closure computation.

## Reproduce
```bash
cd research/selfrep-rodmodes
python3 -m unittest discover -s tests -v     # 5 tests, standard library only
python3 experiments/run.py                   # writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
- At 8 mm, 0.42 m, 0.3 kg: steel 41.6 Hz, aluminium 26.4 Hz, hardwood 10.4 Hz, printed PLA 5.1 Hz. Hardwood reaches a quarter of steel's frequency (the stiffness ratio 20 gives a factor of about 4.5 in frequency, softened by the rod's own mass).
- Matching steel's 41.6 Hz needs 16.3 mm hardwood, close to the 16.9 mm that `selfrep-rodbeam` found by matching sag. At equal frequency the dowel is 2.08 times the steel diameter at 20 Hz down to 1.87 at 150 Hz, against 2.11 from stiffness alone: the rod's own mass helps wood only a little at this carriage mass. (Only in the limit of a massless carriage does the ratio fall to sqrt of the specific-stiffness ratio, about 1.3; the test checks that limit.)
- A target of 40 Hz needs 7.8 mm steel but 16.0 mm hardwood at 0.3 kg; beyond roughly 60 Hz even steel exceeds the assumed 12 mm holder limit.
- Mass closure of the all-substitution redesign with frequency-sized dowels: 35.5% at 20 Hz (11.2 mm), 37.4% at 40 Hz (16.0 mm), 39.3% at 60 Hz (19.8 mm). As in `selfrep-rodbeam`, this rises because thicker dowel stock counts as makeable, so it rewards worse design and is a limitation of the closure metric.

## Limitations
- One mode, one carriage mass, simple supports, no damping, bushing clearance, belt compliance, rod straightness or the frame's own modes; real printers' limiting resonance is often the frame or belts, not the rod. The Rayleigh estimate slightly overestimates the frequency.
- The 'target frequency' is a free parameter; I did not derive it from print quality or acceleration.
- Aluminium extrusion and rod substitutions are still not in the closure model.

## Next steps
Tie the target frequency to a print-quality model (ringing amplitude versus acceleration); add the frame and belt modes; add an aluminium-rod substitution to `selfrep-redesign`; let a proposer or CMA-ES pick diameter and material jointly.

## Owner steps
- Pluck-test or tap-test real rods with a carriage mass and a phone accelerometer to measure the frequency, and replace the assumed carriage mass and moduli.

## Outside dependencies (vitamins)
Python standard library plus the sibling `selfrep-rodbeam`, `selfrep-redesign` and `selfrep-closure` source trees (relative paths). Wooden and aluminium stock, like steel rod, is imported, not made by the shop.
