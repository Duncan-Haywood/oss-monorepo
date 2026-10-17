# Can a parallel-jaw arm assemble its own printed gripper? A stylised feasibility check

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
We ask a geometric necessary condition for robot self-assembly: can a modelled parallel-jaw arm grip and place every part of a seven-part toy gripper? Exhaustive search over assembly orders under three approach-direction models and a swept jaw opening finds that a complete order exists only when the jaw opens at least as wide as the widest part (30 mm, the cover); that a strictly top-down arm accepts 120 of 720 orderings against 384 for arms that may also slide parts sideways; and that jaw-pad thickness is irrelevant in this geometry. All results are stylised and say nothing about physical arms.

## 1. Setting
Self-replication proposals (Zykov et al., 2005; Jones et al., 2011) assume machines that assemble their own parts. Assembly sequence planning with physical feasibility has been studied, for example by Tian et al. (2024), whom we do not reproduce. We add a minimal grasp constraint to a collision-and-support checker so that the end effector of the builder is part of the question.

## 2. Model and results
See `../README.md` (Method) and `../experiments/results.txt`. Counts: free and side arms, jaw at least 30 mm: 384 valid of 720; top-down: 120; jaw 25 mm or less: 0 for all arms; support rule off: 720, 720, 120.

## 3. Discussion and limitations
The 30 mm threshold follows from the design rather than from any learned insight. The identical free and side results reflect a design that never needs insertion from below. One design, boxes, no reach, force, friction or fasteners.

## References
Bibliographic details are in `refs.bib`; entries were copied from the repository's `PROJECTS.md` (checked 2026-10-12) and not independently re-verified in this run. Author lists in `refs.bib` are abbreviated with "others" for Tian et al. and Jones et al.
