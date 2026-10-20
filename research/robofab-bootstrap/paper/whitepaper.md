# Can a printed gripper assemble its own next generation? A stylised bootstrapping-chain model

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
We extend a seven-part toy-gripper assembly model so that the arm assembling generation k+1 is the printed gripper of generation k. Exhaustive assembly-order search shows the jaw opening needed to assemble a gripper scaled by s is 30 s mm. With an assumed opening of 32 s - 2t mm (fixed-size pads of thickness t), a gripper can build a copy only for s >= t, and an actuator stroke cap of S mm admits such a scale only if 30 t <= S. Chains from a purchased seed either reach a fixed point or shrink until they stop. The result is largely algebraic given the assumption, and applies to one toy design only.

## 1. Setting
Self-replication proposals (Zykov et al., 2005; Jones et al., 2011) rely on machines that assemble their own parts, with non-replicable "vitamins". Assembly sequence planning with physical feasibility has been studied (Tian et al., 2024), which we do not reproduce. See `../README.md` for method and `../experiments/results.txt` for the numbers.

## 2. Results
Unit gripper: opening 24 mm, requirement 30 mm. Smallest self-assembling scale equals pad thickness (t = 1, 2, 3, 4, 6 mm give s = 1, 2, 3, 4, 6). Stroke cap with t = 4: none at 100 mm, scale 4.0 at 120 mm, 4.0-5.0 at 160 mm. Seeds of 130 and 140 mm sustain scales 4.0 and 4.5; seeds of 60 and 100 mm lose size each generation and stop.

## 3. Limitations
The opening model is an assumption; no tolerance, shrinkage, reach, force or print-size limits; one design; simulated only.

## References
`refs.bib`, copied from the repository's `PROJECTS.md` (checked 2026-10-12) and not independently re-verified in this run. Authors abbreviated with "others" for Tian et al. and Jones et al.
