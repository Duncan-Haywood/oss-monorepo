# Jaw force under lift acceleration and an off-centre centre of mass (stylised)

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
`robofab-grasp` showed that the friction bound m g / (2 mu) matches a MuJoCo simulation for the free parts of a toy gripper at rest. This note adds a constant lift or sideways acceleration (applied as an effective gravity in the pad frame) and a centre of mass away from the pads. Over 66 cases the simulated minimum jaw force is 1.00 to 1.06 times the scaled bound (Todorov et al., 2012, for the simulator), with force at most 0.21 N. The toy parts are symmetric, so they do not test torque. For a bar held at one end the outcome depends on the rotation tolerance: at 5 degrees the simulation holds with less force than a force-and-torque lower bound in 11 of 12 cases, and at 1 degree the longer bars fail even at 20 N. The torque bracket is therefore inconclusive here. Results are stylised and say nothing about physical grippers (self-replication context: Zykov et al., 2005).

## 1. Model, results, limitations
See `../README.md` and `../experiments/results.txt`; the limitations listed there apply, in particular that the constant-load frame is not a trajectory and that the pass/fail thresholds were chosen by me.
