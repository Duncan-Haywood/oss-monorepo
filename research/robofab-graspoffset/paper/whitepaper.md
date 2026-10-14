# Grasping a cube with an off-centre centre of mass: ball and flat pads, bounds vs MuJoCo (stylised)

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
A cube pinched on two faces with its centre of mass offset by d in the pad plane is twisted by gravity as well as pulled down. With a ball pad (one point contact, torsional friction coefficient 2 mm assumed) the elliptic-cone bound matches MuJoCo (Todorov et al., 2012) within 1.1% for offsets of 0 to 20 mm; the needed force grows 5x. With a flat pad, twist is resisted by friction at the corner contacts; the force depends on how the solver shares the normal load, and MuJoCo lies between an equal-split upper bound and a best-split lower bound at all eight offsets, needing 0.39 times the ball-pad force at 10 mm. Results are stylised and say nothing about physical grippers.

## 1. Setting
Self-replication proposals (Zykov et al., 2005) assume machines that handle their own parts, which are often off-axis when grasped. See `../README.md` for method, results and limitations, and `../experiments/results.txt` for the table.

## References
Todorov, Erez, Tassa (2012), MuJoCo, IROS. Zykov, Mytilinaios, Adams, Lipson (2005), Self-reproducing machines, Nature 435. See `refs.bib` (not independently re-verified).
