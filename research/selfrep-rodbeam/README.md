# selfrep-rodbeam: what does a wooden rod cost a printer in stiffness?

Follow-up to `selfrep-redesign` (track 1, `PROJECTS.md`), taking the next step its README asked for: replace the assumed 0.9 penalty of the "wooden smooth rods" substitution with a mechanical model. Produced with AI assistance (Claude). Computed only; no rod was built or tested.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-rodbeam/

**Builds on.** `selfrep-redesign` and `selfrep-closure` in this repository (rod lengths and masses from the RepRap wiki bill of materials via `selfrep-closure`; RepRap: Jones et al., *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>). Beam theory is textbook Euler-Bernoulli bending. It builds on none of the labs in `prompt.md`.

## Method
- Each of the six 8 mm smooth rods (2 x 350, 2 x 405, 2 x 420 mm) is a simply supported beam with one central point load: deflection `P L^3 / (48 E I)`, `I = pi d^4 / 64`, plus a bending-stress check.
- Four materials: steel, aluminium, hardwood dowel, FDM-printed PLA. **Moduli, densities and allowable stresses (`MATERIALS` in `src/selfrep_rodbeam/beam.py`) are my rounded handbook-order-of-magnitude assumptions, not looked-up values**, and the load (5 N per rod) is a guess. For wood, see the order of magnitude in the *Wood Handbook* (USDA Forest Products Laboratory, FPL-GTR-190, 2010); printed PLA stiffness varies strongly with print settings.
- For a deflection spec, find the smallest diameter that meets it and the stress limit, then feed the resulting dowel mass back into `selfrep-redesign`'s closure computation (all seven substitutions, printer + router + laser shop).

## Reproduce
```bash
cd research/selfrep-rodbeam
python3 -m unittest discover -s tests -v     # 6 tests, standard library only
python3 experiments/run.py                   # writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
- At the standard 8 mm and 5 N, the 420 mm rod deflects 0.19 mm in steel, 0.56 mm in aluminium, 3.8 mm in hardwood (20 times steel, the modulus ratio) and 15 mm in printed PLA (80 times). Stress is 10 MPa, far below every allowable, so stiffness, not strength, decides.
- Matching the steel rod's stiffness with hardwood needs `(E_steel/E_wood)^(1/4)` times the diameter: 16.9 mm at E = 10 GPa, 15.6 to 19.2 mm across E = 14 to 6 GPa. That is outside the 8 mm bearings and clamps the printer is built around (a 12 mm limit is assumed here). A looser spec of 1 to 2 mm of deflection is met by 9.4 to 11.2 mm dowel.
- So the substitution is not a fixed "0.9": it is free only if the machine tolerates millimetres of rod sag, and otherwise it forces a redesign of the carriages. A spec of 0.2 mm (steel-like) needs 16.7 mm hardwood or 23.7 mm printed PLA.
- **Discrepancy with `selfrep-redesign`.** That project assumed 30 g per dowel; from geometry an 8 mm, ~0.39 m hardwood rod weighs 13.8 g. With that mass its headline mass closure falls from 35.8% to 34.6%. Thicker dowels raise mass closure again (35.0% at 9.4 mm, 41.4% at 23.7 mm), because dowel stock counts as makeable while a steel rod does not. The closure metric therefore rewards heavier, worse rods: a limitation of counting imported feedstock as makeable, not a sign the thicker rod is a better design.

## Limitations
- Material properties and the load are assumptions; real dowels vary by species and moisture, and wood creeps. Rod supports, bushing clearance, carriage mass distribution and dynamic loads are not modelled, nor are shear deformation, rod straightness or surface finish (bushing wear).
- One load case and a single static criterion; no vibration or print-quality model, so "how much sag is acceptable" is left as a swept parameter.
- Aluminium rods and thicker bushings are not added to the closure model, only to the stiffness table.

## Next steps
Make the deflection spec come from a print-quality or vibration model of the gantry; add aluminium rod and a router-cut aluminium extrusion as substitutions with their own closure; let a proposer, LLM or CMA-ES, choose diameter and material jointly.

## Owner steps
- Weigh and bend-test real dowels, aluminium and steel rods on a jig; replace the moduli and the 5 N load with measured values.
- Decide what sag the printer tolerates by printing with deliberately soft rods.

## Outside dependencies (vitamins)
Python standard library plus the sibling `selfrep-redesign` and `selfrep-closure` source trees (relative paths). The model leaves out the steel rods' real supply: wooden or aluminium stock, like steel, is imported and not made by the shop.
