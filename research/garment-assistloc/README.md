# garment-assistloc: does it pay to move an exosuit's motor and battery from the shank to the waist? (stylised, extends garment-assistpower)

Follow-up to `research/garment-assistpower` (track 6, `PROJECTS.md`), taking the "locate the mass (shank versus waist)" item from its next steps. That model charged every kg of suit the same fraction of whole-body power. Here a kg carried at the shank costs a multiple of a kg carried at the waist, and a waist layout pays for that with a Bowden-cable transmission loss and a cable mass kept at the ankle. Everything is a CPU model with assumed constants; no suit or person was measured. Produced with AI assistance (Claude). Asked as a new question rather than another sweep of the same parameters, because the assist chain had become variations on one result.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-assistloc/

**Builds on.** `research/garment-assist` (ankle model) and `research/garment-assistpower` (motor and battery mass), both imported unchanged from sibling directories. The qualitative idea that distal mass costs more than proximal mass is a common finding in the exoskeleton literature; I did not read a source in this run and take no number from one. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. **Citation check.** Entries copied from `PROJECTS.md` (checked 2026-10-12); not re-checked here (no access to doi.org).

## Method
`src/garment_assistloc/location.py`:
- **Shank layout:** motor, battery and fixed parts all sit at the shank. Penalty = `mass_sens` x `shank_ratio` x total kg.
- **Waist layout:** motor and battery sit at the waist (ratio 1). The fixed 0.6 kg plus 0.3 kg of cable stay at the shank. Electrical power rises by 1/0.8 (Bowden efficiency), so the battery grows.
- `shank_ratio` (shank penalty per kg over waist penalty per kg), Bowden efficiency, cable mass and motor density are all assumed round numbers and swept; none is sourced.
- The break-even ratio is solved in closed form, since both nets are linear in the ratio.

## Reproduce
```bash
python3 -m pip install numpy pytest
cd research/garment-assistloc
python3 -m pytest -q tests          # 5 tests
python3 experiments/run.py          # instant; writes experiments/results.txt
python3 experiments/figure.py       # writes experiments/layout.svg
```

## Results (from `experiments/results.txt`; model outputs, not measurements)
- Break-even is low. For gain 0.3, 4 h battery, the waist layout wins once a kg at the shank costs more than 1.03 to 1.39 times a kg at the waist, across cable efficiencies 0.6 to 1.0 and motor densities 8 to 40 N m/kg. Cable loss moves the break-even a little; the ratio assumption decides everything.
- At the 8 N m/kg default and 1%/kg waist sensitivity, a shank layout goes from +1.0% (ratio 1) to +20.7% (ratio 3) to +40.5% (ratio 5); the waist layout stays between +1.5% and +5.1%. The waist suit still raises cost at this motor density: the motor mass, not its location, is the problem there (as in garment-assistpower).
- At 40 N m/kg, cable 0.8: the shank layout saves 5.7% at ratio 1 but costs +0.6% at ratio 3; the waist layout still saves 3.4%.

## Limitations
- **Stylised.** Inherits every limit of garment-assist and garment-assistpower. The ratio is a single scalar standing in for a body-segment mass-distribution effect; its real value is not taken from data here and may be below or above the range swept.
- The waist layout ignores cable friction that varies with posture, slack, hysteresis, and the comfort and fit of a waist belt. The Bowden efficiency is one constant.
- Both layouts keep the same assist profile; the waist layout would in practice deliver a delayed or smoothed torque.
- No cost or thermal model; no price is given because none is sourced.

## Next steps
Take a sourced segment-wise metabolic penalty for added mass (from a loaded-walking dataset) in place of the scalar ratio; model Bowden loss against cable bend angle; add the suit cost from `garment-teardown`.

## Owner steps
None required. A physical build would need a sourced bill of materials with prices and dates; not done here.

## Outside dependencies (vitamins)
Python, numpy; the sibling projects `garment-assist` and `garment-assistpower`. Every layout constant is assumed from outside the model.

## References
- Collins, S. H., Wiggin, M. B., Sawicki, G. S. (2015). Reducing the energy cost of human walking using an unpowered exoskeleton. *Nature* 522:212-215. https://doi.org/10.1038/nature14288
- Kim, J. et al. (2019). Reducing the metabolic rate of walking and running with a versatile, portable exosuit. *Science* 365(6454):668-672. https://doi.org/10.1126/science.aav7536
