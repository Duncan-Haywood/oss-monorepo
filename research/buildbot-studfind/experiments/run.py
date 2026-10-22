"""Stud-finding budget experiments -> results.txt (stdout) and results.json. Deterministic (seed 1)."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from buildbot_studfind import model as M  # noqa: E402

MM = 1e-3
S_ROBOT = 0.9 * MM     # buildbot-fasten: 11-bit joint sensors scatter the G1 tip 0.9 mm (model, no backlash)
POLICIES = [("single, 1 read", dict(policy="single", n_read=1)),
            ("single, 4 reads", dict(policy="single", n_read=4)),
            ("single, 16 reads", dict(policy="single", n_read=16)),
            ("pooled, 1 read, 10 studs", dict(policy="pooled", n_read=1, k_studs=10)),
            ("re-measure each nail", dict(policy="servo"))]
SL = [0.0, 1.0, 2.0, 4.0, 8.0]
out = {"s_robot_mm": S_ROBOT / MM}
print("# robot scatter per nail %.1f mm; sheet = 62 nails; 95%% target" % (S_ROBOT / MM))

print("\n## A. whole-sheet success / share of nails missed vs reading scatter (layout scatter 1 mm)")
grid = [0.25, 0.5, 1, 1.5, 2, 3, 4, 6]
out["A"] = {"grid_mm": grid}
print("%-26s" % "policy" + "".join("%12s" % ("%.2g mm" % g) for g in grid))
for name, kw in POLICIES:
    row = [M.simulate(s_meas=g * MM, s_layout=1 * MM, s_robot=S_ROBOT, **kw) for g in grid]
    out["A"][name] = row
    print("%-26s" % name + "".join("%12s" % ("%.2f/%.1f%%" % (p, 100 * m)) for p, m in row))

print("\n## B. largest reading scatter (mm, 1 sigma per read) for 95% whole-sheet success, by layout scatter")
out["B"] = {"layout_mm": SL}
print("%-26s" % "policy" + "".join("%10s" % ("%.3g mm" % g) for g in SL))
for name, kw in POLICIES:
    if kw["policy"] == "servo":
        # independent per nail: closed form is the fasten budget on the 62 nails with the reading in quadrature
        row = []
        for sl in SL:
            lo, hi = 1e-5, 0.03
            for _ in range(22):
                mid = (lo + hi) / 2
                if M.simulate(s_meas=mid, s_layout=sl * MM, s_robot=S_ROBOT, **kw)[0] >= 0.95:
                    lo = mid
                else:
                    hi = mid
            row.append(lo / MM)
    else:
        row = [M.required_meas(s_layout=sl * MM, s_robot=S_ROBOT, **{k: v for k, v in kw.items()}) / MM for sl in SL]
    out["B"][name] = row
    print("%-26s" % name + "".join("%10.2f" % r for r in row))

print("\n## C. a vendor-claim stud finder (centre accuracy 'typically within 1/8 in = 3.2 mm'): two readings of the claim")
print("claim read as 1 sigma = 3.2 mm, or as a 95% bound (1 sigma = 1.6 mm); layout scatter 1 mm")
out["C"] = {}
for label, sm in (("sigma 3.2 mm", 3.2), ("sigma 1.6 mm", 1.6)):
    out["C"][label] = {}
    for name, kw in POLICIES:
        p, m = M.simulate(s_meas=sm * MM, s_layout=1 * MM, s_robot=S_ROBOT, **kw)
        out["C"][label][name] = [p, m]
        print("%-14s %-26s success %.3f, nails missed %.1f%% (%.1f of 62)" % (label, name, p, 100 * m, 62 * m))

print("\n## D. what the 17-nail joint wants: stud error alone, no robot scatter")
for s in (0.5, 1, 1.5, 2, 3):
    print("stud error %.1f mm: sheet success %.3f" % (s, M.sheet_success_analytic(s * MM, 0.0)))
out["D"] = {str(s): M.sheet_success_analytic(s * MM, 0.0) for s in (0.5, 1, 1.5, 2, 3)}
json.dump(out, open(HERE / "results.json", "w"), indent=1)
