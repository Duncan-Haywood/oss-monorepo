"""Milestone 4d: does a nonconforming (edge-midpoint) membrane remove 4c's locking, and how much of 4a's over-drape goes with it?

    python3 experiments/m4d_nonconforming/run.py --phase solve --part A   (gamma 0.1, both lattices; resumable)
    python3 experiments/m4d_nonconforming/run.py --phase solve --part B   (gamma 0.01 and 1; conforming at 5 mm)
    python3 experiments/m4d_nonconforming/run.py --phase report           (seconds: results.txt, results.json)

Why: 4c showed the conforming constant-strain triangle locks on all nine Petrak et al. (2021) wovens
(stretch energy ~ EA^-0.06 to EA^-0.31 along a fixed fold pattern, where locking-free is EA^-1) and
put the secant-EA stiffening at +0.044 of 4a's +0.15 drape-coefficient (DC) bias. 4c's Next (a): a
nonconforming membrane, registered to make the DC flat in EA above 150 N/m, then 4a's comparison
again.

Element (`cr.py`): Crouzeix-Raviart unknowns at the edge midpoints of 3a's lattice (English and
Bridson 2008), 3a's Saint Venant-Kirchhoff membrane on each triangle, a discrete-shell hinge per
interior edge between the two midpoint triangles that share its midpoint (weight calibrated on a
cylinder, isotropic to 0.6% over 0 to 90 degrees), and a penalty ks |P J|^2 on the in-plane jump J
of the field across each interior edge, ks = gamma G. Why the penalty: without it the
midpoint field has in-plane zero-energy modes at the free rim (30 on the 15 mm lattice, 39 on 12 mm,
none with gamma = 1e-3) and Newton does not converge (pilot below). It is the in-plane part of
Hansbo and Larson's (2003) jump stabilisation; scaled by G, not EA, so it does not stiffen with EA.
gamma is a numerical parameter with no physical value, so the experiment sweeps it.

Pilots run before these predictions were written (disclosed; F1 only, 7.5 mm lattice, seed 0, the
ladder 150 N/m to 4735 N/m): gamma = 0 and ks = 1e-5 EA stall at the 400-step cap; ks = 1e-4 EA and
1e-3 EA converge but the DC rises with EA (0.201 to 0.260 and 0.246 to 0.274, the penalty energy
level in EA, so scaling it with EA re-locks); ks = gamma G with gamma = 0.01, 0.1, 1 converges in
under 210 Newton steps, stretch energy roughly halves per doubling of EA, and the DC moves by at most
0.009 from 150 N/m to 4735 N/m (0.2736 to 0.2784 at gamma 0.1), but its level depends on gamma
(0.251, 0.274, 0.318 at 1190 N/m). The conforming element on 3.75 mm gives F1 0.3357 to 0.3589
(4c); measured 0.222.

Method: 4a's specimen (30 cm on an 18 cm disc), FAST inputs (geometric-mean B, FAST G, W), seed 0, 4a's
start and continuation ladder 150 N/m -> secant EA in steps of at most x2 (x4 for part B's gamma sweep),
3a/3d's damped Newton (cap 400, tolerance 1e-5 of the heaviest midpoint weight). Lattices 5 mm and
3.75 mm (2.5 mm is about 3x the conforming cost per unknown and is out of this session's reach).
Part A: gamma 0.1 on both lattices, all nine. Part B: gamma 0.01 and 1 on both lattices, and the
conforming element on 5 mm (3.75 mm conforming is 4c's). Exponent p and rise per doubling as 4c.

Predictions (written after the F1 7.5 mm pilots above and before any 5 mm or 3.75 mm solve of
this element):
  D1  Convergence: every stage of parts A and B converges.
  D2  Locking-free (acceptance): at 3.75 mm, gamma 0.1, p <= -0.8 on at least 7 of 9 (4c: -0.06 to
      -0.31 on the conforming element).
  D3  Flat in EA (acceptance, 4c's registered aim): at 3.75 mm, gamma 0.1, |DC(secant) - DC(150)|
      < 0.01 on at least 8 of 9.
  D4  Bias: at 3.75 mm, gamma 0.1, secant EA, the mean bias against the measured DC is at least 0.044
      below the conforming element's on the same lattice (4c 3.75 mm secant rows) and still >= 0.
  D5  The penalty is a discretisation error: DC(gamma 1) - DC(gamma 0.01) at the secant EA is smaller
      on 3.75 mm than on 5 mm on at least 7 of 9, and its mean over the nine at 3.75 mm is <= 0.05.
  D6  Ranking: Spearman >= 0.90 against the measured DC (3.75 mm, gamma 0.1, secant).
  D7  Absolute (4a's acceptance bar): RMSE <= 0.08 (3.75 mm, gamma 0.1, secant).
  D8  Mesh: |DC(3.75) - DC(5)| at gamma 0.1, secant, < 0.02 on at least 6 of 9.
Reading registered with them: D2 and D3 say whether the edge-midpoint element is free of 4c's locking
on this problem; D4 says what that is worth against the measured drapes; D5 says whether the answer
can be quoted without naming gamma (if it fails, the element trades a locking error for a
penalty error of similar size and the comparison with the measured DC is gamma-dependent).
"""
import argparse
import importlib.util
import json
import math
import multiprocessing as mp
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import cr  # noqa: E402

