"""Milestone 4e: does the arm width the cheap tiers pick survive on the top tier, calibrated and not,
on nine wovens with measured mechanics? (H1 and H3 on measured fabrics.)

    python3 experiments/m4e_hanger_tier/run.py           (90 cases, about 2 to 3 h on 4 cores; resumes)
    python3 experiments/m4e_hanger_tier/run.py --report  (results.txt and results.json from the cache)

Why. Milestone 1 compared the 2D chain and the 3D spring sheet on a 3 cm half-depth arm and found
them agreeing on the width (+1 cm on four fabrics), but warned that the 3D numbers were not
converged to the margin that decides it. Milestones 3 to 4d built a top tier (3a's triangle element,
3d's Newton) and calibrated it on nine wovens with a measured Cusick drape coefficient: uncalibrated it
over-drapes by about 0.14, and one factor of 0.485 on FAST bending rigidity removes the bias (4a, V1).
This step puts that tier on the hanger (`hangerfem.py`) and asks the programme's question of it.

Set-up (fixed before any registered solve):
  Fabrics F1 to F9 of Petrak et al. (2021) (`m4a_measured_drape/fabrics.py`). Garment: `hanger_fit`'s
    size M tee, every mass scaled by W / 125.5 g/m^2 (the tee's jersey, as `hanger-kes` scales),
    B = c x the geometric mean of FAST warp and weft, EA = the geometric mean of the secants at
    100 gf/cm (4a), G = FAST shear rigidity (top tier only; the spring sheet ties shear to 0.1 EA).
  Calibration factor c in {1 (uncalibrated, "u"), 0.485 (4a's one-factor fit, "c")}.
  Hanger: the wood-shaped profile with half width = half shoulder + o, o in {-1, 0, 1, 2, 3} cm, arm
    half-depth zh = 3 cm (milestone 1's shallow arm, where the 3D sheet adds physics).
  Tiers, each converged (not capped):
    T1  2D chain at 5 mm rows (`hanger_fit`), L-BFGS to max|g| < 1e-7 N or 20,000 iterations (score settled to 1e-5 cm in a pilot);
    T2  3D spring sheet (`hanger_3d.cloth3d`, 5 mm rows, 9 columns), L-BFGS in chunks of 5,000 to
        max|g| < 1e-6 N or 100,000 iterations;
    T3  the triangle tier on a 5 mm lattice (3,321 nodes), started from T2's converged state at the
        same c, 3d's Newton to max|g| < 1e-5 x the heaviest node's weight or 600 steps.
  Score: shape error (cm RMS) from the worn shape over the whole sheet (cloth3d's err_all; the chain's
    err for T1), the sleeve's last 5 cm excluded. Decision: the offset with the lowest score; margin:
    runner-up minus best.

Pilots, disclosed (2026-11-21, before these predictions were written; none is a registered result):
  T3 at o = +1, c = 1, from T2 at 3,000 iterations, with a 4% lighter sheet (before the mass rescale):
  F1 1.97 cm (about 380 steps), F3 2.03, F5 1.98, F9 2.04 (F9 95 steps, F3 and F5 about 230).
  Newton from the flat chain start crawled; the unsmoothed contact penalty stalled on nodes resting on
  the arm (hence `hangerfem.DELTA`). T2 for F5 at o = +1, c = 1: 1.81 cm at 3,000 iterations, 1.93 at
  25,000 (converged): milestone 1's 3,000-iteration figures were short by about 0.1 cm.

Predictions (registered before the first registered solve):
  E1  Every T3 solve reaches its tolerance within 600 steps and every T2 solve its tolerance.
  E2  (acceptance, H1) T3's best offset at c equals T2's at the same c on >= 7 of 9 fabrics, for both c.
  E3  T3's best offset equals T1's at the same c on >= 7 of 9 fabrics, for both c.
  E4  (H3) calibration changes T3's best offset (c = 1 against c = 0.485) on at least 1 of 9 fabrics.
  E5  At T3's best offset, |err_T3 - err_T2| exceeds T3's decision margin on >= 5 of 9 (c = 0.485):
      the tiers disagree more on absolute shape error than the decision needs.
  E6  T3's regret of T2's choice (err_T3 at T2's best offset minus T3's best) is <= 0.02 cm on all 9
      fabrics (c = 0.485).
  E7  Paired differences carry over better than absolute scores: max over o of
      |(err_T2(o) - err_T2(+1)) - (err_T3(o) - err_T3(+1))| < |err_T2(+1) - err_T3(+1)| on >= 7 of 9
      (c = 0.485).
"""
import dataclasses
import json
import math
import multiprocessing as mp
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent / "m4a_measured_drape")]
import hangerfem as hf  # noqa: E402
import fabrics  # noqa: E402

sys.path.insert(0, str(hf.R / "hanger-sweep" / "src"))
from hanger_sweep.sweep import make_garment  # noqa: E402
from hanger_3d.cloth3d import DS, Arm, Sheet, score as score3  # noqa: E402

