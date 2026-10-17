# Does an insertion policy tuned in one simulator survive a better one? A stylised MuJoCo study

*Produced with AI assistance (Claude). Stylised, simulation-only study; see Limitations.*

## Abstract

We tune a five-parameter search policy for planar peg-in-hole insertion with the cross-entropy method in four training conditions (three MuJoCo parameter sets L0, L1, L2 of increasing contact fidelity, and domain randomisation, DR), and test it on all three plus a held-out parameter set T. Policies tuned on the simplest level (frictionless, tilt locked) reach 0.91 success on it but 0.53 on L2 and 0.26 on T. Training on L2 or DR gives about 0.43 to 0.46 on T. With five seeds the seed ranges overlap, so DR and L2 training cannot be ranked. No policy exceeds 0.61 on T on any seed. Everything is simulated and stylised.

## 1. Setting and related work

Insertion policies are commonly developed in simulation and transferred (Narang et al. 2022; Tang et al. 2023). Domain randomisation (Tobin et al. 2017) varies simulator parameters during training. We ask the sim-to-sim version of the question in a deliberately small task, with MuJoCo (Todorov et al. 2012) as the engine and the cross-entropy method (Rubinstein 1999) as optimiser. This is a toy study and neither reproduces nor compares with those works.

## 2. Model

Planar peg, three actuated degrees of freedom, chamfered hole, randomised clearance, offset, tilt and perception error (see `README.md`). Fidelity levels differ in friction, time step, contact softness, tilt freedom and gripper stiffness and damping. Test scenarios are fixed across policies.

## 3. Results

From `research/robofab-insert/experiments/results.txt` (CEM, mean over 5 seeds, 200 test scenarios per cell). Train L0: 0.912, 0.973, 0.526, 0.258 on L0, L1, L2, T. Train L1: 0.806, 0.980, 0.451, 0.275. Train L2: 0.848, 0.976, 0.601, 0.462. Train DR: 0.816, 0.973, 0.571, 0.430. A straight push without search: 0.380, 0.365, 0.175, 0.210. Random search at the same training budget is lower on L0 and L1 tests and similar on T.

## 4. Limitations

Toy task; policy family of five parameters; parameter bounds that bind; fidelity levels that are variants of one model; five seeds; no hardware. The ranking of DR and L2 training is not resolved. Results say nothing about real insertion.

## References

See `refs.bib`. Narang et al., Tang et al. and Todorov et al. were taken from the repository's `PROJECTS.md` (checked 2026-10-12); Tobin et al. and Rubinstein were added from memory and not verified in this run; author lists are abbreviated and should be completed before submission.
