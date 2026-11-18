"""Milestone 3g: the pooled drape coefficient as an interval over near-degenerate states.

    python3 experiments/m3g_band/run.py      (seconds, stdlib only: results.txt, results.json)

Why: 3f's Next (c). 3e and 3f picked, on each lattice, the single lowest-energy converged state among
the lattice's own seeds and every state transferred onto it. 3f found that on the jersey (A) the states
found on one lattice sit within about 1e-5 J of each other, that which of them is lowest shifts by a few
1e-6 J with the transfer used, and that this moves the pooled DC by about 0.002. A single lowest state
is then a sample, not a summary: a measured Cusick drape (several specimens, friction at the disc, no
claim to reach the global minimum) cannot be expected to pick a state out of a band that narrow. This
step reports the DC as the interval over every distinct converged state within a registered energy band
of the pooled lowest, and asks whether that interval is mesh-converged.

Data (no new solves): 3e's own-seed end states at each fabric's garment-load EA (A 369, D 1896 N/m),
3f's affine transfers for the jersey (they replace 3e's nearest-fill jersey transfers, per 3f's
finding), 3e's transfers for the suiting (D; 3f did not rerun them). Distinct states: 3e's `distinct`
rule (same fold count, energy to 1e-9 relative). Capped (non-converged) solves are excluded.

Rule (registered here, before this script was first run): on each fabric and lattice, BAND = every
distinct converged state with energy <= E_min + dE, where E_min is the pooled lowest; registered
dE = 1e-5 J (3f's flag tolerance, and the jersey's seed spread). The reported DC is
[min, max] over BAND, with its midpoint. Sensitivity sweep: dE in {1e-6, 3e-6, 1e-5, 3e-5, 1e-4, 3e-4} J.
Each dE is also given as the mean drop of the overhang it equals, dE / (W g pi (R_SPEC^2 - R_DISC^2))
(W the KES areal weight: A 12.55, D 24.60 mg/cm^2, `hanger-kes`), to say how small an energy step
it is in the specimen's own terms.

Predictions (written before the first run; the analyst had read 3c to 3f's logs, which quote
some of these states, but had not tabulated any band):
  Q1  the jersey's band at 1e-5 J holds at least 3 distinct states on every lattice.
  Q2  the suiting's band at 1e-5 J holds only 7-fold states on 2.5 and 1.875 mm.
  Q3  (acceptance) at dE = 1e-5 J the 2.5 mm and 1.875 mm DC intervals overlap, on both fabrics.
  Q4  (acceptance) the band midpoint moves less than 0.01 from 2.5 to 1.875 mm, on both fabrics.
  Q5  band width at 1e-5 J is at most 0.015 on every jersey lattice and at most 0.005 on the
      suiting's 2.5 and 1.875 mm lattices.
  Q6  within the band at 1e-4 J, DC and energy correlate positively (Pearson r > 0) in at least 4
      of the 6 fabric-lattice cells that hold 3 or more states (3c's r = +0.67 to +0.95 across seeds).
  Q7  the suiting's band reaches a second fold count by dE = 1e-4 J on 2.5 and 1.875 mm.
  Q8  dE = 1e-5 J is under 0.5 mm of mean overhang drop on both fabrics.
"""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
TOP = {"A": 369.0, "D": 1896.0}
LATS = (0.00375, 0.0025, 0.001875)
DE = 1e-5
SWEEP = (1e-6, 3e-6, 1e-5, 3e-5, 1e-4, 3e-4)
W = {"A": 12.55, "D": 24.60}          # mg/cm^2, hanger-kes (KES-FB areal weight)
R_SPEC, R_DISC = 0.15, 0.09           # m, cusick.py (BS 5058 specimen and disc)
GRAV = 9.81


def mm(a):
    return f"{a * 1000:g}"


