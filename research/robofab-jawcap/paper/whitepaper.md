# Time-optimal versus min-jerk carries of a printed part under joint-torque and jaw-force limits: a stylised two-link model

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
`robofab-armbang` found that a time-optimal carry saves 21 to 29% of time over min-jerk but needs 1.2 to 2.4 times the jaw force. Here the jaw force is capped at k times the static hold force and both profiles are made as fast as the cap and an assumed joint torque limit allow. The cap is a quadratic constraint on the path acceleration, solved in the numerical-integration scheme of Bobrow, Dubowsky and Gibson (1985). Over nine arm and torque cases and k from 1.25 to 10, the time-optimal total is 17 to 43% shorter than capped min-jerk; for tight caps the torque limit does not change the time at all. All parameters are assumed and the results are stylised.

## 1. Setting and method
See `../README.md` for the model, tests and caveats, and `../experiments/results.txt` for every number.

## References
Bobrow, Dubowsky, Gibson (1985), IJRR 4(3):3-17. Pfeiffer, Johanni (1987), IEEE J. Robotics and Automation RA-3:115-123. Flash, Hogan (1985), J. Neurosci. 5(7) (not re-verified). Zykov et al. (2005), Nature 435. See `refs.bib`.
