"""Milestone 7p analysis: checks P1-P7 from results.json (and 7o's results.json for P1). Writes analysis.txt."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
O = json.load(open(os.path.join(HERE, "..", "m7o_arm_sweep", "results.json")))
R, GRID, MODES = D["runs"], D["grid"], D["modes"]
LABS = ["7e", "7l t45 cap wide", "aware cap wide", "aware cap wide fixL"]
GEOMS = ["above", "below"]


def ok(r, m, j):
    return r[f"{m}_rho"][j] < 1.0 and r[f"{m}_feasible"][j]


def rs_of(lab, g, src=R):
    return sorted([r for r in src if r["label"] == lab and r["geom"] == g], key=lambda r: r["seed"])


def window(lab, g, m, key="45_2"):
    """(L, count) at grid points where all six seeds are valid under law m."""
    rs = rs_of(lab, g); out = []
    for L in GRID:
        i = [r["L"].index(L) for r in rs]
        if all(ok(r, m, j) for r, j in zip(rs, i)):
            out.append((L, sum(r[f"dead_{m}_{key}"][j] for r, j in zip(rs, i))))
    return out


lines = ["Milestone 7p analysis (results.json). L2-45 = diverged of 384 at lever 2, 45 deg, cap; window = grid points where all 6 seeds are valid.", ""]
# P1: inh reproduces 7o resize at common points and own L
mism = 0; npts = 0
for lab in LABS:
    for g in GEOMS:
        a, b = rs_of(lab, g), rs_of(lab, g, O["runs"])
        for ra, rb in zip(a, b):
            for j, L in enumerate(rb["L"][:-1]):
                ja = ra["L"].index(L)
                for c in ("45_1", "20_2", "45_2", "20_3"):
                    npts += 1; mism += ra[f"dead_inh_{c}"][ja] != rb[f"dead_resize_{c}"][j]
            for c in ("45_1", "20_2", "45_2", "20_3"):
                npts += 1; mism += ra[f"dead_inh_{c}"][-1] != rb[f"dead_resize_{c}"][-1]
own = {(lab, g, m): sum(r[f"dead_{m}_45_2"][-1] for r in rs_of(lab, g)) for lab in LABS for g in GEOMS for m in MODES}
lines.append(f"P1: inh vs 7o resize, {npts} (design, L, condition) counts compared, {mism} differ.")
for lab in LABS:
    lines.append(f"    own-L L2-45 {lab:20s} " + "; ".join(f"{g}: " + " ".join(f"{m} {own[(lab, g, m)]}" for m in MODES) for g in GEOMS))
lines.append("")
# window tables
lines.append("Windows (L mm: L2-45 count):")
best = {}
for lab in LABS:
    for g in GEOMS:
        for m in MODES:
            w = window(lab, g, m)
            best[(lab, g, m)] = min(w, key=lambda t: t[1]) if w else None
            rises = [w[k + 1][1] - min(c for _, c in w[:k + 1]) for k in range(len(w) - 1)]
            mr = max(rises) if rises else 0
            lines.append(f"  {lab:20s} {g:5s} {m:6s} max rise after a minimum {mr:3d} | " + ", ".join(f"{L * 1000:.0f}: {c}" for L, c in w))
lines.append("")
# P2
p2 = []
for lab in LABS:
    for g in GEOMS:
        w = window(lab, g, "fam")
        rise = max([w[k + 1][1] - min(c for _, c in w[:k + 1]) for k in range(len(w) - 1)] or [0])
        p2.append(rise <= 2)
lines.append(f"P2 (fam non-increasing, rises <= 2): {sum(p2)} of {len(p2)} set-geometries -> {'held' if all(p2) else 'refuted'}")
# P3
b7o = {"above": 6, "below": 44}
p3 = {g: best[("7l t45 cap wide", g, "fam")] for g in GEOMS}
lines.append(f"P3 (fam 7l best below 7o's 6 / 44 in >= 1 geometry): {p3} -> {'held' if any(p3[g] and p3[g][1] < b7o[g] for g in GEOMS) else 'refuted'}")
# P4
aw = {"above": 53, "below": 52}
p4 = {g: best[("7l t45 cap wide", g, "xb")] for g in GEOMS}
lines.append(f"P4 (xb 7l best above aware's 53 / 52 in >= 1 geometry): {p4} -> {'held' if any(p4[g] and p4[g][1] > aw[g] for g in GEOMS) else 'refuted'}")
# P5
p5 = {}
for g in GEOMS:
    wi, wf = dict(window("7l t45 cap wide", g, "inh")), dict(window("7l t45 cap wide", g, "fam"))
    p5[g] = {L * 1000: (wi[L], wf[L]) for L in wi if L in wf}
held5 = all(abs(a - b) <= 5 for g in GEOMS for a, b in p5[g].values())
lines.append(f"P5 (|inh - fam| <= 5 at common window points, 7l): " + "; ".join(f"{g} " + ", ".join(f"{L:.0f}: {a}/{b}" for L, (a, b) in p5[g].items()) for g in GEOMS) + f" -> {'held' if held5 else 'refuted'}")
# P6
p6 = {g: (own[("7l t45 cap wide", g, "inh")], own[("7l t45 cap wide", g, "xb_abs")]) for g in GEOMS}
lines.append(f"P6 (xb_abs own-L > inh own-L, 7l, both): {p6} -> {'held' if all(b > a for a, b in p6.values()) else 'refuted'}")
# P7
p7 = {}
for g in GEOMS:
    rs = rs_of("7l t45 cap wide", g)
    p7[g] = (float(np.mean([r["J_inh_45_1"][-1] for r in rs])), float(np.mean([r["J_xb_abs_45_1"][-1] for r in rs])))
lines.append(f"P7 (|J xb_abs - J inh| <= 0.05 at own L, 7l, lever 1 45): " + "; ".join(f"{g} {a:.3f} vs {b:.3f}" for g, (a, b) in p7.items()) +
             f" -> {'held' if all(abs(a - b) <= 0.05 for a, b in p7.values()) else 'refuted'}")
lines.append("")
# mass and power at each law's best point for the 7l set
lines.append("7l set at its best window point per law (mean mass kg, mean hover power W, L2-45):")
for g in GEOMS:
    rs = rs_of("7l t45 cap wide", g)
    for m in MODES:
        b = best[("7l t45 cap wide", g, m)]
        if not b: lines.append(f"  {g} {m}: no window"); continue
        j = [r["L"].index(b[0]) for r in rs]
        lines.append(f"  {g:5s} {m:6s} L {b[0] * 1000:.0f} mm  mass {np.mean([r[f'{m}_mass'][k] for r, k in zip(rs, j)]):.3f}  power {np.mean([r[f'{m}_power'][k] for r, k in zip(rs, j)]):.0f}  L2-45 {b[1]}")
lines.append("")
lines.append("Longest all-six-valid arm per set and law (mm):")
for lab in LABS:
    for g in GEOMS:
        lines.append(f"  {lab:20s} {g:5s} " + "  ".join(f"{m} {max((L for L, _ in window(lab, g, m)), default=float('nan')) * 1000:.0f}" for m in MODES))
open(os.path.join(HERE, "analysis.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