def distinct(rows):
    """3e's rule: one representative per (fold count, energy to 1e-9 relative), lowest first."""
    keep = []
    for r in sorted((r for r in rows if r["conv"]), key=lambda r: (r["energy"], r.get("src_a", 0), r["seed"])):
        if not any(k["folds"] == r["folds"] and abs(k["energy"] - r["energy"]) <= 1e-9 * abs(r["energy"])
                   for k in keep):
            keep.append(r)
    return keep


def pool(e3, f3):
    """Every candidate state per (fabric, lattice): own seeds plus transfers onto it."""
    own = [r for r in e3["rows"] if r["ea"] == TOP[r["f"]]]
    xf = [r for r in f3["transfers"]] + [r for r in e3["transfers"] if r["f"] == "D"]
    return {(f, a): distinct([r for r in own + xf if (r["f"], r["a"]) == (f, a)]) for f in TOP for a in LATS}


def band(states, de):
    e0 = states[0]["energy"]
    return [r for r in states if r["energy"] <= e0 + de]


def drop_mm(f, de):
    weight = W[f] * 1e-2 * GRAV * math.pi * (R_SPEC ** 2 - R_DISC ** 2)   # mg/cm^2 -> kg/m^2 is 1e-2
    return 1000 * de / weight


def pearson(x, y):
    mx, my = sum(x) / len(x), sum(y) / len(y)
    sx = math.sqrt(sum((v - mx) ** 2 for v in x))
    sy = math.sqrt(sum((v - my) ** 2 for v in y))
    if sx == 0 or sy == 0:
        return None
    return sum((a - mx) * (b - my) for a, b in zip(x, y)) / (sx * sy)


def summary(b):
    lo, hi = min(r["dc"] for r in b), max(r["dc"] for r in b)
    return dict(n=len(b), lo=lo, hi=hi, mid=(lo + hi) / 2, width=hi - lo,
                folds=sorted({r["folds"] for r in b}))


def src(r):
    return f"{mm(r['src_a'])}mm s{r['seed']}" if "src_a" in r else f"own s{r['seed']}"


