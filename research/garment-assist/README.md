# garment-assist: does an assistive garment pay for its own mass? (stylised one-joint model)

Sixth milestone of the engineered-clothing track (`PROJECTS.md`, track 6). A one-joint (ankle, sagittal) model of an exosuit-style garment that adds plantarflexion torque in parallel with the muscle, with a metabolic cost for the mass it adds. The question is the break-even: how much garment mass cancels the metabolic saving? Everything is a CPU model with assumed parameters; no person or suit was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-assist/

**Not what the milestone asked for.** `PROJECTS.md` suggests OpenSim or MyoSuite. I did not run either: they need heavy installs and models not set up in this container, so this is a hand-built lumped model. It is a sketch of the trade-off, not a musculoskeletal simulation, and its absolute numbers should not be compared with experiments.

**Builds on.** The idea of unpowered and soft assistive devices reducing the metabolic cost of walking: Collins, Wiggin and Sawicki (2015) and Kim et al. (2019); the musculoskeletal-simulation tools OpenSim (Seth et al., 2018) and MyoSuite (Caggiano et al., 2022), which are named as the next step and not used. I did not read these papers in this run and use them for the qualitative idea only; no number below comes from them. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. **Citation check.** The entries were copied from the reference list in `PROJECTS.md` (checked 2026-10-12); this run could not re-check them (no access to doi.org).

## Method
`src/garment_assist/model.py`:
- A synthetic gait cycle (1.1 s, 70 kg): ankle angle with mid-stance dorsiflexion and a fast push-off plantarflexion, and a net ankle torque bump peaking at 47% of the cycle at 1.6 N m/kg. Shapes and magnitudes are assumed round numbers in the style of walking data, not taken from a dataset.
- Muscle metabolic power = positive joint work / 0.25 + absorbed work / 1.2 + an activation term (4 W/kg x (torque / peak)^2). All four constants are assumed.
- Suit torque acts in parallel (muscle torque = net torque - suit torque), plantarflexion only, capped at the biological peak. Two kinds: `active`, gain x biological torque, optionally delayed; `elastic`, a spring that loads in dorsiflexion.
- Whole-body power = ankle power / 0.25 (an assumed ankle share). Added mass raises whole-body power by `mass_sens` per kg (swept; not sourced).

## Reproduce
```bash
python3 -m pip install numpy pytest
cd research/garment-assist
python3 -m pytest -q tests          # 7 tests
python3 experiments/run.py          # instant; writes experiments/results.txt
```

## Results (from `experiments/results.txt`; model outputs, not measurements)
- Baseline: 150 W ankle metabolic power, 601 W whole body (by the assumed share).
- Active suit at timing 0: gain 0.1 / 0.3 / 0.5 of the biological torque cuts ankle cost 12 / 35 / 56% and whole-body cost 3.1 / 8.8 / 14.1%. These ankle reductions are large because my muscle model charges a lot for positive work and for activation; I do not claim they match real devices.
- Timing: delaying the same suit by 0.15 of the cycle leaves 12% ankle saving of the 35%, and a 0.25 delay leaves none. A small 3 to 6% delay does slightly better than none (38.7% against 35.4%) because in my synthetic profile joint velocity peaks later than torque; that is an artefact of the invented profile.
- Elastic spring: at best 3.4% ankle saving (stiffness scale 0.3), and a stiff spring (1.0) raises ankle cost by 17%, since it loads the joint with torque during dorsiflexion where the muscle was not working.
- Mass: with a sensitivity of 1% of whole-body power per kg, the gain-0.3 suit breaks even at 8.9 kg of added mass; at 5% per kg, at 1.8 kg; at 0.5% per kg, 17.7 kg. A 3 kg suit at 5%/kg turns the 8.8% saving into a 6.2% loss. The break-even mass scales as 1/sensitivity, so the conclusion rests on a number this project does not supply.
- Whole-body saving for the gain-0.3 suit moves from 5.3% to 12.4% as the ankle share is varied from 0.15 to 0.35.

## Limitations
- **Stylised.** One joint, prescribed kinematics (the suit does not change gait), a lumped muscle, assumed efficiencies, a synthetic profile. No muscle dynamics, no co-contraction, no adaptation, no other joints, no actuator or battery model; the suit's own electrical cost is not counted (its mechanical power is reported). Nothing here supports a claim about a real garment or person.
- The mass sensitivity and the ankle share are unsourced assumptions and drive the headline numbers; the sweeps show their effect.
- The elastic model tracks torque, not stored energy.

## Next steps
Replace the lumped model with MyoSuite or OpenSim on a published musculoskeletal model; calibrate against a published metabolic dataset; add the garment's attachment compliance (a cloth is not a rigid frame), a battery and motor mass model, and the cost of the suit from `garment-teardown`.

## Owner steps
None required. A physical test would need a sourced bill of materials (motor, battery, cable, frame, textile) priced with dates; not done here.

## Outside dependencies (vitamins)
Python, numpy. All biomechanical constants are assumed from outside the model.

## References
- Collins, S. H., Wiggin, M. B., Sawicki, G. S. (2015). Reducing the energy cost of human walking using an unpowered exoskeleton. *Nature* 522:212-215. https://doi.org/10.1038/nature14288
- Kim, J. et al. (2019). Reducing the metabolic rate of walking and running with a versatile, portable exosuit. *Science* 365(6454):668-672. https://doi.org/10.1126/science.aav7536
- Seth, A. et al. (2018). OpenSim: Simulating musculoskeletal dynamics and neuromuscular control to study human and animal movement. *PLOS Comput. Biol.* 14(7):e1006223. https://doi.org/10.1371/journal.pcbi.1006223
- Caggiano, V. et al. (2022). MyoSuite: A contact-rich simulation suite for musculoskeletal motor control. L4DC, PMLR 168:492-507. https://proceedings.mlr.press/v168/caggiano22a.html
