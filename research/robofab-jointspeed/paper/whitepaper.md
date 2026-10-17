# Time-optimal versus min-jerk carries of a printed part under torque, jaw-force and joint-speed limits: a stylised two-link model

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
`robofab-jawcap` capped joint torque and jaw force but not joint speed. Here a peak joint-speed limit is added, as a constant cap on the path speed along the joint-space line, to the numerical-integration scheme of Bobrow, Dubowsky and Gibson (1985). Over three arm sizes, three jaw caps and speed limits of 6 to 1 rad/s, the time-optimal total is 28 to 46% shorter than min-jerk meeting the same limits (18 to 34% without a speed limit). The saving tends to 1 - 1/1.875 = 47%, a property of the min-jerk profile shape. All parameters are assumed and the results are stylised.

## 1. Setting and method
See `../README.md` for the model, tests and caveats, and `../experiments/results.txt` for every number.

## References
Bobrow, Dubowsky, Gibson (1985), IJRR 4(3):3-17. Pfeiffer, Johanni (1987), IEEE J. Robotics and Automation RA-3:115-123. Flash, Hogan (1985), J. Neurosci. 5(7) (not re-verified). Zykov et al. (2005), Nature 435. See `refs.bib`.
