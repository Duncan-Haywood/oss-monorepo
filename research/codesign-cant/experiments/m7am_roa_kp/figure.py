"""Milestone 7am figure: (a) deaths against start-offset half-width by kp group; (b) per-design median critical offset against kp,
with the slopes a distance (0) and an acceleration (-1) predict. Writes m7am_roa_kp.png."""
import json, os
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
J = json.load(open(os.path.join(HERE, "stats.json")))
hw = [0.5 * float(s) for s in J["table"]]
fig, (a, b) = plt.subplots(1, 2, figsize=(9.0, 3.6))
for k, (lab, c, ls, n) in enumerate([("kp≈10, quiet+O", "C0", "--", 1536), ("kp 22-31, quiet+O", "C3", "--", 768),
                                     ("kp≈10, full", "C0", "-", 1536), ("kp 22-31, full", "C3", "-", 768)]):
    a.plot(hw, [v[k] / n for v in J["table"].values()], ls, color=c, marker="o", ms=3, label=lab)
a.set_xscale("log"); a.set_xlabel("start-offset half-width per axis (m)"); a.set_ylabel("share of flights dead (18 s)")
a.set_title("(a) 45° limit, no cap", fontsize=9); a.legend(fontsize=7)
r = J["rb2"]; kp = np.array(r["kp"]); med = np.array([np.nan if v is None else v for v in r["med_ec"]], float)
ok = np.array(r["n_dead"]) >= 8; wide = np.array(r["wide"])
b.loglog(kp[ok & ~wide], med[ok & ~wide], "o", color="C0", label="t45, t45 cap"); b.loglog(kp[ok & wide], med[ok & wide], "s", color="C3", label="t45 cap wide")
x = np.geomspace(8, 35, 20); m0 = np.nanmedian(med[ok & ~wide]); k0 = np.median(kp[ok & ~wide])
b.plot(x, m0 * (x / k0) ** -1.0, ":", color="0.4", label="acceleration (slope −1)"); b.plot(x, m0 + 0 * x, "--", color="0.6", label="distance (slope 0)")
b.plot(x, m0 * (x / k0) ** r["slope"], "-", color="k", lw=0.8, label=f"fit, slope {r['slope']:.2f}")
b.set_xlabel("position kp (s⁻²)"); b.set_ylabel("median critical half-width (m)"); b.set_title("(b) per design, quiet+O", fontsize=9)
b.legend(fontsize=7); fig.tight_layout(); fig.savefig(os.path.join(HERE, "m7am_roa_kp.png"), dpi=130)
