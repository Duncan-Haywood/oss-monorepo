"""Milestone 4c: is milestone 4a's over-drape membrane locking? An energy split along the stretch ladder.

    python3 experiments/m4c_locking/run.py --phase solve    (about 1 to 2 h on 4 cores; resumable)
    python3 experiments/m4c_locking/run.py --phase report   (seconds: results.txt, results.json)

Why: milestone 4a's top tier over-drapes all nine Petrak et al. (2021) wovens by about +0.14 in drape
coefficient (DC); 4b showed the warp/weft anisotropy the isotropic element averages away does not
explain it, and named membrane locking at EA of 2,000 to 9,000 N/m as the leading suspect. Locking is
a discretisation error with a known signature, so it can be tested on the element as it stands before
anything is rebuilt. Physically, once the cloth's stretch is negligible next to its fold geometry,
raising EA further should not change its shape: the membrane strain falls as 1/EA, so the membrane
energy Em = EA eps^2 / 2 falls as 1/EA and EA * Em tends to a constant (the gravity tension squared).
A locked constant-strain-triangle membrane cannot bend into a doubly curved fold without stretching,
so as EA grows the solution trades some of that forced strain for a stiffer (higher-DC) shape and Em
falls more slowly than 1/EA. The exponent p in Em ~ EA^p along a fixed fold pattern is the test:
p near -1 is locking-free, p well above -1 is locking.

Method: 4a's code path unchanged (`FabricDisc`, `ladder`, 3c's stage, 3d's local Newton, cap 400,
tolerance 1e-5 of the heaviest node weight). Seed 0, FAST inputs, on the 2.5 mm and 3.75 mm lattices
(4a's main and mesh-check lattices), all nine fabrics. Each chain rebuilds 4a's upward EA ladder (150
N/m to the fabric's secant EA in steps of at most x2) and then, from the EA 150 state, a downward
branch at 75, 37.5 and 18.75 N/m. At every converged stage it records DC, fold count, the energy split
(gravity, membrane stretch, membrane shear, bending) and the Green strain of the free triangles.
Exponent p: least-squares slope of ln(Em) on ln(EA) over the upward ladder's stages that keep the
EA 150 fold count (at least three stages, else not fitted). Stretch = the EA terms of the membrane
energy; shear (G fixed along the ladder) is reported apart.

Predictions (written before this script's first solve and before 4a's logged stage rows were parsed;
disclosed: the first 30 lines of 4a's run_log.txt were read while planning, which show F9's three
2.5 mm seeds and F1's first stages rising in DC with EA at a constant fold count, F9 seed 0 from 0.730
at 150 N/m to 0.789 at 4785 N/m):
  C0  Reproduction: every rebuilt upward stage matches 4a's logged row (same lattice, seed 0, FAST) in
      fold count and DC to 1e-4 (2.5 mm from run_log.txt; 3.75 mm likewise).
  C1  Monotone: on the 2.5 mm upward ladders, DC rises with EA in at least 90% of the steps that keep
      the fold count.
  C2  Locking exponent (acceptance for "locking is present"): p > -0.5 on at least 7 of 9 fabrics at
      2.5 mm.
  C3  Mesh direction of locking: p (or, where p is not fitted on both, the DC rise per doubling of EA
      at constant folds) is larger on 3.75 mm than on 2.5 mm on at least 6 of 9 fabrics. Disclosed:
      4a's M6 already found the 3.75 mm DC lower than the 2.5 mm DC on seven fabrics, which is the
      opposite of what pure locking does to the DC level, so C3 tests the rate, not the level.
  C4  Physical stretch is small: at EA 150 N/m the 99th percentile of max(|E11|, |E22|) over free
      triangles is below 1% on all nine fabrics at 2.5 mm.
  C5  Downward branch: DC at 18.75 N/m is below DC at 150 N/m on at least 7 of 9 fabrics (2.5 mm), and
      the bias of the 18.75 N/m DCs against the measured DC is still at least +0.05 (lowering EA alone
      does not remove the over-drape).
  C6  Share: the 2.5 mm DC rise from EA 150 N/m to the secant EA, averaged over the nine, is at least
      a quarter of 4a's bias (+0.143), i.e. >= 0.036.
Reading registered with the predictions: if C2 holds, the element locks at the fabrics' secant EA and
C6 says how much of the over-drape that buys; if C2 fails, the DC rise with EA is a real (if small)
stretch effect or a fold-shape effect, and the bias has to be carried by the bending input or the
mesh trend instead.
"""
import argparse
import importlib.util
import json
import math
import multiprocessing as mp
import re
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
_s = importlib.util.spec_from_file_location("m4a_run", EXP / "m4a_measured_drape" / "run.py")
m4a = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m4a)
fabrics, m3c, fem, localhess, cusick = m4a.fabrics, m4a.m3c, m4a.fem, m4a.localhess, m4a.cusick

