# Friction grasp under acceleration: analytic bound vs MuJoCo (stylised)

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
`robofab-grasp` found that friction needs at most 0.1 N to hold the printed parts of a toy gripper at rest. This note accelerates the jaws, upward or sideways at up to 40 m/s^2, and compares the bound m sqrt((g+a_up)^2 + a_side^2)/(2 mu) with a MuJoCo (Todorov et al., 2012) simulation. Over 77 cases at mu = 0.5 the two agree to within 7% (ratio 0.99 to 1.07) and the heaviest part needs at most 0.30 N. A fidelity finding: with MuJoCo's contact time constant at 0.004 s the simulation reports slip at any force once the jaws accelerate, because the friction constraint lags the pad velocity; the agreement requires 0.0005 s. Results are stylised and say nothing about physical grippers.

## 1. Setting
Self-replication proposals (Zykov et al., 2005) assume machines that handle their own parts. The parts are grams of PLA-like plastic (assumed 1240 kg/m^3) held by two flat pads.

## 2. Model and results
See `../README.md` and `../experiments/results.txt`.

## References
Todorov, Erez, Tassa (2012), MuJoCo, IROS. Zykov, Mytilinaios, Adams, Lipson (2005), Self-reproducing machines, Nature 435. See `refs.bib` (not independently re-verified).
