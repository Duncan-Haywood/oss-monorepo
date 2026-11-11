# buildbot-sheathing research log

## 2026-11-11 · Milestone 1 planned: the panel gap and the sheet's own pose in the joint-nail budget

Written before any milestone-1 experiment was run (the model and its tests, `src/` and `tests/`, were written first; the tests only check it against `buildbot-studfind` and closed forms).

- **Why.** `buildbot-fasten` and `buildbot-studfind` put each sheet edge exactly on its joint stud's centre line. On a real wall the panels are hung with APA's recommended 1/8 in gap, centred on the joint stud, so each edge sits 1/16 in past the centre and the 3/8 in edge-distance rule moves with it. The sheet is also hung with a translation and a rotation error, and its width differs from the 48 in stud module. None of that has been in the budget.
- **Fixed inputs.** Robot tip scatter 0.9 mm per nail (`buildbot-fasten`); stud estimate scatter a shared error per stud, single read (`buildbot-studfind`'s policy); 8d common nail, 1.5 in face, 3/8 in edge distance, 1/8 in gap (APA builder tips, via search).
- **H1 (the gap alone tightens the stud budget).** Perfect placement, nominal aim: the single-read stud scatter allowed for 95% clean sheets falls below 0.70 mm (from `buildbot-studfind`'s 0.89 mm with no gap). Refuted if ≥ 0.70 mm.
- **H2 (a nominal-aim robot needs a near-perfectly plumb sheet).** With stud scatter 0.5 mm and tip scatter 0.9 mm, the sheet rotation (1σ) allowed for 95% clean sheets is under 0.05°. Refuted if ≥ 0.05°.
- **H3 (seeing the edge buys placement tolerance).** Aiming each joint nail from the measured sheet edge (edge-line error 0.5 mm) at least doubles the sheet translation (1σ) allowed for 95%, against aiming at the design window. Refuted if the ratio is under 2.
- **H4 (sheet-referenced rows drift off the studs within a wall).** Butting each sheet against the last with a 1/8 in gap: with full 48 in panels the third sheet's joint window is empty (arithmetic: 3.2 mm of drift a sheet against a 6.3 mm window); with panels trimmed by the typical 1/16 in ("sized for spacing"), no more than 5 sheets in a row keep every joint window non-empty. The Monte Carlo adds gap and width noise; refuted if a 1/16 in row stays feasible (≥ 50% of trials) past sheet 5.
- **H5 (stud-referenced placement fixes the drift).** Setting each sheet from its own studs keeps every joint feasible, and with 1/16 in trimmed panels and a width scatter of 1 mm (1σ) the realised gap is positive at ≥ 99% of joints. Refuted below 99%.
- **Also reported, not scored:** clean-sheet rate along a 10-sheet row for each placement and aim; nails missed per sheet; the allowed stud scatter as a function of gap.