m2 = hf.m2
CODES = fabrics.CODES
OFFSETS = (-1.0, 0.0, 1.0, 2.0, 3.0)
CALS = {"u": 1.0, "c": 0.485}
ZH = 3.0
A = 0.005
W_TEE = 125.5          # g/m^2, hanger_fit's tee jersey (hanger-kes fabric A, 12.55 mg/cm^2)
CACHE = HERE / "cache"


def garment(code, c):
    B = c * fabrics.b_fast(code) / fem_gf()
    return make_garment("M", "tee", B, fabrics.weight(code) / W_TEE, fabrics.ea_secant(code))


def fem_gf():
    return hf.fem.GF_CM2_PER_CM


def hanger(g, o):
    return dataclasses.replace(m2.STOCK["wood-shaped"], w=g.half_shoulder + o)


def chain(h, g):
    """T1: hanger_fit's chain at 5 mm rows, converged."""
    old = m2.SEG
    m2.SEG = DS
    try:
        s, l0, m, _ = m2._layout(g)
        P, rc, X0 = h.centreline(), h.r * hf.CM, m2.neck_point(h, g)
        X = m2.initial(h, X0, s)
        B = g.B * hf.fem.GF_CM2_PER_CM
        fg = lambda y: m2.energy_grad(y, X0, l0, m, g.EA * m2.DEPTH / l0, B * m2.DEPTH / l0, P, rc)
        y, it = m2.lbfgs(fg, X[1:].ravel(), iters=20000, tol=1e-7)
        X = np.vstack([X0, y.reshape(-1, 2)])
        gmax = float(np.abs(fg(y)[1]).max())
        return dict(err=m2.score(h, g, X, s)["err"], iters=it, gmax=gmax)
    finally:
        m2.SEG = old


def spring(h, g):
    """T2: the 3D spring sheet, converged. Returns the state and its record."""
    sh = Sheet(Arm(h, ZH), g)
    X = sh.start()
    v, tot = X[sh.free], 0
    while tot < 100000:
        v, used = m2.lbfgs(lambda u: sh.energy_grad(u, X), v, iters=5000, tol=1e-6)
        tot += used
        if used < 5000:
            break
    X[sh.free] = v
    E, gr = sh.energy_grad(v, X)
    return X, sh, dict(err=score3(X, sh)["err_all"], iters=tot, gmax=float(np.abs(gr).max()), E=float(E))


def job(spec):
    code, o, cal = spec
    out = CACHE / f"{code}_{o:+.0f}_{cal}.json"
    if out.exists():
        return json.loads(out.read_text())
    t = time.time()
    g = garment(code, CALS[cal])
    h = hanger(g, o)
    rec = dict(code=code, o=o, cal=cal)
    rec["t1"] = chain(h, g)
    Xg, sg, rec["t2"] = spring(h, g)
    sh = hf.HangerSheet(h, ZH, g, A, fabrics.g_fast(code))
    X = hf.from_grid(sh, Xg, sg.s, sg.z)
    X, info = hf.solve(sh, X, maxit=600)
    rec["t3"] = dict(err=sh.score(X), iters=info["iters"], rel=info["rel"], E=info["E"],
                     stalled=info["stalled"], n=sh.n)
    rec["sec"] = time.time() - t
    CACHE.mkdir(exist_ok=True)
    out.write_text(json.dumps(rec))
    print(f"{code} o{o:+.0f} {cal}: T1 {rec['t1']['err']:.4f} T2 {rec['t2']['err']:.4f} "
          f"T3 {rec['t3']['err']:.4f} (rel {info['rel']:.2g}, {info['iters']} steps) {rec['sec']:.0f}s", flush=True)
    return rec


def specs():
    return [(c, o, cal) for cal in CALS for c in CODES for o in OFFSETS]


def kendall(x, y):
    n, s = len(x), 0
    for i in range(n):
        for j in range(i + 1, n):
            s += np.sign(x[i] - x[j]) * np.sign(y[i] - y[j])
    return s / (n * (n - 1) / 2)


