# A stiffer friction cone removes the tolerance dependence of a held-bar grasp test in MuJoCo (stylised)

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
`robofab-sliprate` showed that a bar held at one end by two pads creeps at a steady rate in MuJoCo set by contact settings. Here the friction-cone option `impratio` is swept from 1 to 1000. The creep rate falls roughly as 1/`impratio` (3.66 to 0.004 deg/s for a 40 mm bar). At `impratio` 10 or more, the minimum holding forces for 1 and 5 degree tolerances agree within 26% in all 12 cases. They sit below the uniform-pressure torque bracket of `robofab-liftload` in 10 of 12 cases and above a point-contact bound, built on the five contact points per pad that MuJoCo reports, in all 12. This characterises one simulator's contact model on one geometry, with no claim about real grippers.

## 1. Model, results, limitations
See `../README.md` and `../experiments/results.txt`; the limitations listed there apply. The only reference is MuJoCo (Todorov, Erez and Tassa, IROS 2012), in `refs.bib`.
