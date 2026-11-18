"""Milestone 7z verdicts Z1-Z7 (predictions in ../../LOG.md), from results.json. Stress: L2-45 = diverged flights at lever 2,
45 deg, cap, summed over 6 seeds. Response: median over seeds of each design's median over 64 episodes at the 36 ms law
(the identified laws give the same response to three decimals, 7y). A rise time of 0 (never within 10 cm of the
hold point) counts as never (+inf)."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
runs, resp, train = R["runs"], R["resp"], R["train"]
GEOMS = ("above", "below")
ID = ("id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0")
FAST, MID = ID[0], ID[1]
SETS = ("aware lag45", "aware lag52", "aware lag60", "aware lag75")
N, O = "aware lag75", "aware lag60"
X7 = {"identified": {"above": 36, "below": 51}, "fast": {"above": 8, "below": 12}, "mass": {"above": 1.508, "below": 1.474}}
Y7 = {"rise": {"above": 1.737, "below": 1.771}, "over": {"above": 0.032, "below": 0.027}}   # 7y results.txt, 36 ms


def sel(s, g, law):
    return sorted((r for r in runs if r["set"] == s and r["geom"] == g and r["law_name"] == law), key=lambda r: r["seed"])


def dead(s, g, law):
    return sum(r["dead_45_2_cap"] for r in sel(s, g, law))


def ident(s, g):
    return sum(dead(s, g, law) for law in ID)


def n_cert(s):
    return sum(all(r["margin_rho"] < 1 for law in ID for r in sel(s, g, law) if r["seed"] == seed) for g in GEOMS for seed in range(6))


def mass(s, g):
    return float(np.mean([r["mass"] for r in sel(s, g, MID)]))


def med(v):
    v = np.asarray(v, float)
    return float(np.nanmedian(v)) if np.isfinite(v).any() else float("nan")


def cens(r, key):
    """7y's rise is argmax of 'within 10 cm', so a flight that never gets there reads 0 s; count it as never (+inf)."""
    v = np.asarray(r[key], float)
    return np.where(v == 0, np.inf, v) if key == "rise" else v


def rstat(s, g, test, key, law=MID):
    return med([med(cens(r, key)) for r in resp if r["set"] == s and r["geom"] == g and r["test"] == test and r["law_name"] == law])


L = [" ".join(__doc__.split()), ""]
c = [(g, ident(N, g), ident(O, g)) for g in GEOMS]
L.append(f"Z1 {'held' if all(a < b for _, a, b in c) else 'refuted'}: identified total lag75 < lag60: " + "; ".join(f"{g} {a} vs {b}" for g, a, b in c))
c = [(g, dead(N, g, FAST), dead(O, g, FAST)) for g in GEOMS]
L.append(f"Z2 {'held' if all(a > b for _, a, b in c) else 'refuted'}: L2-45 at 33 ms lag75 > lag60 in both: " + "; ".join(f"{g} {a} vs {b}" for g, a, b in c))
n = n_cert(N)
L.append(f"Z3 {'held' if n >= 11 else 'refuted'}: lag75 certified under all three identified laws: {n} of 12 (need >= 11; lag60 {n_cert(O)})")
c = [(g, mass(N, g), mass(O, g)) for g in GEOMS]
L.append(f"Z4 {'held' if all(a > b for _, a, b in c) else 'refuted'}: mean mass lag75 > lag60: " + "; ".join(f"{g} {a:.3f} vs {b:.3f} kg" for g, a, b in c))
c = [(g, rstat(N, g, "step", "rise"), rstat(O, g, "step", "rise")) for g in GEOMS]
L.append(f"Z5 {'held' if all(a > b for _, a, b in c) else 'refuted'}: rise90 lag75 > lag60: " + "; ".join(f"{g} {a:.3f} vs {b:.3f} s" for g, a, b in c))
L.append(f"Z6 {'held' if all(a <= 1.15 * b for _, a, b in c) else 'refuted'}: rise90 lag75 <= 1.15 x lag60: ratios " + ", ".join(f"{g} {a / b:.3f}" for g, a, b in c))
c = [(g, rstat(N, g, "step", "over"), rstat(O, g, "step", "over")) for g in GEOMS]
L.append(f"Z7 {'held' if all(a <= b for _, a, b in c) else 'refuted'}: overshoot lag75 <= lag60: " + "; ".join(f"{g} {a * 100:.1f} vs {b * 100:.1f} cm" for g, a, b in c))
L.append("")
L.append("check: 7x's lag60 reproduces 7x (identified 36, 51; 33 ms 8, 12): " + ", ".join(str(ident(O, g)) for g in GEOMS) + "; "
         + ", ".join(str(dead(O, g, FAST)) for g in GEOMS))
L.append("check: lag60 response reproduces 7y (rise 1.737, 1.771 s; overshoot 3.2, 2.7 cm): "
         + ", ".join(f"{rstat(O, g, 'step', 'rise'):.3f}" for g in GEOMS) + "; " + ", ".join(f"{rstat(O, g, 'step', 'over') * 100:.1f}" for g in GEOMS))
for law in R["laws"]:
    L.append(f"context: L2-45 under {law}, lag45 / lag52 / lag60 / lag75: " + "; ".join(f"{g} " + " / ".join(str(dead(s, g, law)) for s in SETS) for g in GEOMS))
L.append("context: identified total, lag45 / lag52 / lag60 / lag75: " + "; ".join(f"{g} " + " / ".join(str(ident(s, g)) for s in SETS) for g in GEOMS))
L.append("context: margin passes under all three identified laws (of 12): " + ", ".join(f"{s.split()[1]} {n_cert(s)}" for s in SETS))
for s in SETS:
    for g in GEOMS:
        rs = sel(s, g, MID)
        t = [x["rejected"] for x in train if x["arm"] == s and x["geom"] == g]
        L.append(f"context: {s} {g}: mass {mass(s, g):.3f} kg, D {np.mean([r['D'] for r in rs]):.3f} m, pos kp {np.mean([r['pos_kp'] for r in rs]):.1f}, "
                 f"J45_1 median {np.median([r['J_45_1_cap'] for r in rs]):+.3f}" + (f", rejected {np.mean(t) / R['budget']:.2f}" if t else ""))
for s in (O, N):
    for g in GEOMS:
        st = [np.median(np.where(np.isnan(np.asarray(r["settle"], float)), np.inf, np.asarray(r["settle"], float)))
              for r in resp if r["set"] == s and r["geom"] == g and r["test"] == "step" and r["law_name"] == MID]
        L.append(f"context: {s} {g} at 36 ms: settle (censored) {np.median(st):.3f} s; rise90 {rstat(s, g, 'step', 'rise'):.3f} s; "
                 f"overshoot {rstat(s, g, 'step', 'over') * 100:.1f} cm; wind6 peak {rstat(s, g, 'wind6', 'peak') * 100:.2f} cm; "
                 f"wind3 peak {rstat(s, g, 'wind3', 'peak') * 100:.2f} cm; dead {sum(r['dead'] for r in resp if r['set'] == s and r['geom'] == g)}")
open(os.path.join(HERE, "verdicts.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
