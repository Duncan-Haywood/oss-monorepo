# Does a loose rate threshold keep a simulated grasp verdict independent of solver settings across friction and lift? (stylised)

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
`robofab-slipthresh` found that only a loose rate threshold, far-end motion under 10 mm in 0.5 s (20 mm/s), makes the minimum holding force of a bar held at one end nearly independent of eight MuJoCo (Todorov et al., 2012) contact settings, at friction mu 0.5 and no lift. Repeating the 16-threshold sweep at mu 0.3, 0.5 and 0.8, with and without a 5 m/s^2 lift acceleration, 20 mm/s remains the only threshold with a worst-case spread under 5 in all six conditions (1.6 in four, 2.7 and 4.5 in the other two, the latter at mu 0.3 with lift); every other threshold is at least 20. Robustness still comes from looseness, and it weakens at low friction under load. Stylised, one engine, no claim about physical grippers.

## 1. Model, results, limitations
See `../README.md` and `../experiments/results.txt`.
