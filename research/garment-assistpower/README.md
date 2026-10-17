# garment-assistpower: does the motor, not the battery, decide whether an exosuit pays? (stylised, extends garment-assist)

Follow-up to `research/garment-assist` (track 6, `PROJECTS.md`), taking the "battery and motor mass model" item from its next steps. The suit's mass is no longer a free parameter: it is built from a fixed part, a motor sized to the suit's peak torque, and a battery sized to the electrical energy for a stated number of hours. That mass is fed back into the metabolic cost. Everything is a CPU model with assumed constants; no suit or person was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-assistpower/

**Builds on.** `research/garment-assist` (the one-joint ankle model, imported unchanged from the sibling directory), and the qualitative idea from Collins, Wiggin and Sawicki (2015) and Kim et al. (2019) that assistive devices can lower the metabolic cost of walking. I did not read these papers in this run and no number below comes from them. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. **Citation check.** Entries copied from `PROJECTS.md` (checked 2026-10-12); not re-checked here (no access to doi.org).

## Method
`src/garment_assistpower/powertrain.py`:
- Suit mass = fixed 0.6 kg + motor + battery. Motor mass = legs x (gain x biological peak torque) / torque density (8 N m/kg, swept). Battery mass = legs x suit mechanical power / drive efficiency (0.6) x hours / cell energy density (150 Wh/kg) x 1.2 reserve.
- Net whole-body change = garment-assist's active-suit result with this mass and a mass sensitivity (1% of whole-body power per kg, swept).
- Inherited convention: garment-assist's metabolic power is treated as covering both ankles; torque and suit power are per ankle, so electrical power uses 2 legs. This is an assumption of that model, not a fact about people.
- All power-train constants are assumed round numbers, not datasheet values. None is sourced.

## Reproduce
```bash
python3 -m pip install numpy pytest
cd research/garment-assistpower
python3 -m pytest -q tests          # 5 tests
python3 experiments/run.py          # instant; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; model outputs, not measurements)
- With the default 8 N m/kg motor, the gain-0.3 suit weighs about 9 kg, 8.4 kg of it motor, and the net whole-body effect raises whole-body cost by 0.2% (0 h of battery) to 1.9% (8 h). The battery is under 2 kg even at 8 h; the motor dominates.
- Motor torque density decides the sign. At gain 0.3 with a 4 h battery and 1%/kg sensitivity: net change +1.0% at 8 N m/kg, -4.0% at 20, -5.7% at 40, -7.0% at 160. At 2%/kg the break-even is between 20 and 40 N m/kg; at 0.5%/kg even 8 N m/kg gives -3.9%.
- At 40 N m/kg and 1%/kg, battery life costs savings slowly: net -6.4% (1 h), -5.7% (4 h), -4.8% (8 h), -3.1% (16 h; battery 3.4 kg of 5.7 kg).
- Best gain per hours and sensitivity: at 1%/kg and 8 N m/kg no gain on the grid helps: the least-bad net change is +0.3% to +0.6% (cost up), at gains 0.02 to 0.22; at 0.5%/kg the grid-edge gain 0.6 wins, so that optimum is truncated by the grid (0.02 to 0.60), not found.

## Limitations
- **Stylised.** Inherits every limit of garment-assist (one joint, prescribed kinematics, lumped muscle, synthetic profile). Adds assumed power-train constants and a linear mass penalty.
- Sizing the motor to gain x biological peak torque is a design choice; a series-elastic or clutch design would need less motor, and is not modelled. Mass is not located (shank mass costs more than trunk mass in real gait); the single sensitivity ignores that.
- The conclusion "the motor dominates" depends on the 8 N m/kg default, which I chose as a modest round number; the sweep shows the answer flips within a factor of 2 to 5 either way. Do not read the default as a claim about real actuators.
- No thermal, cost or comfort model; no price is given because none is sourced.

## Next steps
Source actuator torque densities and cell energy densities from datasheets with dates; add a series-elastic or clutch variant; locate the mass (shank versus waist) and use a sourced locational sensitivity; add the suit cost from `garment-teardown`.

## Owner steps
None required. A physical build would need a sourced bill of materials (motors, gearbox, battery, cable, frame, textile) with prices and dates; not done here.

## Outside dependencies (vitamins)
Python, numpy; the sibling project `garment-assist`. All power-train constants are assumed from outside the model.

## References
- Collins, S. H., Wiggin, M. B., Sawicki, G. S. (2015). Reducing the energy cost of human walking using an unpowered exoskeleton. *Nature* 522:212-215. https://doi.org/10.1038/nature14288
- Kim, J. et al. (2019). Reducing the metabolic rate of walking and running with a versatile, portable exosuit. *Science* 365(6454):668-672. https://doi.org/10.1126/science.aav7536
