# Time-optimal versus min-jerk carries of a printed part: time saved and jaw force demanded, in a stylised two-link model

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
`robofab-armaccel` carried the six free parts of a toy gripper on min-jerk joint moves. Here the same carries use the time-optimal speed profile along the same joint-space line under the same assumed joint torque limit (numerical integration in the manner of Bobrow, Dubowsky and Gibson, 1985). Over nine arm and torque cases the six-part total time falls by 21 to 29%, and the grip bound m sqrt((g+a_z)^2 + a_r^2)/(2 mu) rises by a factor of 1.2 to 2.4. The jaw bound was simulated only up to 40 m/s^2 earlier and most cases here exceed that. All parameters are assumed; results are stylised and say nothing about physical arms.

## 1. Setting and method
See `../README.md` for the model, tests and caveats, and `../experiments/results.txt` for every number.

## References
Bobrow, Dubowsky, Gibson (1985), Time-optimal control of robotic manipulators along specified paths, IJRR 4(3):3-17. Pfeiffer, Johanni (1987), A concept for manipulator trajectory planning, IEEE J. Robotics and Automation RA-3:115-123. Flash, Hogan (1985), J. Neurosci. 5(7) (not re-verified). Zykov et al. (2005), Nature 435. See `refs.bib`.
