# Contact settings for a moving friction grasp in MuJoCo: a map over acceleration and part (stylised)

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
In MuJoCo (Todorov et al., 2012), a jaw-force test that matches the bound m(g+a)/(2 mu) at 100 m/s^2 with a 0.5 ms contact time constant fails at 400 and 800 m/s^2 on all seven printed parts of a toy gripper (no force up to 60 N holds). Contact time constants of 0.2 ms and below reproduce the bound (ratio 0.98 to 1.04, 63 cases). A scan on one part shows the largest adequate time constant falls with acceleration and is not a single threshold on their product. Stylised: upward acceleration only, rigid box pads, one friction value, no arm. Motivation: handling of own parts by machines in self-replication proposals (Zykov et al., 2005).

## Results and limits
See `../README.md` and `../experiments/results.txt`.

## References
Todorov, Erez, Tassa (2012), MuJoCo, IROS. Zykov, Mytilinaios, Adams, Lipson (2005), Self-reproducing machines, Nature 435. See `refs.bib` (not independently re-verified).