def report():
    recs = {(r["code"], r["o"], r["cal"]): r for r in (json.loads(p.read_text()) for p in CACHE.glob("*.json"))}
    L = ["hanger-codesign milestone 4e: the arm width on three tiers, nine measured wovens (Petrak et al. 2021).",
         f"Size M tee, wood-shaped profile, arm half-depth {ZH:g} cm, offsets {list(OFFSETS)} cm; err in cm RMS from the worn shape.",
         "T1 2D chain (5 mm), T2 3D spring sheet (5 mm x 9 columns), T3 triangle tier (5 mm lattice); all converged.",
         "c: bending = c x FAST (u: c = 1, uncalibrated; c: c = 0.485, milestone 4a's fit).", ""]
    missing = [s for s in specs() if (s[0], s[1], s[2]) not in recs]
    if missing:
        L.append(f"MISSING {len(missing)} of {len(specs())} cases: {missing[:5]} ...")
    L.append("1. per case")
    L.append("fabric cal o err_T1 err_T2 err_T3 T2_gmax T3_rel T3_steps")
    for (c, o, cal), r in sorted(recs.items(), key=lambda kv: (kv[0][2], kv[0][0], kv[0][1])):
        L.append(f"{c} {cal} {o:+.0f} {r['t1']['err']:.4f} {r['t2']['err']:.4f} {r['t3']['err']:.4f} "
                 f"{r['t2']['gmax']:.1e} {r['t3']['rel']:.1e} {r['t3']['iters']}")
    best, summ = {}, {}
    L += ["", "2. decisions (best offset, margin = runner-up minus best, cm)",
          "fabric cal best_T1 best_T2 best_T3 margin_T1 margin_T2 margin_T3 tau_T2T3"]
    for cal in CALS:
        for c in CODES:
            if any((c, o, cal) not in recs for o in OFFSETS):
                continue
            row = {}
            for t in ("t1", "t2", "t3"):
                e = [recs[(c, o, cal)][t]["err"] for o in OFFSETS]
                k = int(np.argmin(e))
                srt = sorted(e)
                row[t] = dict(errs=e, best=OFFSETS[k], margin=srt[1] - srt[0])
            row["tau"] = kendall(row["t2"]["errs"], row["t3"]["errs"])
            best[(c, cal)] = row
            L.append(f"{c} {cal} {row['t1']['best']:+.0f} {row['t2']['best']:+.0f} {row['t3']['best']:+.0f} "
                     f"{row['t1']['margin']:.4f} {row['t2']['margin']:.4f} {row['t3']['margin']:.4f} {row['tau']:+.2f}")
    # predictions
    L += ["", "3. predictions"]
    all_recs = [recs[s] for s in specs() if s in recs]
    e1_t3 = sum(r["t3"]["rel"] < 1e-5 for r in all_recs)
    e1_t2 = sum(r["t2"]["gmax"] < 1e-6 for r in all_recs)
    L.append(f"E1 T3 converged {e1_t3} of {len(all_recs)}; T2 converged {e1_t2} of {len(all_recs)}: "
             + ("held" if e1_t3 == e1_t2 == len(all_recs) == len(specs()) else "refuted"))
    for name, a, b in (("E2", "t3", "t2"), ("E3", "t3", "t1")):
        parts, ok = [], True
        for cal in CALS:
            k = sum(best[(c, cal)][a]["best"] == best[(c, cal)][b]["best"] for c in CODES if (c, cal) in best)
            parts.append(f"c={CALS[cal]:g}: {k} of 9")
            ok &= k >= 7
        L.append(f"{name} {a.upper()} best = {b.upper()} best: " + ", ".join(parts) + (": held" if ok else ": refuted"))
    k4 = [c for c in CODES if (c, "u") in best and (c, "c") in best and best[(c, "u")]["t3"]["best"] != best[(c, "c")]["t3"]["best"]]
    L.append(f"E4 calibration changes T3's best offset on {len(k4)} of 9 {k4}: " + ("held" if k4 else "refuted"))
    k5, k6, k7, regrets = 0, 0, 0, {}
    for c in CODES:
        if (c, "c") not in best:
            continue
        r = best[(c, "c")]
        i3 = OFFSETS.index(r["t3"]["best"])
        i2 = OFFSETS.index(r["t2"]["best"])
        gap = abs(r["t3"]["errs"][i3] - r["t2"]["errs"][i3])
        k5 += gap > r["t3"]["margin"]
        regrets[c] = r["t3"]["errs"][i2] - r["t3"]["errs"][i3]
        k6 += regrets[c] <= 0.02
        j = OFFSETS.index(1.0)
        d2 = np.array(r["t2"]["errs"]) - r["t2"]["errs"][j]
        d3 = np.array(r["t3"]["errs"]) - r["t3"]["errs"][j]
        k7 += np.abs(d2 - d3).max() < abs(r["t2"]["errs"][j] - r["t3"]["errs"][j])
    L.append(f"E5 |err_T3 - err_T2| at T3's best > T3's margin on {k5} of 9: " + ("held" if k5 >= 5 else "refuted"))
    L.append(f"E6 T3 regret of T2's choice <= 0.02 cm on {k6} of 9 (max {max(regrets.values(), default=float('nan')):.4f}): "
             + ("held" if k6 == 9 else "refuted"))
    L.append(f"E7 paired differences closer than absolute on {k7} of 9: " + ("held" if k7 >= 7 else "refuted"))
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    js = {f"{c}|{cal}": {t: best[(c, cal)][t] for t in ("t1", "t2", "t3")} | {"tau": best[(c, cal)]["tau"]}
          for (c, cal) in best}
    (HERE / "results.json").write_text(json.dumps(dict(cases={f"{k[0]}|{k[1]:+.0f}|{k[2]}": v for k, v in recs.items()},
                                                       decisions=js), indent=1))
    print("\n".join(L))


def main():
    if "--report" not in sys.argv:
        with mp.Pool(4) as P:
            for _ in P.imap_unordered(job, specs()):
                pass
    report()


if __name__ == "__main__":
    main()
