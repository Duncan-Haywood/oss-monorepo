# A rate-based holding criterion does not remove solver dependence in a simulated off-centre grasp (stylised, negative)

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
`robofab-sliprate` found that an off-centre bar held at one end creeps in MuJoCo (Todorov et al., 2012) at a rate set by solver settings. Here a criterion based on extrapolated creep over a 3 s hold (under 2 mm of far-end motion and drop) is compared with 1 and 5 degree rotation tolerances across eight settings (contact dimension, time constant, impedance ratio) for bars of 20 to 60 mm. The minimum holding force under the rate criterion varies across settings by factors of 33 to 400 or more, about as much as under the 1 degree tolerance. Only the 5 degree tolerance is stable (1.0 to 2.7) for bars up to 40 mm. The settings, not the criterion, drive the verdict. Results are stylised, from one engine, and say nothing about physical grippers.

## 1. Model, results, limitations
See `../README.md` and `../experiments/results.txt`.