CACHE = HERE / "cache"
LATTICES = (0.0025, 0.00375)
DOWN = (75.0, 37.5, 18.75)
TOL = 1e-5


def split(sp, X):
    """Energy split [J] and Green-strain statistics of the free triangles at state X."""
    x0, x1, x2 = X[sp.T[:, 0]], X[sp.T[:, 1]], X[sp.T[:, 2]]
    F = np.stack([x1 - x0, x2 - x0], axis=2) @ sp.Dinv
    C = np.einsum("mki,mkj->mij", F, F)
    E11, E22, E12 = 0.5 * (C[:, 0, 0] - 1), 0.5 * (C[:, 1, 1] - 1), 0.5 * C[:, 0, 1]
    stretch = float((sp.area * 0.5 * sp.EA * (E11 ** 2 + E22 ** 2)).sum())
    shear = float((sp.area * 2 * sp.Gs * E12 ** 2).sum())
    th, _ = sp.theta(X)
    bend = float((sp.kb * th * th).sum())
    grav = float(fem.GRAV * (sp.mass * X[:, 2]).sum())
    freetri = sp.free[sp.T].all(1)
    em = np.maximum(np.abs(E11), np.abs(E22))[freetri]
    return dict(grav=grav, stretch=stretch, shear=shear, bend=bend,
                eps99=float(np.quantile(em, 0.99)), epsmax=float(em.max()), epsmean=float(em.mean()),
                gam99=float(np.quantile(np.abs(2 * E12[freetri]), 0.99)))


def chain_job(job):
    code, a = job
    out = CACHE / f"chain_{code}_{m4a.mm(a)}.json"
    if out.exists():
        return json.loads(out.read_text())
    CACHE.mkdir(exist_ok=True)
    up = m4a.ladder(fabrics.ea_secant(code))
    plan = [("up", ea) for ea in up] + [("down", ea) for ea in DOWN]
    sp = m4a.FabricDisc(code, up[0], a, "fast")
    X = sp.start(0)
    nw, w = localhess.LocalNewton(sp, X), fem.GRAV * sp.mass.max()
    base = f"partial_{code}_{m4a.mm(a)}"
    pj, pz = CACHE / f"{base}.json", (lambda k: CACHE / f"{base}_stage{k}.npy")
    rows = []
    if pj.exists():
        rows = json.loads(pj.read_text())
        X = np.load(pz(len(rows) - 1))
    for k in range(len(rows), len(plan)):
        branch, ea = plan[k]
        if branch == "down" and plan[k - 1][0] == "up":
            X = np.load(pz(0))                     # the down branch starts from the EA 150 state
        t = time.time()
        sp.EA = ea
        X, info = m3c.stage(sp, nw, w, X)
        r = dict(code=code, a=a, branch=branch, ea=ea, n=sp.n, dc=sp.dc(X), folds=cusick.nodes(X, sp),
                 energy=float(sp.energy_grad(X[sp.free].ravel(), X)[0]), steps=info["iters"],
                 gmax=info["gmax"] / w, sec=time.time() - t)
        r["conv"] = bool(r["gmax"] < TOL)
        r.update(split(sp, X))
        print(f"{code} {m4a.mm(a)}mm {branch} EA {ea:.2f}: DC {r['dc']:.4f} folds {r['folds']} E {r['energy']:.8e} "
              f"Es {r['stretch']:.3e} Eg {r['shear']:.3e} Eb {r['bend']:.3e} eps99 {r['eps99']:.2e} "
              f"steps {r['steps']} conv {r['conv']} {r['sec']:.0f}s", flush=True)
        rows.append(r)
        np.save(pz(k), X)
        tmp = CACHE / f"{base}.json.tmp"
        tmp.write_text(json.dumps(rows))
        tmp.replace(pj)
    out.write_text(json.dumps(rows))
    return rows


LOGRE = re.compile(r"^(F\d) ([\d.]+)mm seed 0 fast EA (\d+): DC ([\d.]+) folds (\d+) E (\S+)")


def logged_4a():
    """4a's seed-0 FAST stage rows, keyed (code, lattice mm, rounded EA)."""
    rows = {}
    for f in sorted((EXP / "m4a_measured_drape").glob("run_log*.txt")):
        for line in f.read_text().splitlines():
            m = LOGRE.match(line)
            if m:
                rows[(m[1], m[2], int(m[3]))] = (float(m[4]), int(m[5]), float(m[6]))
    return rows


