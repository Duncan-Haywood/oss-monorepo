"""Milestone 7s verdicts: predictions S0-S5 (../../LOG.md) checked against results.json and 7r's results.json. Writes verdicts.txt."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
R7 = json.load(open(os.path.join(HERE, "..", "m7r_retune", "results.json")))["runs"]
RUNS, KEYS = D["runs"], D["keys"]
LAWS = [tuple(l) for l in D["laws"]]
GEOMS = ("above", "below")
L1, AW, P1 = "7l src_li [src_li]", "aware src_li [src_li]", "7l t45 cap wide [inh60]"


def rs(s, g, law):
    return [r for r in RUNS if r["set"] == s and r["geom"] == g and tuple(r["law"]) == tuple(law)]


def l245(s, g, law):
    return sum(r["dead_45_2_cap"] for r in rs(s, g, law))


def name(law):
    return f"{law[0] * 1000:g} ms, b {law[1]:g}"


out = []
base = (0.015, 1.5)
diff = 0
for r in RUNS:
    if tuple(r["law"]) != base: continue
    o = next(q for q in R7 if q["label"] == r["set"] and q["geom"] == r["geom"] and q["seed"] == r["seed"])
    diff += sum(o[f"dead_{k}"] != r[f"dead_{k}"] for k in KEYS)
out.append(f"S0 (15 ms, b 1.5 reproduces 7r in 4 conditions x 72 designs): {'HELD' if diff == 0 else 'REFUTED'} ({diff} of {72 * len(KEYS)} counts differ)")

n1 = 0; det = []
for law in LAWS:
    ok = all(l245(AW, g, law) < l245(L1, g, law) for g in GEOMS)
    n1 += ok; det.append(f"{name(law)}: " + ", ".join(f"{g} {l245(AW, g, law)} vs {l245(L1, g, law)}" for g in GEOMS))
out.append(f"S1 (aware src_li < 7l src_li at L2-45 in both geometries under >= 8 of 9 laws): {'HELD' if n1 >= 8 else 'REFUTED'} ({n1} of 9)")
out += ["  " + d for d in det]


def spear(a, b):
    ra = np.argsort(np.argsort(a)); rb = np.argsort(np.argsort(b)); return float(np.corrcoef(ra, rb)[0, 1])


rho = {}
for law in LAWS:
    for g in GEOMS:
        x = [r for r in RUNS if tuple(r["law"]) == law and r["geom"] == g and (r["set"].endswith("[inh60]") or r["set"] in (L1, AW))]
        rho[law, g] = spear([r["mass"] for r in x], [r["dead_45_2_cap"] for r in x])
s2 = [law for law in LAWS if law[0] <= 0.015]
ok2 = all(rho[l, g] < 0 for l in s2 for g in GEOMS)
out.append(f"S2 (Spearman rho(mass, L2-45) < 0 in both geometries under the 6 laws with K <= 15 ms): {'HELD' if ok2 else 'REFUTED'} "
           f"(range {min(rho[l, g] for l in s2 for g in GEOMS):+.2f} to {max(rho[l, g] for l in s2 for g in GEOMS):+.2f}; at 30 ms "
           + ", ".join(f"{name(l)} {rho[l, 'above']:+.2f}/{rho[l, 'below']:+.2f}" for l in LAWS if l[0] > 0.015) + ")")

sets = sorted({r["set"] for r in RUNS})
n3 = 0
for g in GEOMS:
    for s in sets:
        c = [l245(s, g, (k, 1.5)) for k in (0.0075, 0.015, 0.030)]
        n3 += c[0] < c[1] < c[2]
out.append(f"S3 (b 1.5: L2-45 rises 7.5 -> 15 -> 30 ms in >= 10 of 12 set-geometries): {'HELD' if n3 >= 10 else 'REFUTED'} ({n3} of 12)")

ok4 = True; det = []
for g in GEOMS:
    dl = l245(L1, g, (0.015, 0.0)) - l245(L1, g, base); dp = l245(P1, g, (0.015, 0.0)) - l245(P1, g, base)
    ok4 &= dl > dp; det.append(f"{g}: 7l src_li {dl:+d}, published 7l {dp:+d}")
out.append(f"S4 (b 1.5 -> 0 at 15 ms raises 7l src_li's L2-45 more than published 7l's, both geometries): {'HELD' if ok4 else 'REFUTED'} ({'; '.join(det)})")

m = sum(r["margin_rho"] < 1 for g in GEOMS for r in rs(L1, g, (0.015, 0.0)))
ma = sum(r["margin_rho"] < 1 for g in GEOMS for r in rs(AW, g, (0.015, 0.0)))
out.append(f"S5 (b 0 at 15 ms: 7l src_li passes the margin test in <= 8 of 12): {'HELD' if m <= 8 else 'REFUTED'} ({m} of 12; aware src_li {ma} of 12, post hoc)")

out.append("")
out.append("Margin test passes (rho < 1) per law, of 12 designs per set (both geometries):")
for s in sets:
    out.append(f"  {s:>26}: " + ", ".join(f"{name(l)} {sum(r['margin_rho'] < 1 for g in GEOMS for r in rs(s, g, l))}" for l in LAWS))
open(os.path.join(HERE, "verdicts.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
