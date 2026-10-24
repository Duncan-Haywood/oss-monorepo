"""Dwell after a shot against recoil impulse, with the move times between nails (reads results.json)."""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
D = json.loads((HERE / "results.json").read_text())
Js = [0.25, 0.5, 1.0, 2.0, 4.0]
fig, ax = plt.subplots(1, 2, figsize=(9.5, 3.8))
a = ax[0]
for loop, c in (((4, 10), "C0"), ((8, 10), "C1"), ((8, 0), "C2")):
    ys = [max(w["dwell_s"] for w in D["dwell"] if (w["f"], w["delay_ms"]) == loop and w["J"] == J and w["eps_mm"] == 1.0) for J in Js]
    a.plot(Js, [y * 1e3 for y in ys], "o-", color=c, label=f"{loop[0]} Hz, {loop[1]} ms delay")
for key, ls, lab in (("v4.0_a10.0", "--", "shortest move, 4 m/s and 10 m/s2"), ("v0.5_a2.0", ":", "shortest move, 0.5 m/s and 2 m/s2")):
    a.axhline(D["legs"][key]["min_leg_s"] * 1e3, color="k", ls=ls, lw=1, label=lab)
a.set_xscale("log"); a.set_xticks(Js); a.set_xticklabels([f"{j:g}" for j in Js]); a.set_xlabel("recoil impulse (N s)"); a.set_ylabel("wait until wall back and tip within 1 mm (ms)")
a.legend(fontsize=7, loc="upper left")
b = ax[1]
rows = [r for r in D["rows"] if r["eps_mm"] == 0.25 and r["s_stud_mm"] == 0.0]
base = {(r["pose"], r["f"], r["delay_ms"], r["J"], r["v"], r["acc"]): r["sheet_s"] for r in D["rows"] if r["eps_mm"] > 1e3 and r["s_stud_mm"] == 0.0}
for acc, c in ((2.0, "C3"), (10.0, "C4")):
    vs = sorted({r["v"] for r in rows})
    ys = [max(r["sheet_s"] - base[(r["pose"], r["f"], r["delay_ms"], r["J"], r["v"], r["acc"])] for r in rows if r["v"] == v and r["acc"] == acc and r["J"] == 4.0) for v in vs]
    b.plot(vs, ys, "o-", color=c, label=f"{acc:g} m/s2, 4 N s, wait to 0.25 mm")
b.set_xscale("log"); b.set_xticks(vs); b.set_xticklabels([f"{v:g}" for v in vs]); b.set_xlabel("tip speed between nails (m/s)"); b.set_ylabel("seconds added to a 62-nail sheet")
b.legend(fontsize=8)
for x in ax:
    x.minorticks_off()
fig.tight_layout()
fig.savefig(HERE / "figure.png", dpi=130)
