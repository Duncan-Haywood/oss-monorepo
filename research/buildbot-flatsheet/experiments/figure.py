import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parents[1] / "buildbot-custom" / "src"), str(HERE.parent / "src")]
from buildbot_flatsheet import model as M  # noqa: E402

D = M.load(HERE / "reach.json")
fig, ax = plt.subplots(1, 2, figsize=(9.5, 4.2))
a = ax[0]
for need, c, off in ((0.0, "C0", -0.02), (50.0, "C3", 0.02)):
    ok = M.reachable(D, 1.0, need, 0.6)
    for x, dy in ok:
        for s in (1, -1):
            a.plot(s * dy + off, x, "s", ms=9, color=c, alpha=0.6, label=f"{need:.0f} N" if (x, dy, s) == next(iter(sorted((x_, d_, 1) for x_, d_ in ok))) else None)
a.set_xlim(-0.9, 0.9); a.set_ylim(0.85, 0.1)
a.set_xlabel("sideways from the middle of the feet (m)"); a.set_ylabel("hand reach in front of the feet (m)")
a.set_title("hand points held at 1.0 m, pushing down\n(blue: no push, red: 50 N; blank: not held)", fontsize=9)
a.legend(fontsize=8)
b = ax[1]
for need, c in zip(D["needs"], ("C0", "C3", "C2")):
    b.plot(D["zs"], [len(M.reachable(D, z, need, 0.6)) for z in D["zs"]], "o-", color=c, label=f"{need:.0f} N down")
b.set_xlabel("hand height (m)"); b.set_ylabel("grid cells held (of 63)")
b.set_title("held reach cells by hand height", fontsize=9)
b.legend(fontsize=8)
fig.tight_layout()
fig.savefig(HERE / "figure.png", dpi=130)
