"""Sweep tray distance, shoulder height, elbow limit and link ratio; print minimum reach."""
import math
from robofab_reach.model import targets, min_link

D = math.degrees
STEP = 10.0
print("# robofab-reach: smallest arm (link l1, mm) that can place all 6 free parts of the toy gripper")
print("# l2 = ratio*l1; base position free on the table (grid 10 mm); l1 grid 10 mm; wrist point only\n")
print("## 1. Tray gap (fixture edge to tray row) x shoulder height; ratio 1, no extra joint limits")
print(f"{'gap':>5s} " + " ".join(f"H={h:<4d}" for h in (50, 100, 200, 300)))
for gap in (40, 120, 240, 400):
    print(f"{gap:5d} " + " ".join(f"{min_link(h, targets(tray_gap=gap), step=STEP):<6}" for h in (50, 100, 200, 300)))
print("\n## 2. Elbow bend limit |q2| <= limit (gap 120, H=100, ratio 1)")
for deg in (180, 150, 120, 90, 60):
    print(f"elbow<={deg:3d} deg  l1={min_link(100, targets(), step=STEP, elbow=(0, math.radians(deg)))}")
print("\n## 3. Link ratio l2/l1 (gap 120, H=100)")
for r in (0.5, 0.75, 1.0, 1.5, 2.0):
    l = min_link(100, targets(), ratio=r, step=STEP)
    print(f"ratio={r:<4}  l1={l}  l2={None if l is None else r * l}  total={None if l is None else (1 + r) * l}")
print("\n## 4. Shoulder elevation limited to [0, 90] deg (no reaching below the shoulder), gap 120")
for h in (50, 100, 200, 300):
    print(f"H={h:3d}  l1={min_link(h, targets(), step=STEP, shoulder=(0.0, math.pi / 2))}")
