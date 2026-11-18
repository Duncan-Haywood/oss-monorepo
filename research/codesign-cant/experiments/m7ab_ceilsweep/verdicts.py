"""Milestone 7ab verdicts AB1-AB7 (predictions in ../../LOG.md), from results.json. Stress: L2-45 = diverged flights at lever 2,
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
B, C100, C150, C200, S75 = "aware lag39", "aware lag39c100", "aware lag39c150", "aware lag39c200", "aware lag75"
SETS = (B, C100, C150, C200, S75)
NEW = (C100, C200)


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


def rej(s, g):
    t = [x["rejected"] for x in train if x["arm"] == s and x["geom"] == g]
    return np.mean(t) / R["budget"] if t else float("nan")


def slow(s):
    # the response test's position kp (the field 7aa's slow-tail figures 5.0 and 6.2 came from), not the stress run's pos_kp,
    # which is a different quantity (see LOG 7ab; the first version of this script read the stress field by mistake)
    return sum(r["pos_kp"] < 8 for r in resp if r["set"] == s and r["test"] == "step" and r["law_name"] == MID)


def short(s):
    return s.split()[1]


L = [" ".join(__doc__.split()), ""]
c = [(g, ident(C100, g), (ident(B, g) + ident(C150, g)) / 2) for g in GEOMS]
L.append(f"AB1 {'held' if all(a <= b for _, a, b in c) else 'refuted'}: identified total lag39c100 <= midpoint(lag39, lag39c150): " + "; ".join(f"{g} {a} vs {b:.1f}" for g, a, b in c))
c = [(g, ident(C100, g), ident(C150, g) + 10) for g in GEOMS]
L.append(f"AB2 {'held' if all(a <= b for _, a, b in c) else 'refuted'}: identified total lag39c100 <= lag39c150 + 10: " + "; ".join(f"{g} {a} vs {b}" for g, a, b in c))
c = [(g, dead(C200, g, SLOW75), dead(C150, g, SLOW75)) for g in GEOMS]
L.append(f"AB3 {'held' if all(a < b for _, a, b in c) else 'refuted'}: L2-45 at 75 ms lag39c200 < lag39c150: " + "; ".join(f"{g} {a} vs {b}" for g, a, b in c))
c = [(g, ident(C200, g), ident(C150, g)) for g in GEOMS]
L.append(f"AB4 {'held' if all(a > b for _, a, b in c) else 'refuted'}: identified total lag39c200 > lag39c150: " + "; ".join(f"{g} {a} vs {b}" for g, a, b in c))
c = [(g, rstat(C100, g, "step", "rise"), rstat(C200, g, "step", "rise")) for g in GEOMS]
L.append(f"AB5 {'held' if all(a < b for _, a, b in c) else 'refuted'}: rise90 lag39c100 < lag39c200: " + "; ".join(f"{g} {a:.3f} vs {b:.3f} s" for g, a, b in c))
n = n_cert(C100) + n_cert(C200)
L.append(f"AB6 {'held' if n >= 22 else 'refuted'}: new designs certified under all three identified laws: {n} of 24 (need >= 22; lag39c100 {n_cert(C100)}, lag39c200 {n_cert(C200)})")
L.append(f"AB7 {'held' if slow(C200) > slow(C100) else 'refuted'}: designs with position kp < 8, lag39c200 > lag39c100: {slow(C200)} vs {slow(C100)} (lag39c150 {slow(C150)})")
L.append("")
L.append("check: old sets reproduce (7aa: identified lag39 170, 178; lag39c150 27, 38; lag75 29, 33): "
         + "; ".join(f"{short(s)} " + ", ".join(str(ident(s, g)) for g in GEOMS) for s in (B, C150, S75)))
L.append("check: responses reproduce (7aa: rise lag39 1.440, 1.387; lag39c150 2.231, 1.757; lag75 1.983, 1.860 s): "
         + "; ".join(f"{short(s)} " + ", ".join(f"{rstat(s, g, 'step', 'rise'):.3f}" for g in GEOMS) for s in (B, C150, S75)))
hdr = " / ".join(short(s) for s in SETS)
for law in R["laws"]:
    L.append(f"context: L2-45 under {law:>22}, {hdr}: " + "; ".join(f"{g} " + " / ".join(str(dead(s, g, law)) for s in SETS) for g in GEOMS))
L.append(f"context: identified total, {hdr}: " + "; ".join(f"{g} " + " / ".join(str(ident(s, g)) for s in SETS) for g in GEOMS))
L.append(f"context: margin passes under all three identified laws (of 12): " + ", ".join(f"{short(s)} {n_cert(s)}" for s in SETS))
L.append(f"context: designs with position kp < 8 (of 12): " + ", ".join(f"{short(s)} {slow(s)}" for s in SETS))
for s in SETS:
    for g in GEOMS:
        rs = sel(s, g, MID)
        L.append(f"context: {s} {g}: mass {np.mean([r['mass'] for r in rs]):.3f} kg, D {np.mean([r['D'] for r in rs]):.3f} m, "
                 f"pos kp {np.mean([r['pos_kp'] for r in rs]):.1f} ({', '.join(f'{r['pos_kp']:.1f}' for r in rs)}), "
                 f"J45_1 median {np.median([r['J_45_1_cap'] for r in rs]):+.3f}" + (f", rejected {rej(s, g):.2f}" if s in NEW else ""))
for s in SETS:
    for g in GEOMS:
        st = [np.median(np.where(np.isnan(np.asarray(r["settle"], float)), np.inf, np.asarray(r["settle"], float)))
              for r in resp if r["set"] == s and r["geom"] == g and r["test"] == "step" and r["law_name"] == MID]
        L.append(f"context: {s} {g} at 36 ms: settle (censored) {np.median(st):.3f} s; rise90 {rstat(s, g, 'step', 'rise'):.3f} s; "
                 f"overshoot {rstat(s, g, 'step', 'over') * 100:.1f} cm; wind6 peak {rstat(s, g, 'wind6', 'peak') * 100:.2f} cm; "
                 f"wind3 peak {rstat(s, g, 'wind3', 'peak') * 100:.2f} cm; dead {sum(r['dead'] for r in resp if r['set'] == s and r['geom'] == g)}")
open(os.path.join(HERE, "verdicts.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
