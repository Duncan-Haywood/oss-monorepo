# Does MuJoCo's refsafe clamp break a moving grasp at a coarse timestep? (stylised)

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
In MuJoCo (Todorov et al., 2012), a jaw-force test of a moving friction grasp (cover part, 400 and 800 m/s^2) is run over contact time constants of 0.5 to 0.1 ms and timesteps of 0.4 to 0.05 ms, with the `refsafe` flag (which raises the effective constant to twice the timestep) on and off. 11 of 32 cells hold with it on and 10 of 32 with it off; the two settings disagree in 7 cells. With the flag off, 10 runs end in a solver instability, so the clamp protects some cells and costs others. The non-monotone timestep behaviour of the earlier project survives with the clamp off, so it is not the cause. Stylised: one part, upward acceleration only, rigid box pads, no arm. Motivation: handling of own parts by machines in self-replication proposals (Zykov et al., 2005).

## Results and limits
See `../README.md` and `../experiments/results.txt`.

## References
Todorov, Erez, Tassa (2012), MuJoCo, IROS. Zykov, Mytilinaios, Adams, Lipson (2005), Self-reproducing machines, Nature 435. See `refs.bib` (not independently re-verified).
