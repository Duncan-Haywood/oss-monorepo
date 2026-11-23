"""Milestone 7ak: score predictions DK0-DK7 (../../LOG.md) from results.json. Writes stats.txt and stats.json."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
R7 = json.load(open(os.path.join(HERE, "..", "m7aj_descfn", "results.json")))
SETS = list(R["setcap"])
ARMS = list(R["arms"])
FACT = "OMWGSY"
NAME = dict(O="start offset", M="mean wind", W="wind step", G="turbulence", S="sensor noise", Y="yaw steps")
run = {(r["arm"], r["set"]): r for r in R["runs"]}
dead = {k: np.array(v["dead"], int) for k, v in run.items()}                 # (10, 64)
amp = {k: np.array(v["amp_deg"], float) for k, v in run.items()}             # (10, 64, 2)
n = {k: int(v.sum()) for k, v in dead.items()}
L, J = [], {"counts": {s: {a: n[(a, s)] for a in ARMS} for s in SETS}}
verdict = lambda ok: "held" if ok else "REFUTED"

# DF predictions from 7aj (per cond, flight, axis; a_th per rad of limit; -1 = none)
a7 = np.stack([np.stack([np.array(p[a]["a_th"], float) for a in ("roll", "pitch")], -1) for p in R7["pred"]], 0)
a7 = np.where(a7 < 0, np.nan, a7)
lc7 = np.stack([np.stack([np.array(p[a]["lc"], float) for a in ("roll", "pitch")], -1) for p in R7["pred"]], 0)

L.append("Deaths of 640 per arm (18 s, lever 0, 64 held-out flights x 10 seeds); set at its knee limit.")
L.append("  arm         " + "".join(f"{s + ' @' + str(int(R['setcap'][s])) + chr(176):>18}" for s in SETS))
for a in ARMS:
    L.append(f"  {a:<12}" + "".join(f"{n[(a, s)]:>18}" for s in SETS))
L.append("  DF (7aj)    " + "".join(f"{v:>18}" for v in (4, 285, 2)))

mism = {s: int((dead[("full", s)] != np.array(R["stored_dead"][s], int)).sum()) for s in SETS}
ok0 = all(v == 0 for v in mism.values())
L.append(f"\nDK0 check: full arm vs 12g stored per-flight deaths, mismatches {mism} -> {verdict(ok0)}")
ok1 = n[("quiet", "bolted")] <= 32
L.append(f"DK1 bolted-on at 20 deg, quiet: {n[('quiet', 'bolted')]} of 640 (bar <= 32; full {n[('full', 'bolted')]}, DF 4) -> {verdict(ok1)}")
q2 = n[("quiet", "1.25x")]
ok2 = 200 <= q2 <= 370
L.append(f"DK2 1.25x at 45 deg, quiet: {q2} of 640 (bar 200-370; full {n[('full', '1.25x')]}, DF 285) -> {verdict(ok2)}")
ok3 = n[("quiet", "retrained")] <= 3
L.append(f"DK3 retrained at 45 deg, quiet: {n[('quiet', 'retrained')]} of 640 (bar <= 3; full {n[('full', 'retrained')]}, DF 2) -> {verdict(ok3)}")


def largest_cut(s):
    cuts = {x: n[("full", s)] - n[(f"full-{x}", s)] for x in FACT}
    return max(cuts, key=cuts.get), cuts


x4, c4 = largest_cut("bolted")
ok4 = x4 == "M" and sorted(c4.values())[-1] > sorted(c4.values())[-2]
L.append(f"DK4 bolted-on: cut by removing each factor {c4}; largest {x4} ({NAME[x4]}) -> {verdict(ok4)}")
x5, c5 = largest_cut("retrained")
ok5 = x5 == "W" and sorted(c5.values())[-1] > sorted(c5.values())[-2]
L.append(f"DK5 retrained: cut by removing each factor {c5}; largest {x5} ({NAME[x5]}) -> {verdict(ok5)}")
ok6 = True
for s in SETS:
    best = max(FACT, key=lambda x: n[(f"quiet+{x}", s)])
    sh = n[(f"quiet+{best}", s)] / max(n[("full", s)], 1)
    ok6 &= sh <= 0.75
    L.append(f"DK6 [{s}] largest quiet+X: {best} ({NAME[best]}) {n[(f'quiet+{best}', s)]} = {sh:.2f} of full {n[('full', s)]}")
L.append(f"DK6 every set <= 0.75 -> {verdict(ok6)}")

ib = R["idx"]["bolted"]
pred_b = np.nanmax(a7[ib], -1) * 20.0                                         # deg, worst axis with a cycle
meas_b = np.nanmax(amp[("quiet", "bolted")], -1)
alive_b = dead[("quiet", "bolted")] == 0
ratio = meas_b[alive_b] / pred_b[alive_b]
mr = float(np.nanmedian(ratio))
ok7 = 0.9 <= mr <= 1.1
L.append(f"DK7 bolted-on alive in quiet at 20 deg ({int(alive_b.sum())} flights): worst-axis amplitude measured median "
         f"{np.nanmedian(meas_b[alive_b]):.1f} deg, DF {np.nanmedian(pred_b[alive_b]):.1f} deg; ratio median {mr:.3f} "
         f"(IQR {np.nanpercentile(ratio, 25):.3f}-{np.nanpercentile(ratio, 75):.3f}) -> {verdict(ok7)}")
J["verdicts"] = dict(DK0=ok0, DK1=ok1, DK2=ok2, DK3=ok3, DK4=ok4, DK5=ok5, DK6=ok6, DK7=ok7)
J["DK7"] = dict(ratio_median=mr, alive=int(alive_b.sum()))

# --- post hoc (written after DK0-DK7 were scored) ---
L.append("\nPost hoc (written after DK0-DK7 were scored).")
for s in SETS:
    i = R["idx"][s]
    for a in ("full", "quiet"):
        m = np.nanmax(amp[(a, s)], -1); al = dead[(a, s)] == 0
        L.append(f"  [{s}] {a}: worst-axis amplitude of alive flights, median {np.nanmedian(m[al]):.1f} deg, 90th pct {np.nanpercentile(m[al], 90):.1f} deg")
    # deaths at plants the linear model calls stable on both axes
    stab = (lc7[i] == 0).all(-1)
    for a in ("full", "quiet"):
        L.append(f"  [{s}] {a}: deaths at plants linearly stable on both axes {int((dead[(a, s)].astype(bool) & stab).sum())} of {n[(a, s)]}")
    # DF critical-limit ranking: dead flights should have larger predicted amplitude
    pa = np.nanmax(a7[i], -1) * R["setcap"][s]
    for a in ("full", "quiet"):
        d = dead[(a, s)].astype(bool)
        if d.any() and (~d).any() and np.isfinite(pa).any():
            x, y = pa[d], pa[~d]
            x, y = np.nan_to_num(x, nan=0.0), np.nan_to_num(y, nan=0.0)
            auc = float(((x[:, None] > y[None]) + 0.5 * (x[:, None] == y[None])).mean())
            L.append(f"  [{s}] {a}: AUC of DF amplitude for dead vs alive {auc:.3f}; DF amplitude median dead {np.median(x):.1f}, alive {np.median(y):.1f} deg")
open(os.path.join(HERE, "stats.txt"), "w").write("\n".join(L) + "\n")
json.dump(J, open(os.path.join(HERE, "stats.json"), "w"), indent=1)
print("\n".join(L))
