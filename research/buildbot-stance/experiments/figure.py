"""Where a standing G1 can put a nailer on the wall, with the 4x8 sheet's nails over it, and what re-stancing costs."""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parents[1] / "buildbot-custom" / "src"), str(HERE.parent / "src")]
from buildbot_stance import model as M  # noqa: E402

D = M.load(HERE / "reach.json")
R = json.loads((HERE / "results.json").read_text())
fig, ax = plt.subplots(1, 2, figsize=(9.5, 4.6))
a = ax[0]
ok = M.reachable(D, 0.4, 50.0, 0.6)
for dy in D["dys"]:
    for z in D["zs"]:
        if (round(dy, 6), round(z, 6)) in ok:
            for s in (1, -1):
                a.add_patch(plt.Rectangle((s * dy - 0.05, z - 0.05), 0.1, 0.1, color="C2", alpha=0.45, lw=0))
pts = M.nails()
best = max((len(M.stance_cover(ok, D["dys"], D["zs"], pts, y, 0.0)), -abs(y - 0.61), y) for y in [k * 0.05 for k in range(-8, 33)])[2]
inside = M.stance_cover(ok, D["dys"], D["zs"], pts, best, 0.0)
for i, (y, z) in enumerate(pts):
    a.plot(y - best, z, "o", ms=3.5, color="C3" if i in inside else "0.45")
a.set_xlim(-0.9, 0.9); a.set_ylim(-0.05, 2.5); a.set_aspect("equal")
a.set_xlabel("sideways from the middle of the feet (m)"); a.set_ylabel("height above the floor (m)")
a.set_title("green: tool points held with a 50 N push;\nred: nails of one sheet that stance reaches", fontsize=9)
b = ax[1]
for t, c in zip(R["whole"], ("C0", "C1")):
    ts = sorted(float(k) for k in t["by_t_stance"])
    b.plot(ts, [t["by_t_stance"][str(k)] for k in ts], "o-", color=c, label=f"G1 on platforms, {t['v']:g} m/s, {t['a']:g} m/s2")
b.axhline(372, color="k", ls="--", lw=1, label="by hand (buildbot-taskbook)")
b.axhline(61, color="C2", ls="--", lw=1, label="gantry (buildbot-custom)")
b.set_xlabel("time to re-stance (s), 13 stances"); b.set_ylabel("seconds for the whole 62-nail sheet")
b.legend(fontsize=8)
fig.tight_layout()
fig.savefig(HERE / "figure.png", dpi=130)
