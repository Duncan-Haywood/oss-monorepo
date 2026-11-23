"""Step 6c figure. Left: share of a 30-minute session out of sync (> one 30 fps frame off, mean over the ten noise
types at -10 dB) by warm-up amplitude, for the three trackers, with rl1's coarse failure share marked. Right: the
held line's median |error| over the session where rl1 is right, by warm-up amplitude, against the analytic case
(warm-up integral minus what rl1's 20 s rate absorbs, no grid error).

    python experiments/tracker/wander_figure.py <rows_6c.json>   # also reads wander_summary.json; writes wander.png
"""
import json
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from capture_sync.clock import warmup_integral as I  # noqa: E402

S = json.load(open(os.path.join(HERE, "wander_summary.json")))
rows = json.load(open(sys.argv[1]))
WS = [0.0, 5.0, 15.0, 30.0, 60.0]
FRAME = 1 / 30
METHODS = [("hold", "coarse line held", "#55a868"), ("gated", "gated, line after 20 s span", "#4c72b0"),
           ("gated60", "gated, line after 60 s span", "#8172b2")]
COL = dict(zip(WS, ["#999999", "#64b5cd", "#4c72b0", "#dd8452", "#c44e52"]))

fig, (a, b) = plt.subplots(1, 2, figsize=(11, 4.6))
x = np.arange(len(WS))
bw = 0.26
for k, (m, lab, c) in enumerate(METHODS):
    a.bar(x + (k - 1) * bw, [S[f"{w}|{m}"] for w in WS], bw, color=c, label=lab)
a.plot(x, [S[f"{w}|rl1_fail"] for w in WS], "k_", markersize=34, markeredgewidth=1.5,
       label="coarse step a frame off (% of sessions)")
a.set_xticks(x, [f"{w:g} ppm" for w in WS])
a.set_xlabel("warm-up amplitude |w| (tau 120 s)")
a.set_ylabel("share of the 30-min session out of sync (%)")
a.set_title("ten noise types at -10 dB, 200 ms room, 20 sessions each", fontsize=9)
a.grid(alpha=0.3, axis="y")
a.legend(fontsize=8, frameon=False)

tm = 20.0 + 60.0 * np.arange(30)
for w in WS:
    ok = [r for r in rows if r["w"] == w and r["method"] == "hold" and abs(r["coarse_err"]) <= FRAME]
    E = np.array([np.abs(r["err_min"]) for r in ok]) * 1e3
    b.plot(tm[:E.shape[1]] / 60, np.median(E, axis=0), color=COL[w], lw=2, label=f"|w| {w:g} ppm, held line (median)")
    tr = np.arange(30.0, 1810.0)
    srate = (I(30.0, w, 120.0) - I(10.0, w, 120.0)) / 20
    an = 1e3 * 1e-6 * np.abs(I(tr, w, 120.0) - I(20.0, w, 120.0) - srate * (tr - 20.0))
    b.plot((tr - 10) / 60, an, color=COL[w], lw=1, ls="--")
b.axhline(1e3 * FRAME, color="k", lw=1)
b.text(0.3, 1e3 * FRAME + 2, "one 30 fps frame", fontsize=8)
b.set_xlabel("minutes into the session")
b.set_ylabel("|error| of the held line (ms)")
b.set_title("held line where the coarse step is right; dashed: analytic warm-up error", fontsize=9)
b.grid(alpha=0.3)
b.legend(fontsize=7, frameon=False)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "wander.png"), dpi=130)
print("wrote wander.png")
