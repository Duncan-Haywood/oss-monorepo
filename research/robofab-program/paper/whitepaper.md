# How much of the gap between "the twin passes" and "it fails for real" does each level of twin close? A stylised study of checking robot programs

*Produced with AI assistance (Claude). Stylised, simulation-only; see Limitations.*

## Abstract

Programs for a pick-and-place cell are checked in a kinematic twin at three fidelities and compared with a held-out reference twin that adds effects the checkers do not model. Of 162 single-edit mutants of three programs that pass the reference, 69 fail it. Geometry-only checking rejects 38 of those 69, adding joint and payload limits 46, and adding stochastic grasp error, grip build-up and slip 60. No level rejects a mutant the reference accepts. The remaining misses are effects the checker does not model (a slightly longer grip build-up, a small hidden calibration offset), so the rates reflect how the reference was built, not real cells. Of four programs written by the building session, three failed the reference as drafted (one revision was prompted by the reference, not by the checkers); one failure (payload at long reach) was invisible to all three checking levels.

## 1. Setting

LLM-written robot programs (Liang et al. 2023) must be validated before they touch hardware. Simulated checks in the style of the contact-rich assembly work of Narang et al. (2022) are one option. We ask only the sim-to-sim version, with deliberately small models. Neither work is reproduced or compared.

## 2. Model and method

See `README.md`: SCARA kinematics, minimum-jerk moves, three nested checking levels L0 to L2 and a held-out reference REF with a hidden offset, lower friction and grip force, a reach-dependent payload and a 0.15 s grip build-up. Bugs are injected by deterministic single-site mutation.

## 3. Results

From `experiments/results.txt`. Mutants rejected out of the 69 that fail REF: L0 38, L1 46, L2 60; false alarms 0, 0, 0. By bug type: deleted steps are nearly all caught at L0 (15 of 16) and fully at L1; WAIT errors only at L2 (6 of 12); too-fast moves from L1 (7 of 9) and fully at L2; coordinate shifts 18, 18 and 24 of 27. Sensitivity of the L2 miss count to REF parameters: 3 to 12 of 162 across the variations tried (a further variation raises the REF grip build-up above the base programs' waits, so those programs themselves fail and the row is not comparable).

## 4. Limitations

Kinematic toy; REF is a different parameter set of the same model; bug types and magnitudes chosen by the author; three base programs; drafts written by an agent that knew the checks; no language model called; no hardware. Nothing here supports a claim about real cells or about LLM reliability.

## References

See `refs.bib`. Both entries come from the repository's `PROJECTS.md` (checked 2026-10-12) and were not re-checked in this run; author lists abbreviated.
