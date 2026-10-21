"""Cells where register-file WS wins against the assumed cycle period. From results.json only."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
P = R["periods"]
fig, ax = plt.subplots(figsize=(6.4, 3.6))
T = [p["T_ns"] for p in P]
ax.plot(T, [p["ws_unpacked"] for p in P], "o-", color="#d95f02", label="unpacked (of 32)")
ax.plot(T, [p["ws_packed"] for p in P], "s-", color="#1b9e77", label="packed (of 32)")
ax.plot(T, [p["ws_all_per_edge"] for p in P], "^--", color="k", label="all 64, value halved (per edge)")
ax.axvline(1, color="grey", ls=":", lw=1); ax.text(1.05, 2, "file read as pJ\n(accel-pdkprice)", fontsize=7, color="grey")
ax.set_xscale("log"); ax.set_xlabel("assumed cycle period T of the OpenRAM characterisation (ns)")
ax.set_ylabel("cells where register-file WS beats OS"); ax.legend(fontsize=7, loc="center right")
ax.set_title("accel-pdkperiod: the packed verdict depends on a period the .lib does not state", fontsize=8)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "pdkperiod.png"), dpi=110)