def main():
    e3 = json.loads((EXP / "m3e_pooled" / "results.json").read_text())
    f3 = json.loads((EXP / "m3f_transfer" / "results.json").read_text())
    P = pool(e3, f3)
    o = ["milestone 3g: pooled DC as an interval over the energy band E <= E_min + dE",
         "sources: 3e own seeds (A 369, D 1896 N/m); 3f affine transfers (A); 3e transfers (D)", ""]
    for f in TOP:
        o.append(f"dE as mean overhang drop, fabric {f}: " +
                 ", ".join(f"{d:g} J = {drop_mm(f, d):.3g} mm" for d in SWEEP))
    o.append("")
    o.append("distinct converged states per cell, lowest first: fabric a_mm | rank E-E_min(J) DC folds from")
    for (f, a), st in P.items():
        o.append(f"{f} {mm(a)}: {len(st)} distinct")
        for i, r in enumerate(st):
            o.append(f"   {i + 1:2d} {r['energy'] - st[0]['energy']:.3e} {r['dc']:.4f} {r['folds']:2d} {src(r)}")
    o.append("")
    o.append("sweep: fabric a_mm dE | n lo hi mid width folds")
    S = {}
    for f in TOP:
        for a in LATS:
            for d in SWEEP:
                s = summary(band(P[(f, a)], d))
                S[(f, a, d)] = s
                o.append(f"{f} {mm(a)} {d:g} | {s['n']} {s['lo']:.4f} {s['hi']:.4f} {s['mid']:.4f} "
                         f"{s['width']:.4f} {s['folds']}")
    o.append("")
    o.append("mesh change of the band at each dE: fabric dE | mid(2.5)-mid(3.75) mid(1.875)-mid(2.5) "
             "overlap(3.75,2.5) overlap(2.5,1.875)")
    ov = lambda p, q: p["lo"] <= q["hi"] and q["lo"] <= p["hi"]
    for f in TOP:
        for d in SWEEP:
            s1, s2, s3 = (S[(f, a, d)] for a in LATS)
            o.append(f"{f} {d:g} | {s2['mid'] - s1['mid']:+.4f} {s3['mid'] - s2['mid']:+.4f} "
                     f"{'yes' if ov(s1, s2) else 'no'} {'yes' if ov(s2, s3) else 'no'}")
    o.append("")
    # predictions
    q1 = all(S[("A", a, DE)]["n"] >= 3 for a in LATS)
    o.append(f"Q1 jersey band (1e-5 J) sizes {[S[('A', a, DE)]['n'] for a in LATS]}: {'held' if q1 else 'refuted'}")
    q2 = all(S[("D", a, DE)]["folds"] == [7] for a in LATS[1:])
    o.append(f"Q2 suiting band folds at 2.5, 1.875 mm {[S[('D', a, DE)]['folds'] for a in LATS[1:]]}: "
             f"{'held' if q2 else 'refuted'}")
    q3 = all(ov(S[(f, 0.0025, DE)], S[(f, 0.001875, DE)]) for f in TOP)
    o.append(f"Q3 (acceptance) 2.5 and 1.875 mm intervals overlap on both fabrics: {'held' if q3 else 'refuted'}")
    dm = {f: S[(f, 0.001875, DE)]["mid"] - S[(f, 0.0025, DE)]["mid"] for f in TOP}
    q4 = all(abs(v) < 0.01 for v in dm.values())
    o.append(f"Q4 (acceptance) midpoint change 2.5 -> 1.875 mm: A {dm['A']:+.4f}, D {dm['D']:+.4f}: "
             f"{'held' if q4 else 'refuted'}")
    wa = [S[("A", a, DE)]["width"] for a in LATS]
    wd = [S[("D", a, DE)]["width"] for a in LATS[1:]]
    q5 = max(wa) <= 0.015 and max(wd) <= 0.005
    o.append(f"Q5 widths A {[round(w, 4) for w in wa]}, D(2.5, 1.875) {[round(w, 4) for w in wd]}: "
             f"{'held' if q5 else 'refuted'}")
    rs, n6 = [], 0
    for f in TOP:
        for a in LATS:
            b = band(P[(f, a)], 1e-4)
            if len(b) >= 3:
                r = pearson([x["energy"] for x in b], [x["dc"] for x in b])
                rs.append((f, mm(a), len(b), r))
                n6 += r is not None and r > 0
    o.append("Q6 r(E, DC) in the 1e-4 J band: " +
             ", ".join(f"{f} {a} (n {n}) {'-' if r is None else f'{r:+.2f}'}" for f, a, n, r in rs) +
             f": {n6} of {len(rs)} positive: {'held' if n6 >= 4 else 'refuted'}")
    q7 = all(len(S[("D", a, 1e-4)]["folds"]) >= 2 for a in LATS[1:])
    o.append(f"Q7 suiting folds at 1e-4 J {[S[('D', a, 1e-4)]['folds'] for a in LATS[1:]]}: "
             f"{'held' if q7 else 'refuted'}")
    q8 = all(drop_mm(f, DE) < 0.5 for f in TOP)
    o.append(f"Q8 1e-5 J as overhang drop: A {drop_mm('A', DE):.3f} mm, D {drop_mm('D', DE):.3f} mm: "
             f"{'held' if q8 else 'refuted'}")
    o.append(f"acceptance (Q3 and Q4): {'passed' if q3 and q4 else 'failed'}")
    res = dict(states={f"{f} {mm(a)}": st for (f, a), st in P.items()},
               bands={f"{f} {mm(a)} {d:g}": s for (f, a, d), s in S.items()},
               registered_dE=DE)
    (HERE / "results.json").write_text(json.dumps(res, indent=1))
    (HERE / "results.txt").write_text("\n".join(o) + "\n")
    print("\n".join(o))


if __name__ == "__main__":
    main()
