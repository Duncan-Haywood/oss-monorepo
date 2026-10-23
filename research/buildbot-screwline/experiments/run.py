"""Drywall-screw stud-finding budget -> results.txt (stdout) and results.json. Deterministic (seed 1)."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from buildbot_screwline import model as M  # noqa: E402

MM = 1e-3
S_ROBOT = 0.9 * MM    # buildbot-fasten: G1 tip scatter, 11-bit joint sensors (a model result, not a measurement)
out = {"s_robot_mm": S_ROBOT / MM}
print("# robot scatter per screw %.1f mm; 95%% target; wall 16 in pitch = 28 screws, ceiling 12 in = 36" % (S_ROBOT / MM))

print("\n## A. P(sheet has at most m missed screws) vs reading scatter, single read per member")
grid = [0.5, 1, 1.5, 2, 3, 4, 6]
out["A"] = {"grid_mm": grid}
print("%-24s" % "case" + "".join("%9s" % ("%.2g mm" % g) for g in grid))
for pitch, nm in ((16, "wall"), (12, "ceiling")):
    for m in (0, 1, 3):
        row = [M.simulate(pitch, g * MM, S_ROBOT, max_miss=m)[0] for g in grid]
        out["A"]["%s, <=%d missed" % (nm, m)] = row
        print("%-24s" % ("%s, <=%d missed" % (nm, m)) + "".join("%9.2f" % r for r in row))

print("\n## B. reading scatter (mm, 1 sigma per read) allowed for 95% of sheets")
out["B"] = {}
for pitch, nm in ((16, "wall"), (12, "ceiling")):
    for m in (0, 1, 3):
        row = [M.required_meas(pitch, S_ROBOT, max_miss=m, n_read=n) / MM for n in (1, 4, 16)]
        out["B"]["%s, <=%d missed" % (nm, m)] = row
        print("%-20s reads 1/4/16: %s" % ("%s, <=%d missed" % (nm, m), " ".join("%.2f" % r for r in row)))
    r = M.required_meas(pitch, S_ROBOT, policy="servo") / MM
    out["B"]["%s, re-measure each screw" % nm] = r
    print("%-20s re-measure every screw: %.2f" % (nm, r))

print("\n## C. a vendor-claim stud finder ('typically within 1/8 in'): read as sigma 3.2 mm or as a 95% bound (1.6 mm)")
out["C"] = {}
for sm in (3.2, 1.6):
    for pitch, nm in ((16, "wall"), (12, "ceiling")):
        for n in (1, 4):
            p0, mi = M.simulate(pitch, sm * MM, S_ROBOT, n_read=n)
            p3 = M.simulate(pitch, sm * MM, S_ROBOT, n_read=n, max_miss=3)[0]
            out["C"]["%s sigma %.1f, %d reads" % (nm, sm, n)] = [p0, p3, mi]
            print("sigma %.1f mm %-8s %d reads: clean %.2f, <=3 missed %.2f, missed share %.1f%%" % (sm, nm, n, p0, p3, 100 * mi))
json.dump(out, open(HERE / "results.json", "w"), indent=1)
