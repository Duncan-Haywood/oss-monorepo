# Does friction hold the printed parts of a gripper? Analytic bound vs MuJoCo (stylised)

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
`robofab-selfparts` asked whether a parallel-jaw arm can place every part of a seven-part toy gripper using geometry alone. This note adds the force side: for each of the six free parts and each grasp axis that fits a 30 mm jaw opening, the minimum jaw force that holds the part against gravity by friction, from the analytic bound m g / (2 mu) and from a MuJoCo (Todorov et al., 2012) simulation, at friction coefficients 0.3, 0.5 and 0.8. Over 33 cases the two agree to within 5% (ratio 1.00 to 1.05), and the required force is at most 0.1 N. The agreement is a check on the simulator set-up, not a discovery; the conclusion for the design is that friction is never the binding constraint, geometry is. Results are stylised and say nothing about physical grippers.

## 1. Setting
Self-replication proposals (Zykov et al., 2005) assume machines that handle their own parts. Here the parts are grams of PLA-like plastic (assumed density 1240 kg/m^3), held by two flat pads.

## 2. Model and results
See `../README.md` and `../experiments/results.txt`.

## 3. Limitations
Static hold only (no acceleration, no lift motion, no tipping about a pad-to-pad axis from an off-centre centre of mass), boxes, one design, assumed friction and density, rigid pads, and a contact model whose softness was tuned to keep the simulation stable.

## References
See `refs.bib` (checked against `PROJECTS.md`, 2026-10-12; not independently re-verified in this run).
