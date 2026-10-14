# Solver creep in a simulated off-centre grasp (stylised)

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
A previous note in this repository (`robofab-liftload`) found that whether a bar held at one end by two pads "holds" in MuJoCo (Todorov et al., 2012) depended on a rotation tolerance I had chosen. Here the bar's rotation rate is measured directly. For a 40 mm bar at friction 0.5 the rate is about 3.7 deg/s from 0.3 N to 3 N and still 2.2 deg/s at 20 N, so no threshold force exists. The rate scales with the contact time constant and falls tenfold when the friction-cone impedance ratio is raised from 1 to 10; torsional friction lowers it 2.5 to 3 times. Free drops occur only at 0.1 N. The earlier verdicts therefore reflect simulator settings. Results are stylised, from one engine, and say nothing about physical grippers (self-replication context: Zykov et al., 2005).

## 1. Model, results, limitations
See `../README.md` and `../experiments/results.txt`.
