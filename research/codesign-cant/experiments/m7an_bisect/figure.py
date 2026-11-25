"""Milestone 7an figure: (a) median critical radius against ray angle, relative to each flight's mean over angles, with the
profiles a per-axis limit (1 / max(|cos|, |sin|)) and a vector limit (flat) predict; (b) per-design guaranteed radius (minimum over
64 plants x 16 angles) against position kp. Writes m7an_bisect.png."""
import json, os
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
J = json.load(open(os.path.join(HERE, "stats.json")))
th = np.array([22.5 * k for k in range(16)]); prof = np.array(J["rc2"]["profile"])
fig, (a, b) = plt.subplots(1, 2, figsize=(9.0, 3.6))
ax = 1 / np.maximum(np.abs(np.cos(np.deg2rad(th))), np.abs(np.sin(np.deg2rad(th))))
a.plot(th, prof, "o-", color="k", ms=3, label="simulated (median over flights)")
a.plot(th, ax / ax.mean(), ":", color="C3", label="per-axis limit")
a.plot(th, np.ones_like(th), "--", color="0.6", label="vector limit (disc)")
a.set_xticks(range(0, 360, 45)); a.set_xlabel("start direction (deg)"); a.set_ylabel("critical radius / mean over directions")
a.set_title("(a) quiet+O, 45° limit, no cap", fontsize=9); a.legend(fontsize=7)
D = J["designs"]; kp = np.array([d["kp"] for d in D]); rad = np.array([d["radius"] for d in D])
wide = np.array([d["label"] == "t45 cap wide" for d in D])
b.loglog(kp[~wide], rad[~wide], "o", color="C0", label="t45, t45 cap"); b.loglog(kp[wide], rad[wide], "s", color="C3", label="t45 cap wide")
x = np.geomspace(8, 35, 20); f = min(J["rc3"]["floor"])
b.plot(x, f / x, ":", color="0.4", label=f"{f:.2f} m/s² / kp (floor)")
b.set_xlabel("position kp (s⁻²)"); b.set_ylabel("guaranteed radius (m)"); b.set_title("(b) per design, 64 plants × 16 directions", fontsize=9)
b.legend(fontsize=7); fig.tight_layout(); fig.savefig(os.path.join(HERE, "m7an_bisect.png"), dpi=130)
