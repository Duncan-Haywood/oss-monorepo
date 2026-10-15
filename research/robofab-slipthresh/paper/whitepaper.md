# Which rate threshold makes a simulated grasp verdict independent of solver settings? Only a loose one (stylised)

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
`robofab-slipcrit` found that a rate-based holding criterion (extrapolated far-end motion and drop under 2 mm over 3 s) is as dependent on solver settings as a rotation tolerance in MuJoCo (Todorov et al., 2012). Here the criterion's task time (0.5 to 10 s) and tip bound (1 to 10 mm) are swept for bars of 20 to 60 mm across eight settings. The worst-case spread of the minimum holding force falls with the allowed tip speed (tip bound over task time) and is 1.6 only at 20 mm/s (0.5 s, 10 mm), a loose threshold; 10 s holds fail at every bound. Stylised, one engine, no claim about physical grippers.

## 1. Model, results, limitations
See `../README.md` and `../experiments/results.txt`.
