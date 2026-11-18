"""Milestone 7u verdicts U1-U8 (predictions in ../../LOG.md), from results.json."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "results.json")))
runs = d["runs"]
GEOMS = ("above", "below")
ID = ("id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0")
MID, SLOW, STRESS = ID[1], ID[2], "stress 45 ms D^0"
NEW = {"7l": "7l lag39", "aware": "aware lag39"}
OLD = {"7l": "7l lag36", "aware": "aware lag36"}


def sel(s, g, law):
    return sorted((r for r in runs if r["set"] == s and r["geom"] == g and r["law_name"] == law), key=lambda r: r["seed"])


def dead(s, g, law):
    return sum(r["dead_45_2_cap"] for r in sel(s, g, law))


def mean(s, g, k, law=SLOW):
    return float(np.mean([r[k] for r in sel(s, g, law)]))


def n_cert(sets, laws):
    """Designs (set, geom, seed) passing the margin test under every law in laws."""
    n = 0
    for s in sets:
        for g in GEOMS:
            for seed in range(6):
                n += all(r["margin_rho"] < 1 for law in laws for r in sel(s, g, law) if r["seed"] == seed)
    return n


L = []
n = sum(r["margin_rho"] < 1 for a in NEW.values() for g in GEOMS for r in sel(a, g, SLOW))
L.append(f"U1 {'held' if n >= 22 else 'refuted'}: {n} of 24 lag39 designs pass the margin test at 39.1 ms (need >= 22)")
c = [(a, g, dead(NEW[a], g, SLOW), dead(OLD[a], g, SLOW)) for a in NEW for g in GEOMS]
k = sum(x[2] < x[3] for x in c)
L.append(f"U2 {'held' if k >= 3 else 'refuted'} ({k} of 4): L2-45 at 39.1 ms, lag39 vs lag36: " + "; ".join(f"{a} {g} {x} vs {y}" for a, g, x, y in c))
c = [(a, g, dead(NEW[a], g, MID), dead(OLD[a], g, MID)) for a in NEW for g in GEOMS]
k = sum(x[2] <= 1.15 * x[3] for x in c)
L.append(f"U3 {'held' if k >= 3 else 'refuted'} ({k} of 4): L2-45 at 36 ms, lag39 vs 1.15 x lag36: " + "; ".join(f"{a} {g} {x} vs {y} (x{x / max(y, 1):.2f})" for a, g, x, y in c))
c = [(a, g, max(dead(NEW[a], g, law) for law in ID), max(dead(OLD[a], g, law) for law in ID)) for a in NEW for g in GEOMS]
k = sum(x[2] < x[3] for x in c)
L.append(f"U4 {'held' if k >= 3 else 'refuted'} ({k} of 4): worst identified L2-45, lag39 vs lag36: " + "; ".join(f"{a} {g} {x} vs {y}" for a, g, x, y in c))
nn, no = n_cert(NEW.values(), ID), n_cert(OLD.values(), ID)
L.append(f"U5 {'held' if nn >= 22 and no <= 21 else 'refuted'}: certified under all three identified laws: lag39 {nn} of 24 (need >= 22), lag36 {no} of 24 (need <= 21)")
ns = sum(r["margin_rho"] < 1 for a in NEW.values() for g in GEOMS for r in sel(a, g, STRESS))
os_ = sum(r["margin_rho"] < 1 for a in OLD.values() for g in GEOMS for r in sel(a, g, STRESS))
c = [(a, g, dead(NEW[a], g, STRESS), dead(OLD[a], g, STRESS)) for a in NEW for g in GEOMS]
L.append(f"U6 {'held' if ns >= 12 and all(x[2] < x[3] for x in c) else 'refuted'}: at 45 ms lag39 certified {ns} of 24 (lag36 {os_}); L2-45 lag39 vs lag36: "
         + "; ".join(f"{a} {g} {x} vs {y}" for a, g, x, y in c))
c = [(g, dead(NEW["aware"], g, SLOW), dead(NEW["7l"], g, SLOW), mean(NEW["aware"], g, "mass") / mean(NEW["7l"], g, "mass") - 1) for g in GEOMS]
L.append(f"U7 {'held' if all(x[1] < x[2] and x[3] >= 0.05 for x in c) else 'refuted'}: aware lag39 vs 7l lag39 at 39.1 ms: "
         + "; ".join(f"{g} L2-45 {a} vs {b}, mass {m * 100:+.1f}%" for g, a, b, m in c))
c = [(a, g, mean(NEW[a], g, "pos_kp"), mean(OLD[a], g, "pos_kp")) for a in NEW for g in GEOMS]
L.append(f"U8 {'held' if all(x[2] < x[3] for x in c) else 'refuted'}: mean position kp lag39 vs lag36: " + "; ".join(f"{a} {g} {x:.2f} vs {y:.2f}" for a, g, x, y in c))
L.append("check: 7t's designs at 36 ms and 39.1 ms reproduce 7t's L2-45 counts (36 ms: 149, 161, 63, 82; 39.1 ms: 198, 195, 93, 117): "
         + ", ".join(str(dead(OLD[a], g, MID)) for a in OLD for g in GEOMS) + "; " + ", ".join(str(dead(OLD[a], g, SLOW)) for a in OLD for g in GEOMS))
L.append("context: mean mass / D lag39 vs lag36: " + "; ".join(f"{a} {g} {mean(NEW[a], g, 'mass'):.3f} vs {mean(OLD[a], g, 'mass'):.3f} kg, "
         f"{mean(NEW[a], g, 'D'):.3f} vs {mean(OLD[a], g, 'D'):.3f} m" for a in NEW for g in GEOMS))
L.append("context: median J at lever 1, 45 deg under the 36 ms law, lag39 vs lag36: " + "; ".join(
    f"{a} {g} {np.median([r['J_45_1_cap'] for r in sel(NEW[a], g, MID)]):+.2f} vs {np.median([r['J_45_1_cap'] for r in sel(OLD[a], g, MID)]):+.2f}" for a in NEW for g in GEOMS))
open(os.path.join(HERE, "verdicts.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
