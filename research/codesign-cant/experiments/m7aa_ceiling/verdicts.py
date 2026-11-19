"""Milestone 7aa verdicts AA1-AA6 (predictions in ../../LOG.md), from results.json. Stress: L2-45 = diverged flights at lever 2,
45 deg, cap, summed over 6 seeds. Response: median over seeds of each design's median over 64 episodes at the 36 ms law (7y:
the identified laws give the same response to three decimals). A rise time of 0 (never within 10 cm) counts as never."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
runs, resp, train = R["runs"], R["resp"], R["train"]
GEOMS = ("above", "below")
ID = ("id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0")
FAST, MID, SLOW75 = ID[0], ID[1], "stress 75 ms D^0"
SETS = ("aware lag39", "aware lag39c150", "aware lag60", "aware lag75")
N, B, S60, S75 = "aware lag39c150", "aware lag39", "aware lag60", "aware lag75"


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
    v = np.asarray(r[key], float)
    return np.where(v == 0, np.inf, v) if key == "rise" else v


def rstat(s, g, test, key, law=MID):
    return med([med(cens(r, key)) for r in resp if r["set"] == s and r["geom"] == g and r["test"] == test and r["law_name"] == law])


def rej(s, g):
    t = [x["rejected"] for x in train if x["arm"] == s and x["geom"] == g]
    return np.mean(t) / R["budget"] if t else float("nan")


REJ75 = {"above": 0.15, "below": 0.16}   # 7z results.txt
L = [" ".join(__doc__.split()), ""]
c = [(g, ident(N, g), (ident(B, g) + ident(S75, g)) / 2) for g in GEOMS]
L.append(f"AA1 {'held' if all(a <= b for _, a, b in c) else 'refuted'}: identified total lag39c150 <= midpoint(lag39, lag75): " + "; ".join(f"{g} {a} vs {b:.1f}" for g, a, b in c))
c = [(g, ident(N, g), ident(S60, g)) for g in GEOMS]
L.append(f"AA2 {'held' if all(a <= b for _, a, b in c) else 'refuted'}: identified total lag39c150 <= lag60: " + "; ".join(f"{g} {a} vs {b}" for g, a, b in c))
c = [(g, dead(N, g, SLOW75), dead(S75, g, SLOW75)) for g in GEOMS]
L.append(f"AA3 {'held' if all(a > b for _, a, b in c) else 'refuted'}: L2-45 at 75 ms lag39c150 > lag75: " + "; ".join(f"{g} {a} vs {b}" for g, a, b in c))
n = n_cert(N)
L.append(f"AA4 {'held' if n >= 11 else 'refuted'}: lag39c150 certified under all three identified laws: {n} of 12 (need >= 11)")
c = [(g, rstat(N, g, "step", "rise"), rstat(S75, g, "step", "rise")) for g in GEOMS]
L.append(f"AA5 {'held' if all(a < b for _, a, b in c) else 'refuted'}: rise90 lag39c150 < lag75: " + "; ".join(f"{g} {a:.3f} vs {b:.3f} s" for g, a, b in c))
c = [(g, rej(N, g), REJ75[g]) for g in GEOMS]
L.append(f"AA6 {'held' if all(a > b for _, a, b in c) else 'refuted'}: rejected share lag39c150 > lag75: " + "; ".join(f"{g} {a:.3f} vs {b:.2f}" for g, a, b in c))
L.append("")
L.append("check: old sets reproduce (7x lag39 identified 170, 178; 7z lag60 36, 51; lag75 29, 33): "
         + "; ".join(f"{s.split()[1]} " + ", ".join(str(ident(s, g)) for g in GEOMS) for s in (B, S60, S75)))
L.append("check: responses reproduce (7y lag39 rise 1.44, 1.39 s; 7z lag75 1.98, 1.86 s): "
         + "; ".join(f"{s.split()[1]} " + ", ".join(f"{rstat(s, g, 'step', 'rise'):.3f}" for g in GEOMS) for s in (B, S75)))
for law in R["laws"]:
    L.append(f"context: L2-45 under {law:>22}, lag39 / lag39c150 / lag60 / lag75: " + "; ".join(f"{g} " + " / ".join(str(dead(s, g, law)) for s in SETS) for g in GEOMS))
L.append("context: identified total, lag39 / lag39c150 / lag60 / lag75: " + "; ".join(f"{g} " + " / ".join(str(ident(s, g)) for s in SETS) for g in GEOMS))
L.append("context: margin passes under all three identified laws (of 12): " + ", ".join(f"{s.split()[1]} {n_cert(s)}" for s in SETS))
for s in SETS:
    for g in GEOMS:
        rs = sel(s, g, MID)
        L.append(f"context: {s} {g}: mass {mass(s, g):.3f} kg, D {np.mean([r['D'] for r in rs]):.3f} m, pos kp {np.mean([r['pos_kp'] for r in rs]):.1f}, "
                 f"J45_1 median {np.median([r['J_45_1_cap'] for r in rs]):+.3f}" + (f", rejected {rej(s, g):.2f}" if s == N else ""))
for s in (B, N, S75):
    for g in GEOMS:
        st = [np.median(np.where(np.isnan(np.asarray(r["settle"], float)), np.inf, np.asarray(r["settle"], float)))
              for r in resp if r["set"] == s and r["geom"] == g and r["test"] == "step" and r["law_name"] == MID]
        L.append(f"context: {s} {g} at 36 ms: settle (censored) {np.median(st):.3f} s; rise90 {rstat(s, g, 'step', 'rise'):.3f} s; "
                 f"overshoot {rstat(s, g, 'step', 'over') * 100:.1f} cm; wind6 peak {rstat(s, g, 'wind6', 'peak') * 100:.2f} cm; "
                 f"wind3 peak {rstat(s, g, 'wind3', 'peak') * 100:.2f} cm; dead {sum(r['dead'] for r in resp if r['set'] == s and r['geom'] == g)}")
open(os.path.join(HERE, "verdicts.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
