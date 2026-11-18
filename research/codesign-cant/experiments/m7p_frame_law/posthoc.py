"""Milestone 7p, post hoc (not predicted): on a fixed tune, does lever-2 robustness track the arm or the mass?

The three anchored laws give the same design, at the same arm, three different masses, so arm and mass separate. Per set and
geometry, over every valid (design, L, law) point with law in inh/fam/xb: OLS of the per-design L2-45 count (of 64) on L (mm) and
mass (100 g units) with one intercept per design; points over 5 kg (the runaway closure) are left out. Also: at a fixed arm, the per-design count difference between the heavier and the
lighter law. Writes posthoc.txt."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, os.environ.get("RESULTS", "results.json"))))["runs"]
LAWS = ("inh", "fam", "xb")
lines = [__doc__.splitlines()[0], "", "set, geometry: n points; coefficient on arm (flights per mm), on mass (flights per 100 g), each with a 95% interval (design-cluster bootstrap)"]
rng = np.random.default_rng(1)


def fit(pts):
    des = sorted({p[0] for p in pts}); idx = {d: i for i, d in enumerate(des)}
    X = np.zeros((len(pts), 2 + len(des))); y = np.zeros(len(pts))
    for k, (d, L, m, c) in enumerate(pts):
        X[k, 0], X[k, 1], X[k, 2 + idx[d]], y[k] = L * 1000, m * 10, 1, c
    b = np.linalg.lstsq(X, y, rcond=None)[0]
    return b[:2]


for lab in ("7e", "7l t45 cap wide", "aware cap wide", "aware cap wide fixL"):
    for g in ("above", "below"):
        pts = []
        for r in R:
            if r["label"] != lab or r["geom"] != g: continue
            for law in LAWS:
                for j, L in enumerate(r["L"][:-1]):
                    if r[f"{law}_rho"][j] < 1.0 and r[f"{law}_feasible"][j] and r[f"{law}_mass"][j] < 5.0:
                        pts.append((r["seed"], L, r[f"{law}_mass"][j], r[f"dead_{law}_45_2"][j]))
        b = fit(pts)
        seeds = sorted({p[0] for p in pts}); bs = []
        for _ in range(1000):
            pick = rng.choice(seeds, len(seeds)); sub = []
            for k, s in enumerate(pick):
                sub += [(k,) + p[1:] for p in pts if p[0] == s]
            bs.append(fit(sub))
        bs = np.array(bs)
        lines.append(f"  {lab:20s} {g:5s} n {len(pts):3d}: arm {b[0]:+.2f} ({np.percentile(bs[:, 0], 2.5):+.2f} to {np.percentile(bs[:, 0], 97.5):+.2f}); "
                     f"mass {b[1]:+.2f} ({np.percentile(bs[:, 1], 2.5):+.2f} to {np.percentile(bs[:, 1], 97.5):+.2f})")
lines += ["", "Same design, same arm, heavier law minus lighter law (inh vs fam), points valid under both: count of designs-points with fewer / equal / more crashes when heavier"]
for lab in ("7e", "7l t45 cap wide", "aware cap wide", "aware cap wide fixL"):
    fewer = eq = more = 0; dm = []
    for r in R:
        if r["label"] != lab: continue
        for j, L in enumerate(r["L"][:-1]):
            if L <= r["L0"] + 1e-9: continue
            if all(r[f"{w}_rho"][j] < 1.0 and r[f"{w}_feasible"][j] for w in ("inh", "fam")):
                d = r["dead_inh_45_2"][j] - r["dead_fam_45_2"][j]; dm.append(r["inh_mass"][j] - r["fam_mass"][j])
                fewer += d < 0; eq += d == 0; more += d > 0
    lines.append(f"  {lab:20s} heavier (inh) fewer {fewer}, equal {eq}, more {more}; mass difference median {np.median(dm) * 1000:.0f} g")
open(os.path.join(HERE, "posthoc.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
