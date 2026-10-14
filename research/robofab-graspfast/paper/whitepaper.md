# The friction-grasp bound at arm accelerations: a MuJoCo check and the settings it needs (stylised)

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
`robofab-graspmove` compared the bound m sqrt((g+a_up)^2 + a_side^2)/(2 mu) with MuJoCo (Todorov et al., 2012) up to 40 m/s^2; `robofab-armaccel` then applied it at 28 to 837 m/s^2. This note drives the jaws of three printed parts of a toy gripper at 40 to 800 m/s^2. With a 0.05 ms timestep and a 0.1 ms contact time constant the simulated minimum force is 0.89 to 1.02 times the bound over 39 cases (median 1.00). With the earlier settings (0.2 ms, 0.5 ms) the bound is matched up to 200 m/s^2 but no force up to 60 N holds a part at 400 or 800 m/s^2, a contact-lag artefact. Results are stylised: prescribed constant acceleration, rigid box pads, one friction coefficient, and no arm.

## 1. Setting
Self-replication proposals (Zykov et al., 2005) assume machines that handle their own parts. The parts are grams of PLA-like plastic (assumed 1240 kg/m^3) held by two flat pads.

## 2. Model and results
See `../README.md` and `../experiments/results.txt`.

## References
Todorov, Erez, Tassa (2012), MuJoCo, IROS. Zykov, Mytilinaios, Adams, Lipson (2005), Self-reproducing machines, Nature 435. See `refs.bib` (not independently re-verified).