m4a, fabrics, fem, cusick = cr.m4a, cr.fabrics, cr.fem, cr.cusick
m3c, localhess = m4a.m3c, cr.localhess
_s = importlib.util.spec_from_file_location("m4c_run_d", HERE.parent / "m4c_locking" / "run.py")
m4c = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m4c)

CACHE = HERE / "cache"
LATTICES = (0.005, 0.00375)
GAMMAS = (0.01, 0.1, 1.0)
MAIN_G = 0.1
TOL = 1e-5


def tag(kind, code, a, gamma):
    return f"{kind}_{code}_{m4a.mm(a)}" + (f"_g{gamma:g}" if kind == "cr" else "")


def chain_job(job):
    kind, code, a, gamma, ratio = job
    out = CACHE / f"chain_{tag(kind, code, a, gamma)}.json"
    if out.exists():
        return json.loads(out.read_text())
    CACHE.mkdir(exist_ok=True)
    up = m4a.ladder(fabrics.ea_secant(code), ratio=ratio)
    if kind == "cr":
        sp = cr.CRDisc(code, up[0], a, gamma=gamma)
        X = sp.start(0)
        nw = cr.CRNewton(sp, X)
        meas = lambda X: dict(dc=sp.dc(X), folds=sp.folds(X), **sp.split(X))
    else:
        sp = m4a.FabricDisc(code, up[0], a, "fast")
        X = sp.start(0)
        nw = localhess.LocalNewton(sp, X)
        meas = lambda X: dict(dc=sp.dc(X), folds=cusick.nodes(X, sp), **m4c.split(sp, X))
    w = fem.GRAV * sp.mass.max()
    base = f"partial_{tag(kind, code, a, gamma)}"
    pj, pz = CACHE / f"{base}.json", (lambda k: CACHE / f"{base}_stage{k}.npy")
    rows = []
    if pj.exists():
        rows = json.loads(pj.read_text())
        X = np.load(pz(len(rows) - 1))
    for k in range(len(rows), len(up)):
        ea = up[k]
        t = time.time()
        sp.EA = ea
        X, info = m3c.stage(sp, nw, w, X)
        r = dict(kind=kind, code=code, a=a, gamma=gamma, ea=ea, n=sp.n, steps=info["iters"], gmax=info["gmax"] / w,
                 energy=float(sp.energy_grad(X[sp.free].ravel(), X)[0]), sec=time.time() - t)
        r["conv"] = bool(r["gmax"] < TOL)
        r.update(meas(X))
        print(f"{kind} {code} {m4a.mm(a)}mm g{gamma:g} EA {ea:.2f}: DC {r['dc']:.4f} folds {r['folds']} "
              f"Es {r['stretch']:.3e} Eg {r['shear']:.3e} Eb {r['bend']:.3e} Ej {r.get('stab', 0):.3e} "
              f"eps99 {r['eps99']:.2e} steps {r['steps']} conv {r['conv']} {r['sec']:.0f}s", flush=True)
        rows.append(r)
        np.save(pz(k), X)
        tmp = CACHE / f"{base}.json.tmp"
        tmp.write_text(json.dumps(rows))
        tmp.replace(pj)
    out.write_text(json.dumps(rows))
    return rows


def jobs(part):
    if part == "A":
        return [("cr", c, a, MAIN_G, 2.0) for a in LATTICES for c in fabrics.CODES]
    return ([("conf", c, 0.005, 0.0, 2.0) for c in fabrics.CODES]
            + [("cr", c, a, g, 4.0) for a in LATTICES for g in (0.01, 1.0) for c in fabrics.CODES])


def fit_p(rows):
    up = [dict(r, branch="up") for r in rows]
    return m4c.fit_p(up)


def load(kind, code, a, gamma):
    f = CACHE / f"chain_{tag(kind, code, a, gamma)}.json"
    return json.loads(f.read_text()) if f.exists() else None


