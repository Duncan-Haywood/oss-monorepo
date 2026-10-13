"""Sweep arm approach constraints, jaw opening, pad size and gravity; print a results table."""
from robofab_selfparts.model import Model, search

print("# robofab-selfparts: valid assembly orders of a 7-part toy gripper (6 free parts, 720 orderings)")
print("# jaw_open in mm; pad_t=4 mm, pad_frac=0.5 unless stated\n")
print("## 1. Arm approach constraint x jaw opening (gravity on)")
print(f"{'arm':6s} {'jaw':>5s} {'orders':>7s} {'largest_subassembly':>20s}  stuck parts")
for arm in ("free", "side", "top"):
    for w in (20, 25, 30, 35, 40):
        r = search(Model(arm, jaw_open=w))
        print(f"{arm:6s} {w:5d} {r['orders']:7d} {r['reach']:>17d}/6  {','.join(r['stuck']) or '-'}")
print("\n## 2. Smallest jaw opening (0.5 mm steps) giving at least one valid order")
for arm in ("free", "side", "top"):
    w = next((x / 2 for x in range(20, 100) if search(Model(arm, jaw_open=x / 2))["orders"] > 0), None)
    print(f"{arm:6s} {w}")
print("\n## 3. Gravity off (grasped-and-held, no support rule), jaw 40")
for arm in ("free", "side", "top"):
    r = search(Model(arm, jaw_open=40, gravity=False))
    print(f"{arm:6s} orders={r['orders']}")
print("\n## 4. Pad thickness (jaw 40, arm=side): thicker pads need more free space around the part")
for t in (2, 4, 6, 8, 10):
    r = search(Model("side", jaw_open=40, pad_t=t))
    print(f"pad_t={t:2d} orders={r['orders']:4d} stuck={','.join(r['stuck']) or '-'}")
print("\n## 5. Example order (side arm, jaw 40)")
print(" -> ".join(search(Model("side", jaw_open=40))["one"]))