def fit_p(rows):
    """Slope of ln(stretch energy) on ln(EA) over upward stages keeping the EA 150 fold count."""
    up = [r for r in rows if r["branch"] == "up" and r["conv"]]
    if not up:
        return None, 0
    keep = [r for r in up if r["folds"] == up[0]["folds"]]
    if len(keep) < 3:
        return None, len(keep)
    x = np.log([r["ea"] for r in keep])
    y = np.log([r["stretch"] for r in keep])
    return float(np.polyfit(x, y, 1)[0]), len(keep)


def rise_per_doubling(rows):
    up = [r for r in rows if r["branch"] == "up" and r["conv"]]
    d = [(b["dc"] - a["dc"]) / math.log2(b["ea"] / a["ea"]) for a, b in zip(up, up[1:]) if a["folds"] == b["folds"]]
    return float(np.mean(d)) if d else None, d


def report():
    res = {c: {m4a.mm(a): json.loads((CACHE / f"chain_{c}_{m4a.mm(a)}.json").read_text()) for a in LATTICES}
           for c in fabrics.CODES}
    meas = {c: fabrics.TABLE[c][9] for c in fabrics.CODES}
    log4a = logged_4a()
    L = ["hanger-codesign milestone 4c. Is 4a's over-drape membrane locking? Seed 0, FAST inputs, Petrak et al. (2021)",
         "nine wovens. Es = membrane stretch energy, Eg = membrane shear energy, Eb = bending energy (J);",
         "eps99 = 99th percentile of max(|E11|,|E22|) over free triangles; p = slope of ln Es on ln EA along the",
         "upward ladder at the EA 150 fold count (p = -1: locking-free, strain ~ 1/EA).", ""]
    L.append("1. every stage: fabric lattice branch EA DC folds Es Eg Eb Es/(Es+Eb) EA*Es eps99 epsmax steps conv | 4a logged DC folds")
    c0_bad, c0_n = [], 0
    for c in fabrics.CODES:
        for lab, rows in res[c].items():
            for r in rows:
                lg = log4a.get((c, lab, round(r["ea"]))) if r["branch"] == "up" else None
                tail = ""
                if lg:
                    c0_n += 1
                    ok = abs(lg[0] - r["dc"]) <= 1e-4 + 5e-5 and lg[1] == r["folds"]
                    if not ok:
                        c0_bad.append(f"{c} {lab} EA {r['ea']:.0f}: {r['dc']:.4f}/{r['folds']} vs {lg[0]:.4f}/{lg[1]}")
                    tail = f" | {lg[0]:.4f} {lg[1]}"
                L.append(f"{c} {lab:>4} {r['branch']:>4} {r['ea']:8.2f} {r['dc']:.4f} {r['folds']:2d} {r['stretch']:.3e} "
                         f"{r['shear']:.3e} {r['bend']:.3e} {r['stretch'] / (r['stretch'] + r['bend']):.4f} "
                         f"{r['ea'] * r['stretch']:.3e} {r['eps99']:.2e} {r['epsmax']:.2e} {r['steps']:3d} {int(r['conv'])}{tail}")
    L.append("")
    L.append("2. per fabric (2.5 mm | 3.75 mm): p, stages fitted, DC rise per doubling at constant folds, DC(150), DC(EA),")
    L.append("   DC(18.75), measured, eps99 at 150")
    per = {}
    for c in fabrics.CODES:
        per[c] = {}
        for lab, rows in res[c].items():
            p, nfit = fit_p(rows)
            rpd, steps = rise_per_doubling(rows)
            up = [r for r in rows if r["branch"] == "up"]
            dn = {r["ea"]: r for r in rows if r["branch"] == "down"}
            per[c][lab] = dict(p=p, nfit=nfit, rpd=rpd, rpd_steps=steps, dc150=up[0]["dc"], dcEA=up[-1]["dc"],
                               ea=up[-1]["ea"], dc18=dn[18.75]["dc"], dc75=dn[75.0]["dc"], dc37=dn[37.5]["dc"],
                               folds150=up[0]["folds"], foldsEA=up[-1]["folds"], folds18=dn[18.75]["folds"],
                               eps99_150=up[0]["eps99"], allconv=all(r["conv"] for r in rows))
        s = per[c]
        f = lambda v, fm: "   -  " if v is None else format(v, fm)
        L.append(f"{c} " + " | ".join(
            f"p {f(s[l]['p'], '+.3f')} ({s[l]['nfit']}) rpd {f(s[l]['rpd'], '+.4f')} DC {s[l]['dc150']:.4f} "
            f"{s[l]['dcEA']:.4f} {s[l]['dc18']:.4f} folds {s[l]['folds150']}/{s[l]['foldsEA']}/{s[l]['folds18']} "
            f"eps99 {s[l]['eps99_150']:.2e}" for l in ("2.5", "3.75")) + f" | meas {meas[c]:.3f}")
    L.append("")
    m25 = {c: per[c]["2.5"] for c in fabrics.CODES}
    steps = [d for c in fabrics.CODES for d in m25[c]["rpd_steps"]]
    c1 = sum(d > 0 for d in steps) / len(steps) if steps else float("nan")
    ps = [m25[c]["p"] for c in fabrics.CODES]
    c2n = sum(p is not None and p > -0.5 for p in ps)

    def rate(c, l):
        s = per[c][l]
        return s["p"] if (per[c]["2.5"]["p"] is not None and per[c]["3.75"]["p"] is not None) else s["rpd"]
    c3n = sum(rate(c, "3.75") is not None and rate(c, "2.5") is not None and rate(c, "3.75") > rate(c, "2.5")
              for c in fabrics.CODES)
    c4n = sum(m25[c]["eps99_150"] < 0.01 for c in fabrics.CODES)
    c5n = sum(m25[c]["dc18"] < m25[c]["dc150"] for c in fabrics.CODES)
    bias18 = float(np.mean([m25[c]["dc18"] - meas[c] for c in fabrics.CODES]))
    bias150 = float(np.mean([m25[c]["dc150"] - meas[c] for c in fabrics.CODES]))
    biasEA = float(np.mean([m25[c]["dcEA"] - meas[c] for c in fabrics.CODES]))
    rise = float(np.mean([m25[c]["dcEA"] - m25[c]["dc150"] for c in fabrics.CODES]))
    sc = {k: m4a.scores([m25[c][k] for c in fabrics.CODES], [meas[c] for c in fabrics.CODES])
          for k in ("dc18", "dc37", "dc75", "dc150", "dcEA")}
    L.append("3. scores of the 2.5 mm seed-0 DC against the measured DC, by EA:")
    for k, lab in (("dc18", "18.75 N/m"), ("dc37", "37.5 N/m"), ("dc75", "75 N/m"), ("dc150", "150 N/m"), ("dcEA", "secant EA")):
        L.append(f"  {lab:>10}: {m4a.fmt(sc[k])}")
    L.append("")
    pred = {
        "C0": (not c0_bad and c0_n > 0, f"{c0_n - len(c0_bad)} of {c0_n} logged stages reproduced" + (f"; misses: {'; '.join(c0_bad)}" if c0_bad else "")),
        "C1": (c1 >= 0.9, f"DC rises in {sum(d > 0 for d in steps)} of {len(steps)} constant-fold steps ({c1:.0%})"),
        "C2": (c2n >= 7, f"p > -0.5 on {c2n} of 9 (p: {', '.join('-' if p is None else f'{p:+.2f}' for p in ps)})"),
        "C3": (c3n >= 6, f"3.75 mm rate above 2.5 mm on {c3n} of 9"),
        "C4": (c4n == 9, f"eps99 < 1% at EA 150 on {c4n} of 9 (max {max(m25[c]['eps99_150'] for c in fabrics.CODES):.2e})"),
        "C5": (c5n >= 7 and bias18 >= 0.05, f"DC(18.75) < DC(150) on {c5n} of 9; bias at 18.75 {bias18:+.4f} (150: {bias150:+.4f}; secant: {biasEA:+.4f})"),
        "C6": (rise >= 0.036, f"mean DC rise 150 N/m -> secant EA {rise:+.4f}"),
    }
    L.append("4. predictions")
    for k, (ok, txt) in pred.items():
        L.append(f"{k} {'held' if ok else 'refuted'}: {txt}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "results.json").write_text(json.dumps(dict(per=per, scores=sc, measured=meas,
                                                       predictions={k: dict(held=bool(v[0]), text=v[1]) for k, v in pred.items()},
                                                       bias=dict(ea18=bias18, ea150=bias150, secant=biasEA), rise=rise), indent=1))
    print("\n".join(L[-12:]))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=("solve", "report"), default="report")
    ap.add_argument("--procs", type=int, default=4)
    args = ap.parse_args()
    if args.phase == "solve":
        jobs = [(c, a) for a in LATTICES for c in fabrics.CODES]
        with mp.Pool(args.procs) as pool:
            for rows in pool.imap_unordered(chain_job, jobs):
                print("done", rows[0]["code"], rows[0]["a"], flush=True)
    else:
        report()
