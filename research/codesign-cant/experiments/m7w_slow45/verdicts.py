"""Milestone 7w verdicts W1-W7 (predictions in ../../LOG.md), from results.json."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
runs = json.load(open(os.path.join(HERE, "results.json")))["runs"]
GEOMS = ("above", "below")
ID = ("id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0")
FAST, MID, SLOW, STRESS, INH = ID[0], ID[1], ID[2], "stress 45 ms D^0", "inherited 15 ms D^1.5"
NEW = {"7l": "7l lag45", "aware": "aware lag45"}
OLD = {"7l": "7l lag39", "aware": "aware lag39"}
MIDS = {"7l": "7l lag36", "aware": "aware lag36"}


def sel(s, g, law):
    return sorted((r for r in runs if r["set"] == s and r["geom"] == g and r["law_name"] == law), key=lambda r: r["seed"])


def dead(s, g, law):
    return sum(r["dead_45_2_cap"] for r in sel(s, g, law))


def mean(s, g, k, law=SLOW):
    return float(np.mean([r[k] for r in sel(s, g, law)]))


def n_cert(sets, laws):
    return sum(all(r["margin_rho"] < 1 for law in laws for r in sel(s, g, law) if r["seed"] == seed)
               for s in sets for g in GEOMS for seed in range(6))


def n_pass(sets, law):
    return sum(r["margin_rho"] < 1 for s in sets for g in GEOMS for r in sel(s, g, law))


def cells(law, a=NEW, b=OLD):
    return [(k, g, dead(a[k], g, law), dead(b[k], g, law)) for k in a for g in GEOMS]


fmt = lambda c: "; ".join(f"{a} {g} {x} vs {y}" for a, g, x, y in c)
L = []
c = cells(FAST); k = sum(x > y for _, _, x, y in c)
L.append(f"W1 {'held' if k >= 3 else 'refuted'} ({k} of 4): L2-45 at 33 ms, lag45 > lag39: " + fmt(c))
c = cells(SLOW); k = sum(x <= y for _, _, x, y in c)
L.append(f"W2 {'held' if k >= 3 else 'refuted'} ({k} of 4): L2-45 at 39.1 ms, lag45 <= lag39: " + fmt(c))
c = cells(STRESS); k = sum(x < y for _, _, x, y in c)
L.append(f"W3 {'held' if k >= 3 else 'refuted'} ({k} of 4): L2-45 at 45 ms, lag45 < lag39: " + fmt(c))
n = n_cert(NEW.values(), ID)
L.append(f"W4 {'held' if n <= 21 else 'refuted'}: {n} of 24 lag45 designs pass the margin test under all three identified laws (need <= 21; lag39 {n_cert(OLD.values(), ID)})")
n = n_pass(NEW.values(), STRESS)
L.append(f"W5 {'held' if n >= 22 else 'refuted'}: at 45 ms lag45 certified {n} of 24 (need >= 22; lag39 {n_pass(OLD.values(), STRESS)})")
n = n_pass(NEW.values(), INH)
L.append(f"W6 {'held' if n <= 17 else 'refuted'}: under the inherited 15 ms law lag45 certified {n} of 24 (need <= 17; lag39 {n_pass(OLD.values(), INH)})")
c = [(g, dead(NEW["aware"], g, SLOW), dead(NEW["7l"], g, SLOW), mean(NEW["aware"], g, "mass") / mean(NEW["7l"], g, "mass") - 1) for g in GEOMS]
L.append(f"W7 {'held' if all(x[1] < x[2] and x[3] >= 0.05 for x in c) else 'refuted'}: aware lag45 vs 7l lag45 at 39.1 ms: "
         + "; ".join(f"{g} L2-45 {a} vs {b}, mass {m * 100:+.1f}%" for g, a, b, m in c))
L.append("check: 7u's lag39 designs reproduce 7u's L2-45 counts (33 ms 80, 107, 37, 46; 39.1 ms 150, 167, 72, 73): "
         + ", ".join(str(dead(OLD[a], g, FAST)) for a in OLD for g in GEOMS) + "; " + ", ".join(str(dead(OLD[a], g, SLOW)) for a in OLD for g in GEOMS))
for law in (INH,) + ID + (STRESS,):
    L.append(f"context: L2-45 under {law}, lag45 / lag39 / lag36: " + "; ".join(
        f"{a} {g} {dead(NEW[a], g, law)} / {dead(OLD[a], g, law)} / {dead(MIDS[a], g, law)}" for a in NEW for g in GEOMS))
L.append("context: margin passes per law, lag45 / lag39 / lag36 (of 24): " + "; ".join(
    f"{law.split(' D')[0]} {n_pass(NEW.values(), law)} / {n_pass(OLD.values(), law)} / {n_pass(MIDS.values(), law)}" for law in (INH,) + ID + (STRESS,)))
L.append("context: mean mass, D, pos kp lag45 vs lag39: " + "; ".join(
    f"{a} {g} {mean(NEW[a], g, 'mass'):.3f} vs {mean(OLD[a], g, 'mass'):.3f} kg, {mean(NEW[a], g, 'D'):.3f} vs {mean(OLD[a], g, 'D'):.3f} m, "
    f"kp {mean(NEW[a], g, 'pos_kp'):.1f} vs {mean(OLD[a], g, 'pos_kp'):.1f}" for a in NEW for g in GEOMS))
L.append("context: median J at lever 1, 45 deg under 36 ms, lag45 vs lag39: " + "; ".join(
    f"{a} {g} {np.median([r['J_45_1_cap'] for r in sel(NEW[a], g, MID)]):+.2f} vs {np.median([r['J_45_1_cap'] for r in sel(OLD[a], g, MID)]):+.2f}" for a in NEW for g in GEOMS))
open(os.path.join(HERE, "verdicts.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
