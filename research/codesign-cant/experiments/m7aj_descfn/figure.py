"""Milestone 7aj figure: describing-function predictions against the flights (results.json)."""
import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
__file__ = os.path.join(HERE, "stats.py")
src = open(__file__).read().split("# DJ0")[0]
exec(src)                                                     # loads P, meas, stored, sets, unst, lc, crit() as stats.py does

sel = (sets == "1.25x")[:, None, None] & unst & (lc == 1) & ((meas[20]["dead"] == 0)[:, :, None]) & np.isfinite(meas[20]["amp"])
fig, ax = plt.subplots(1, 3, figsize=(13, 4.0))
a = ax[0]
a.scatter(meas[20]["f"][sel], P["f"][sel], s=8, alpha=0.5, color="#3366aa")
lim = [1.1, 1.8]; a.plot(lim, lim, "k--", lw=0.8); a.set_xlim(lim); a.set_ylim(lim)
a.set_xlabel("measured frequency (Hz; FFT bins 0.11 Hz)"); a.set_ylabel("describing-function frequency f* (Hz)")
a.set_title("(a) frequency, 1.25x ceiling, 20 deg limit")
a = ax[1]
d20 = np.deg2rad(20.0)
a.scatter(np.rad2deg(meas[20]["amp"][sel]), np.rad2deg(P["a_th"][sel] * d20), s=8, alpha=0.5, color="#3366aa")
lim = [10, 45]; a.plot(lim, lim, "k--", lw=0.8); a.set_xlim(lim); a.set_ylim(lim)
a.set_xlabel("measured tilt amplitude (deg)"); a.set_ylabel("predicted tilt amplitude (deg)")
a.set_title("(b) amplitude, same flights")
a = ax[2]
fl = np.rad2deg(np.min(crit("tilt"), -1))
grid = np.linspace(15, 62, 200)
for st, c in (("bolted", "#aa3333"), ("1.25x", "#3366aa"), ("retrained", "#33884d")):
    g = sets == st
    a.plot(grid, [(fl[g] <= x).sum() for x in grid], "-", color=c, lw=1.4, label=f"{st}: describing function")
    caps = [20, 30, 45, 59]
    a.plot(caps, [int(stored[k][g].sum()) for k in caps], "o", color=c, ms=6, mfc="none", mew=1.5, label=f"{st}: simulated")
a.set_xlabel("tilt-command limit (deg)"); a.set_ylabel("diverged flights of 640 (18 s, lever 0)")
a.set_title("(c) deaths: tilt amplitude >= 60 deg vs simulated")
a.legend(fontsize=7, loc="center right")
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m7aj_descfn.png"), dpi=110)
print("ok")
