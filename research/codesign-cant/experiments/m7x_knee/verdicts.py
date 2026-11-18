"""Milestone 7x verdicts X1-X7 (predictions in ../../LOG.md), from results.json."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
runs, train = R["runs"], R["train"]
GEOMS = ("above", "below")
ID = ("id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0")
FAST, SLOW, INH = ID[0], ID[2], "inherited 15 ms D^1.5"
L60 = "stress 60 ms D^0"
REJ45 = {"above": 0.12, "below": 0.11}   # 7w's lever-aware rejected shares (results.txt)


def sel(s, g, law):
    return sorted((r for r in runs if r["set"] == s and r["geom"] == g and r["law_name"] == law), key=lambda r: r["seed"])


def dead(s, g, law):
    return sum(r["dead_45_2_cap"] for r in sel(s, g, law))


def ident(s, g):
    return sum(dead(s, g, law) for law in ID)


def mean(s, g, k, law=SLOW):
    return float(np.mean([r[k] for r in sel(s, g, law)]))


def n_cert(s, laws=ID):
    return sum(all(r["margin_rho"] < 1 for law in laws for r in sel(s, g, law) if r["seed"] == seed) for g in GEOMS for seed in range(6))


def rej(s, g):
    t = [x["rejected"] for x in train if x["arm"] == s and x["geom"] == g]
    return float(np.mean(t)) / R["budget"]


L = []
c = [(g, dead("aware lag60", g, SLOW), dead("aware lag45", g, SLOW)) for g in GEOMS]
L.append(f"X1 {'held' if all(a > b for _, a, b in c) else 'refuted'}: L2-45 at 39.1 ms, lag60 > lag45 in both: " + "; ".join(f"{g} {a} vs {b}" for g, a, b in c))
c = [(g, ident("aware lag52", g), ident("aware lag45", g)) for g in GEOMS]
L.append(f"X2 {'held' if all(a <= b for _, a, b in c) else 'refuted'}: identified total, lag52 <= lag45 in both: " + "; ".join(f"{g} {a} vs {b}" for g, a, b in c))
c = [(g, dead("aware lag60", g, FAST), dead("aware lag45", g, FAST)) for g in GEOMS]
L.append(f"X3 {'held' if all(a > b for _, a, b in c) else 'refuted'}: L2-45 at 33 ms, lag60 > lag45 in both: " + "; ".join(f"{g} {a} vs {b}" for g, a, b in c))
n52, n60 = n_cert("aware lag52"), n_cert("aware lag60")
L.append(f"X4 {'held' if n52 >= 11 and n60 >= 11 else 'refuted'}: certified under all three identified laws: lag52 {n52}, lag60 {n60} of 12 (need >= 11 each; lag45 {n_cert('aware lag45')}, lag39 {n_cert('aware lag39')})")
c = [(g, rej("aware lag60", g), rej("aware lag52", g), REJ45[g]) for g in GEOMS]
L.append(f"X5 {'held' if all(a > b > d for _, a, b, d in c) else 'refuted'}: rejected share lag60 > lag52 > lag45: " + "; ".join(f"{g} {a:.2f} > {b:.2f} > {d:.2f}" for g, a, b, d in c))
c = [(g, mean("aware lag60", g, "mass"), mean("aware lag45", g, "mass")) for g in GEOMS]
L.append(f"X6 {'held' if all(a > b for _, a, b in c) else 'refuted'}: mean mass lag60 > lag45: " + "; ".join(f"{g} {a:.3f} vs {b:.3f} kg" for g, a, b in c))
c = [(g, dead("aware lag60", g, L60), dead("aware lag45", g, L60)) for g in GEOMS]
L.append(f"X7 {'held' if all(a < b for _, a, b in c) else 'refuted'}: L2-45 at 60 ms, lag60 < lag45: " + "; ".join(f"{g} {a} vs {b}" for g, a, b in c))
L.append("check: 7w's lag45 designs reproduce 7w's L2-45 (33 ms 27, 34; 39.1 ms 52, 46): "
         + ", ".join(str(dead("aware lag45", g, FAST)) for g in GEOMS) + "; " + ", ".join(str(dead("aware lag45", g, SLOW)) for g in GEOMS))
SETS = ("aware lag39", "aware lag45", "aware lag52", "aware lag60")
for law in R["laws"]:
    L.append(f"context: L2-45 under {law}, lag39 / lag45 / lag52 / lag60: " + "; ".join(
        f"{g} " + " / ".join(str(dead(s, g, law)) for s in SETS) for g in GEOMS))
L.append("context: identified total (33+36+39.1 ms), lag39 / lag45 / lag52 / lag60: " + "; ".join(f"{g} " + " / ".join(str(ident(s, g)) for s in SETS) for g in GEOMS))
L.append("context: margin passes per law (of 12), lag39 / lag45 / lag52 / lag60: " + "; ".join(
    f"{law.split(' D')[0]} " + " / ".join(str(sum(r['margin_rho'] < 1 for g in GEOMS for r in sel(s, g, law))) for s in SETS) for law in R["laws"]))
L.append("context: mean mass, D, pos kp: " + "; ".join(
    f"{s} {g} {mean(s, g, 'mass'):.3f} kg, {mean(s, g, 'D'):.3f} m, kp {mean(s, g, 'pos_kp'):.1f}" for s in SETS for g in GEOMS))
L.append("context: median J at lever 1, 45 deg under 36 ms: " + "; ".join(
    f"{s} {g} {np.median([r['J_45_1_cap'] for r in sel(s, g, ID[1])]):+.2f}" for s in SETS for g in GEOMS))
open(os.path.join(HERE, "verdicts.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
