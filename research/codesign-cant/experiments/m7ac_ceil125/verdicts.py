"""Milestone 7ac verdicts AC1-AC6 (predictions in ../../LOG.md), from results.json. Stress: L2-45 = diverged flights at lever 2,
45 deg, cap, summed over 6 seeds; identified total = L2-45 summed over the 33, 36 and 39.1 ms laws (of 1152). Response: median
over seeds of each design's median over 64 episodes at the 36 ms law; a rise time of 0 (never within 10 cm) counts as never."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
runs, resp, train = R["runs"], R["resp"], R["train"]
GEOMS = ("above", "below")
ID = ("id 33 ms D^0", "mid 36 ms D^0", "id 39.1 ms D^0")
MID, SLOW75 = ID[1], "stress 75 ms D^0"
B, C100, C125, C150, C200, S75 = ("aware lag39", "aware lag39c100", "aware lag39c125", "aware lag39c150", "aware lag39c200",
                                  "aware lag75")
SETS = (B, C100, C125, C150, C200, S75)


def sel(s, g, law):
    return sorted((r for r in runs if r["set"] == s and r["geom"] == g and r["law_name"] == law), key=lambda r: r["seed"])


def dead(s, g, law):
    return sum(r["dead_45_2_cap"] for r in sel(s, g, law))


def ident(s, g):
    return sum(dead(s, g, law) for law in ID)


def n_cert(s):
    return sum(all(r["margin_rho"] < 1 for law in ID for r in sel(s, g, law) if r["seed"] == seed) for g in GEOMS for seed in range(6))


def med(v):
    v = np.asarray(v, float)
    return float(np.nanmedian(v)) if np.isfinite(v).any() else float("nan")


def cens(r, key):
    v = np.asarray(r[key], float)
    return np.where(v == 0, np.inf, v) if key == "rise" else v


def rstat(s, g, test, key, law=MID):
    return med([med(cens(r, key)) for r in resp if r["set"] == s and r["geom"] == g and r["test"] == test and r["law_name"] == law])


def mass(s, g):
    return float(np.mean([r["mass"] for r in sel(s, g, MID)]))


def rej(s, g):
    t = [x["rejected"] for x in train if x["arm"] == s and x["geom"] == g]
    return np.mean(t) / R["budget"] if t else float("nan")


def short(s):
    return s.split()[1]


def between(a, lo, hi):
    return min(lo, hi) < a < max(lo, hi)


L = [" ".join(__doc__.split()), ""]
c = [(g, ident(C125, g), (ident(C100, g) + ident(C150, g)) / 2) for g in GEOMS]
L.append(f"AC1 {'held' if all(a <= b for _, a, b in c) else 'refuted'}: identified total lag39c125 <= midpoint(lag39c100, lag39c150): " + "; ".join(f"{g} {a} vs {b:.1f}" for g, a, b in c))
c = [(g, ident(C125, g), ident(C150, g) + 10) for g in GEOMS]
L.append(f"AC2 {'held' if all(a <= b for _, a, b in c) else 'refuted'}: identified total lag39c125 <= lag39c150 + 10: " + "; ".join(f"{g} {a} vs {b}" for g, a, b in c))
c = [(g, rstat(C125, g, "step", "rise"), rstat(C100, g, "step", "rise"), rstat(C150, g, "step", "rise")) for g in GEOMS]
L.append(f"AC3 {'held' if all(between(a, lo, hi) for _, a, lo, hi in c) else 'refuted'}: rise90 lag39c125 strictly between lag39c100 and lag39c150: "
         + "; ".join(f"{g} {a:.3f} vs ({lo:.3f}, {hi:.3f}) s" for g, a, lo, hi in c))
c = [(g, dead(C125, g, SLOW75), dead(C150, g, SLOW75), dead(C100, g, SLOW75)) for g in GEOMS]
L.append(f"AC4 {'held' if all(between(a, lo, hi) for _, a, lo, hi in c) else 'refuted'}: L2-45 at 75 ms lag39c125 strictly between lag39c150 and lag39c100: "
         + "; ".join(f"{g} {a} vs ({lo}, {hi})" for g, a, lo, hi in c))
n = n_cert(C125)
L.append(f"AC5 {'held' if n >= 11 else 'refuted'}: lag39c125 designs certified under all three identified laws: {n} of 12 (need >= 11)")
c = [(g, mass(C125, g), mass(C100, g), mass(C150, g)) for g in GEOMS]
L.append(f"AC6 {'held' if all(min(lo, hi) <= a <= max(lo, hi) for _, a, lo, hi in c) else 'refuted'}: mean mass lag39c125 between lag39c100 and lag39c150: "
         + "; ".join(f"{g} {a:.3f} vs ({lo:.3f}, {hi:.3f}) kg" for g, a, lo, hi in c))
L.append("")
L.append("check: old sets reproduce (7ab: identified lag39 170, 178; lag39c100 82, 109; lag39c150 27, 38; lag39c200 17, 36; lag75 29, 33): "
         + "; ".join(f"{short(s)} " + ", ".join(str(ident(s, g)) for g in GEOMS) for s in (B, C100, C150, C200, S75)))
L.append("check: responses reproduce (7ab: rise lag39 1.440, 1.387; lag39c100 1.471, 1.536; lag39c150 2.231, 1.757; lag39c200 2.022, 2.271; lag75 1.983, 1.860 s): "
         + "; ".join(f"{short(s)} " + ", ".join(f"{rstat(s, g, 'step', 'rise'):.3f}" for g in GEOMS) for s in (B, C100, C150, C200, S75)))
hdr = " / ".join(short(s) for s in SETS)
for law in R["laws"]:
    L.append(f"context: L2-45 under {law:>22}, {hdr}: " + "; ".join(f"{g} " + " / ".join(str(dead(s, g, law)) for s in SETS) for g in GEOMS))
L.append(f"context: identified total, {hdr}: " + "; ".join(f"{g} " + " / ".join(str(ident(s, g)) for s in SETS) for g in GEOMS))
L.append(f"context: margin passes under all three identified laws (of 12): " + ", ".join(f"{short(s)} {n_cert(s)}" for s in SETS))
L.append(f"context: rejected share lag39c125: " + ", ".join(f"{g} {rej(C125, g):.2f}" for g in GEOMS))
for s in SETS:
    for g in GEOMS:
        rs = sel(s, g, MID)
        L.append(f"context: {s} {g}: mass {mass(s, g):.3f} kg, D {np.mean([r['D'] for r in rs]):.3f} m, "
                 f"pos kp {np.mean([r['pos_kp'] for r in rs]):.1f}, J45_1 median {np.median([r['J_45_1_cap'] for r in rs]):+.3f}")
for s in SETS:
    for g in GEOMS:
        st = [np.median(np.where(np.isnan(np.asarray(r["settle"], float)), np.inf, np.asarray(r["settle"], float)))
              for r in resp if r["set"] == s and r["geom"] == g and r["test"] == "step" and r["law_name"] == MID]
        kp = sorted(r["pos_kp"] for r in resp if r["set"] == s and r["geom"] == g and r["test"] == "step" and r["law_name"] == MID)
        L.append(f"context: {s} {g} at 36 ms: settle (censored) {np.median(st):.3f} s; rise90 {rstat(s, g, 'step', 'rise'):.3f} s; "
                 f"overshoot {rstat(s, g, 'step', 'over') * 100:.1f} cm; wind6 peak {rstat(s, g, 'wind6', 'peak') * 100:.2f} cm; "
                 f"response pos kp median {np.median(kp):.1f}; dead {sum(r['dead'] for r in resp if r['set'] == s and r['geom'] == g)}")
open(os.path.join(HERE, "verdicts.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
