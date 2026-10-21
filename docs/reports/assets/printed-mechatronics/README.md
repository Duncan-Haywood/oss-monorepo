# Printed mechatronics: cost split of an open printed robot arm

Data and code behind
[`../../2026-10-21-printed-mechatronics-direction.md`](../../2026-10-21-printed-mechatronics-direction.md)
and the post
[`../../../posts/2026-10-21-3d-print-a-robot-automated-manufacturing.md`](../../../posts/2026-10-21-3d-print-a-robot-automated-manufacturing.md).

```bash
python3 so101_cost.py   # ~2 s after a one-time 25 MB download; writes results.txt
```

- **Input 1:** the SO-101 follower arm's single-plate STL
  (`STL/SO101/Follower/Ender_Follower_SO101.stl`) from
  [TheRobotStudio/SO-ARM100](https://github.com/TheRobotStudio/SO-ARM100) at
  commit `a758567c`, Apache-2.0. Downloaded, not committed.
- **Input 2:** the "Parts for One Follower Arm" bill of materials in that
  repository's README at the same commit (US prices, $121.94 total). The
  script re-adds the lines and checks the stated total.
- **Measured:** enclosed solid volume and surface area of the mesh.
- **Assumed, and swept:** PLA density 1.24 g/cm^3; spool price $15, $20 and
  $30 per kg; a solid skin of 0.8, 1.2 or 1.6 mm plus the README's 15% infill
  for the printed-mass estimate. No slicer was run, so the printed mass is a
  geometric estimate, bracketed above by the 100%-infill figure.
