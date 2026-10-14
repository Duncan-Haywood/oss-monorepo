# Contact settings for a moving friction grasp in MuJoCo: is it the time constant or the timestep? (stylised)

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
In MuJoCo (Todorov et al., 2012), a jaw-force test of a moving friction grasp (cover part, 400 and 800 m/s^2) holds only in 6 of 24 cells of a grid of contact time constant (0.5, 0.3, 0.2 ms) and timestep (0.4 to 0.05 ms). A coarse timestep always fails, probably because MuJoCo raises the effective constant to twice the timestep. A finer timestep does not rescue a marginal constant: at 800 m/s^2 and 0.2 ms only a 0.1 ms timestep holds, finer ones fail for a reason I did not find. With a 0.1 ms constant at 800 m/s^2, all timesteps of 0.1 ms and below hold. Stylised: one part, upward acceleration only, rigid box pads, no arm. Motivation: handling of own parts by machines in self-replication proposals (Zykov et al., 2005).

## Results and limits
See `../README.md` and `../experiments/results.txt`.

## References
Todorov, Erez, Tassa (2012), MuJoCo, IROS. Zykov, Mytilinaios, Adams, Lipson (2005), Self-reproducing machines, Nature 435. See `refs.bib` (not independently re-verified).