def report():
    meas = {c: fabrics.TABLE[c][9] for c in fabrics.CODES}
    conf375 = json.loads((HERE.parent / "m4c_locking" / "results.json").read_text())["per"]
    L = ["hanger-codesign milestone 4d. The nonconforming (edge-midpoint) membrane on 4a's nine wovens.",
         "Seed 0, FAST inputs. Es stretch, Eg shear, Eb bending, Ej in-plane jump penalty (J); p = slope of",
         "ln Es on ln EA along the ladder at the EA 150 fold count (-1 locking-free); gamma = penalty / G.", ""]
    L.append("1. every stage: element fabric lattice gamma EA DC folds Es Eg Eb Ej eps99 steps conv")
    allrows, missing = [], []
    for kind, a, g in [("cr", a, g) for a in LATTICES for g in GAMMAS] + [("conf", 0.005, 0.0)]:
        for c in fabrics.CODES:
            rows = load(kind, c, a, g)
            if rows is None:
                missing.append(tag(kind, c, a, g))
                continue
            allrows += rows
            for r in rows:
                L.append(f"{kind:4} {c} {m4a.mm(a):>4} {g:4g} {r['ea']:8.2f} {r['dc']:.4f} {r['folds']:2d} "
                         f"{r['stretch']:.3e} {r['shear']:.3e} {r['bend']:.3e} {r.get('stab', 0):.3e} "
                         f"{r['eps99']:.2e} {r['steps']:3d} {int(r['conv'])}")
    if missing:
        L.append(f"missing chains: {', '.join(missing)}")
    L.append("")

    def end(kind, c, a, g):
        rows = load(kind, c, a, g)
        return None if rows is None else rows[-1]

    per = {}
    L.append("2. per fabric: p (stages) and DC(150) -> DC(secant) at gamma 0.1 on 5 | 3.75 mm; secant DC by gamma"
             " (0.01 / 0.1 / 1) on 5 | 3.75 mm; conforming secant DC 5 | 3.75 mm (4c); measured")
    for c in fabrics.CODES:
        s = {}
        for a in LATTICES:
            lab = m4a.mm(a)
            rows = load("cr", c, a, MAIN_G)
            if rows:
                p, nfit = fit_p(rows)
                s[lab] = dict(p=p, nfit=nfit, dc150=rows[0]["dc"], dcEA=rows[-1]["dc"], folds150=rows[0]["folds"],
                              foldsEA=rows[-1]["folds"], ea=rows[-1]["ea"])
            s[lab + "_gam"] = {f"{g:g}": (end("cr", c, a, g) or {}).get("dc") for g in GAMMAS}
        ce = end("conf", c, 0.005, 0.0)
        s["conf5"] = ce["dc"] if ce else None
        s["conf3.75"] = conf375[c]["3.75"]["dcEA"]
        per[c] = s
        f = lambda v, fm: "  -   " if v is None else format(v, fm)
        parts = []
        for lab in ("5", "3.75"):
            x = s.get(lab)
            parts.append("p -" if not x else f"p {f(x['p'], '+.3f')} ({x['nfit']}) {x['dc150']:.4f}->{x['dcEA']:.4f} "
                         f"folds {x['folds150']}/{x['foldsEA']}")
        gam = " | ".join("/".join(f(s[lab + "_gam"][f"{g:g}"], ".4f") for g in GAMMAS) for lab in ("5", "3.75"))
        L.append(f"{c} " + " | ".join(parts) + f" | gamma {gam} | conf {f(s['conf5'], '.4f')} {s['conf3.75']:.4f} | meas {meas[c]:.3f}")
    L.append("")

    def col(fn):
        v = [fn(c) for c in fabrics.CODES]
        return None if any(x is None for x in v) else v

    pred = {}
    conv = [r["conv"] for r in allrows]
    pred["D1"] = (all(conv) and not missing, f"{sum(conv)} of {len(conv)} stages converged" + (f"; {len(missing)} chains missing" if missing else ""))
    m = {c: per[c].get("3.75") for c in fabrics.CODES}
    if all(m.values()):
        ps = [m[c]["p"] for c in fabrics.CODES]
        n2 = sum(p is not None and p <= -0.8 for p in ps)
        pred["D2"] = (n2 >= 7, f"p <= -0.8 on {n2} of 9 (p: {', '.join('-' if p is None else f'{p:+.2f}' for p in ps)})")
        rise = [m[c]["dcEA"] - m[c]["dc150"] for c in fabrics.CODES]
        n3 = sum(abs(x) < 0.01 for x in rise)
        crise = [conf375[c]["3.75"]["dcEA"] - conf375[c]["3.75"]["dc150"] for c in fabrics.CODES]
        pred["D3"] = (n3 >= 8, f"|rise| < 0.01 on {n3} of 9 (rises: {', '.join(f'{x:+.4f}' for x in rise)}; "
                               f"conforming 3.75 mm, 4c: {', '.join(f'{x:+.4f}' for x in crise)})")
        sim = [m[c]["dcEA"] for c in fabrics.CODES]
        mv = [meas[c] for c in fabrics.CODES]
        bias = float(np.mean(np.subtract(sim, mv)))
        bconf = float(np.mean([per[c]["conf3.75"] - meas[c] for c in fabrics.CODES]))
        pred["D4"] = (bconf - bias >= 0.044 and bias >= 0, f"bias {bias:+.4f} (conforming 3.75 mm {bconf:+.4f}; drop {bconf - bias:+.4f})")
        sc = m4a.scores(sim, mv)
        pred["D6"] = (sc["rho"] >= 0.90, m4a.fmt(sc))
        pred["D7"] = (sc["rmse"] <= 0.08, m4a.fmt(sc))
        L.append("3. scores against the measured DC (secant EA):")
        L.append(f"  nonconforming 3.75 mm gamma 0.1: {m4a.fmt(sc)}")
        for lab in ("5",):
            if per["F1"].get(lab):
                L.append(f"  nonconforming 5 mm gamma 0.1:    {m4a.fmt(m4a.scores([per[c][lab]['dcEA'] for c in fabrics.CODES], mv))}")
        for lab in ("5", "3.75"):
            for g in (0.01, 1.0):
                v = col(lambda c: per[c][lab + "_gam"][f"{g:g}"])
                if v:
                    L.append(f"  nonconforming {lab} mm gamma {g:g}: {m4a.fmt(m4a.scores(v, mv))}")
        v = col(lambda c: per[c]["conf5"])
        if v:
            L.append(f"  conforming 5 mm:                 {m4a.fmt(m4a.scores(v, mv))}")
        L.append(f"  conforming 3.75 mm (4c):         {m4a.fmt(m4a.scores([per[c]['conf3.75'] for c in fabrics.CODES], mv))}")
        L.append("")
        five = {c: per[c].get("5") for c in fabrics.CODES}
        if all(five.values()):
            d = [abs(m[c]["dcEA"] - five[c]["dcEA"]) for c in fabrics.CODES]
            n8 = sum(x < 0.02 for x in d)
            pred["D8"] = (n8 >= 6, f"|DC(3.75) - DC(5)| < 0.02 on {n8} of 9 ({', '.join(f'{x:.4f}' for x in d)})")
    spread = {lab: col(lambda c: (None if None in (per[c][lab + "_gam"]["1"], per[c][lab + "_gam"]["0.01"])
                                  else per[c][lab + "_gam"]["1"] - per[c][lab + "_gam"]["0.01"])) for lab in ("5", "3.75")}
    if spread["5"] and spread["3.75"]:
        n5 = sum(abs(b) < abs(a) for a, b in zip(spread["5"], spread["3.75"]))
        mean = float(np.mean(spread["3.75"]))
        pred["D5"] = (n5 >= 7 and mean <= 0.05,
                      f"spread smaller on 3.75 mm on {n5} of 9; mean spread 5 mm {np.mean(spread['5']):+.4f}, 3.75 mm {mean:+.4f}")
    L.append("4. predictions")
    for k in sorted(pred):
        ok, txt = pred[k]
        L.append(f"{k} {'held' if ok else 'refuted'}: {txt}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "results.json").write_text(json.dumps(dict(per=per, measured=meas, spread=spread, kappa=cr.calibrate_kappa(),
                                                       predictions={k: dict(held=bool(v[0]), text=v[1]) for k, v in pred.items()}),
                                                  indent=1))
    print("\n".join(L[-14:]))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=("solve", "report"), default="report")
    ap.add_argument("--part", choices=("A", "B"), default="A")
    ap.add_argument("--procs", type=int, default=4)
    args = ap.parse_args()
    if args.phase == "solve":
        js = jobs(args.part)
        js.sort(key=lambda j: j[2])     # finest lattice first: the longest chains start early
        with mp.Pool(args.procs) as pool:
            for rows in pool.imap_unordered(chain_job, js):
                print("done", rows[0]["kind"], rows[0]["code"], rows[0]["a"], rows[0]["gamma"], flush=True)
    else:
        report()
