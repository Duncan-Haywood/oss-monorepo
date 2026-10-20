# garment-bowdenbend: how much cable bend can a waist-mounted exosuit power train tolerate?

**Question.** A waist-mounted exosuit drives the ankle through a Bowden cable. `garment-assistloc` gave that cable one assumed efficiency (0.6 to 1.0). Here the efficiency comes from the cable's route: the capstan law `exp(-mu * theta)` for friction `mu` and total bend angle `theta`. **Headline (model output, not a measurement):** at gain 0.3, a 4 h battery, 8 N m/kg motors and an assumed shank/waist penalty ratio of 3, the waist layout beats the shank layout until the cable is bent through about 31 rad at `mu` = 0.1 (about 15 rad at `mu` = 0.2). A hip-to-ankle route bends through a few radians, so in this model cable friction does not decide the layout; the ratio does, as in `garment-assistloc`.

Follow-up to `research/garment-assistloc` (track 6, `PROJECTS.md`), taking "model Bowden loss against cable bend angle" from its next steps. Everything is a CPU model with assumed constants; no suit or person was measured. Produced with AI assistance (Claude). **Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-bowdenbend/

**Builds on.** `garment-assistloc`, `garment-assistpower` and `garment-assist`, imported unchanged from sibling directories. The capstan (Euler-Eytelwein) law is textbook mechanics; I took no friction coefficient from a source in this run, so `mu` is an assumed value and swept. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. **Citation check.** The references are copied from `garment-assistloc` (checked 2026-10-12); not re-checked here (no access to doi.org).

## Method
`src/garment_bowdenbend/bend.py`:
- `bowden_eff(mu, theta)` = `exp(-mu * theta)`.
- `waist_net` feeds that efficiency into `garment-assistloc`'s waist layout (a lower efficiency means a bigger motor-side power draw and so a bigger battery).
- `critical_bend` finds, by bisection, the bend at which the waist layout's net change equals the shank layout's.

## Reproduce
```bash
python3 -m pip install numpy pytest
cd research/garment-bowdenbend
python3 -m pytest -q tests          # 5 tests
python3 experiments/run.py          # instant; writes experiments/results.txt
python3 experiments/figure.py       # writes experiments/layout.svg
```

## Results (from `experiments/results.txt`)
- Ratio 3, `mu` 0.1: going from a straight cable to 8 rad of bend (efficiency 1.00 to 0.45) moves the waist layout only from +3.1% to +4.2%; the shank layout is +20.7%.
- Critical bend at 8 N m/kg: 17.7 rad at ratio 1.5 and 30.7 rad at ratio 3 for `mu` 0.1; 5.9 to 12.5 rad across ratios 1.5 to 5 at `mu` 0.3. At `mu` 0.05 the waist layout wins at any plausible bend for ratios of 2 or more.
- At 40 N m/kg the motor is light, so the margin shrinks: 6.7 rad at ratio 1.5 and 17.7 rad at ratio 3 (`mu` 0.1).

## Limitations
- Only the extra battery mass from lost efficiency is charged. Real cables also add hysteresis, backlash, pre-tension, sheath compression and wear, none modelled; these probably matter more than the energy loss, so the large tolerance above should not be read as "bend is harmless".
- Bend angle is a single total; the route, its changes with gait and a sourced `mu` are not modelled. The shank/waist ratio is still assumed.

## Next steps
Take a sourced segment-wise metabolic penalty for added mass in place of the scalar ratio; model cable hysteresis and pretension loss; add the suit cost from `garment-teardown`.

## Owner steps
None required. A physical build would need a measured cable friction and a sourced bill of materials with prices and dates; not done here.

## Outside dependencies (vitamins)
Python, numpy; the sibling projects `garment-assist`, `garment-assistpower` and `garment-assistloc`. The friction, ratio and bend-angle values come from outside the model.

## References
- Collins, S. H., Wiggin, M. B., Sawicki, G. S. (2015). Reducing the energy cost of human walking using an unpowered exoskeleton. *Nature* 522:212-215. https://doi.org/10.1038/nature14288
- Kim, J. et al. (2019). Reducing the metabolic rate of walking and running with a versatile, portable exosuit. *Science* 365(6454):668-672. https://doi.org/10.1126/science.aav7536
