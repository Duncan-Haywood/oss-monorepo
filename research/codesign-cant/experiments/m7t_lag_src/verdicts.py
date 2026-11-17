"""Milestone 7t verdicts T1-T8 (predictions in ../../LOG.md), from results.json."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "results.json")))
runs = d["runs"]
GEOMS = ("above", "below")
TR, INH, SLOW = "train 36 ms D^0", "inherited 15 ms D^1.5", "id 39.1 ms D^0"
NEW = {"7l": "7l lag36", "aware": "aware lag36"}
OLD = {"7l": "7l src_li [src_li]", "aware": "aware src_li [src_li]"}


def sel(s, g, law):
    return [r for r in runs if r["set"] == s and r["geom"] == g and r["law_name"] == law]


def dead(s, g, law):
    return sum(r["dead_45_2_cap"] for r in sel(s, g, law))


def mean(s, g, k, law=INH):
    return float(np.mean([r[k] for r in sel(s, g, law)]))


L = []
n_ok = sum(r["margin_rho"] < 1 for a in NEW.values() for g in GEOMS for r in sel(a, g, TR))
L.append(f"T1 {'held' if n_ok >= 20 else 'refuted'}: {n_ok} of 24 new designs pass the margin test under the training law (need >= 20)")
c = [(a, g, dead(NEW[a], g, TR), dead(OLD[a], g, TR)) for a in NEW for g in GEOMS]
L.append(f"T2 {'held' if all(x[2] < x[3] for x in c) else 'refuted'}: new vs 7r retuned at 36 ms, L2-45: " + "; ".join(f"{a} {g} {n} vs {o}" for a, g, n, o in c))
c = [(a, g, dead(NEW[a], g, TR), dead(OLD[a], g, INH)) for a in NEW for g in GEOMS]
k = sum(x[2] > x[3] for x in c)
L.append(f"T3 {'held' if k >= 3 else 'refuted'} ({k} of 4): new at 36 ms vs 7r at its own 15 ms law: " + "; ".join(f"{a} {g} {n} vs {o}" for a, g, n, o in c))
c = [(g, dead(NEW["aware"], g, TR), dead(NEW["7l"], g, TR)) for g in GEOMS]
L.append(f"T4 {'held' if all(x[1] < x[2] for x in c) else 'refuted'}: aware lag36 vs 7l lag36 at 36 ms: " + "; ".join(f"{g} {a} vs {b}" for g, a, b in c))
c = [(g, mean(NEW["aware"], g, "mass") / mean(NEW["7l"], g, "mass") - 1) for g in GEOMS]
L.append(f"T5 {'held' if all(x[1] >= 0.05 for x in c) else 'refuted'}: aware mass over 7l mass: " + "; ".join(f"{g} {x * 100:+.1f}%" for g, x in c))
c = [(a, g, mean(NEW[a], g, "D")) for a in NEW for g in GEOMS]
L.append(f"T6 {'held' if all(x[2] >= 0.120 for x in c) else 'refuted'}: mean D of new designs: " + "; ".join(f"{a} {g} {x:.3f} m" for a, g, x in c)
         + " (7r: " + "; ".join(f"{a} {g} {mean(OLD[a], g, 'D'):.3f}" for a in OLD for g in GEOMS) + ")")
n_slow = sum(r["margin_rho"] < 1 for a in NEW.values() for g in GEOMS for r in sel(a, g, SLOW))
L.append(f"T7 {'held' if n_slow <= 12 else 'refuted'}: {n_slow} of 24 new designs pass the margin test at 39.1 ms (need <= 12)")
c = [(a, g, mean(NEW[a], g, "pos_kp"), mean(OLD[a], g, "pos_kp")) for a in NEW for g in GEOMS]
L.append(f"T8 {'held' if all(x[2] < x[3] for x in c) else 'refuted'}: mean position kp new vs 7r: " + "; ".join(f"{a} {g} {n:.2f} vs {o:.2f}" for a, g, n, o in c))
L.append("check: 7r retuned under the inherited law reproduce 7r's L2-45 counts (106, 131, 54, 64): "
         + ", ".join(str(dead(OLD[a], g, INH)) for a in OLD for g in GEOMS))
open(os.path.join(HERE, "verdicts.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
