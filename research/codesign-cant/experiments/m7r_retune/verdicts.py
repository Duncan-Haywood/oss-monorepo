"""Milestone 7r verdicts R1-R7 (pre-registered in ../../LOG.md) from results.json. Writes verdicts.txt."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))["runs"]
K = "45_2_cap"


def rs(lab, g):
    return sorted((r for r in R if r["label"] == lab and r["geom"] == g), key=lambda r: r["seed"])


def dead(lab, g, k=K, valid=False):
    x = [r for r in rs(lab, g) if not valid or (r["feasible"] and r["closes"] and r["margin_rho"] < 1)]
    return sum(r[f"dead_{k}"] for r in x), len(x), [r[f"dead_{k}"] for r in x]


G = ("above", "below")
NEW7, NEWA, OLD7, OLD7S, OLDAS = "7l src_li [src_li]", "aware src_li [src_li]", "7l t45 cap wide [inh60]", "7l t45 cap wide [src_li]", "aware cap wide [src_li]"
L = ["Milestone 7r verdicts (pre-registered in LOG.md). L2-45 = diverged flights at lever 2, 45 deg, cap, of 64 per seed.", ""]
new = [r for r in R if r["label"] in (NEW7, NEWA)]
ok = [r for r in new if r["feasible"] and r["closes"] and r["margin_rho"] < 1]
L.append(f"R1: retuned designs valid under src_li: {len(ok)} of {len(new)} (held if all)")
for lab in (NEW7, NEWA):
    for g in G:
        m = [r["mass"] for r in rs(lab, g)]
        L.append(f"R2: {lab} {g}: mean mass {np.mean(m):.3f} kg (range {min(m):.3f}-{max(m):.3f}); in 0.65-0.90: {0.65 <= np.mean(m) <= 0.90}")
n_new, c_new, _ = dead(NEW7, "below")[0], len(rs(NEW7, "below")), None
d_old, n_old, per_old = dead(OLD7S, "below", valid=True)
L.append(f"R3: below, per design L2-45: retuned 7l {n_new / c_new:.1f} ({n_new} over {c_new}) against old 7l under src_li {d_old / max(n_old, 1):.1f} ({d_old} over {n_old} valid {per_old}); held if lower: {n_new / c_new < d_old / max(n_old, 1)}")
for g in G:
    a, b = dead(NEW7, g)[0], dead(OLD7, g)[0]
    L.append(f"R4: {g}: retuned 7l {a} {dead(NEW7, g)[2]} against 7l inh60 {b} {dead(OLD7, g)[2]}; held if more: {a > b}")
for g in G:
    a, b = dead(NEWA, g)[0], dead(NEW7, g)[0]
    L.append(f"R5: {g}: aware src_li {a} {dead(NEWA, g)[2]} against 7l src_li {b}; held if fewer: {a < b}")
for g in G:
    ma, m7 = np.mean([r["mass"] for r in rs(NEWA, g)]), np.mean([r["mass"] for r in rs(NEW7, g)])
    L.append(f"R6: {g}: aware src_li mass {ma:.3f} against 7l src_li {m7:.3f} kg ({100 * (ma / m7 - 1):+.1f}%); held if >= +5%: {ma >= 1.05 * m7}")
for g in G:
    a = np.median([r["J_45_1_cap"] for r in rs(NEW7, g)]); b = np.median([r["J_45_1_cap"] for r in rs(OLD7, g)])
    L.append(f"R7: {g}: lever-1 45 deg cap median J retuned 7l {a:+.3f} against 7l inh60 {b:+.3f}; |diff| {abs(a - b):.3f}; held if <= 0.10: {abs(a - b) <= 0.10}")
L += ["", "Other conditions, summed dead flights (label: per geometry above / below):"]
for k in ("20_2_cap", "45_2_base", "20_3_cap", "45_3_cap", "45_0_cap", "45_1_cap"):
    L.append(f"  {k}: " + "; ".join(f"{lab} {dead(lab, 'above', k)[0]} / {dead(lab, 'below', k)[0]}" for lab in
                                    ("7l t45 cap wide [inh60]", "aware cap wide [inh60]", OLD7S, OLDAS, NEW7, NEWA)))
open(os.path.join(HERE, "verdicts.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
