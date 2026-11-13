"""Milestone 3c, post hoc (written after results.txt was read; not registered).

    python3 experiments/m3c_branches/posthoc.py     (about 10 minutes on 2 cores; numpy, scipy)

1. The two end states B6 flagged (smallest Hessian eigenvalue <= 0, both D on the 3.75 mm lattice):
   are they saddles, or minima read through finite-difference noise? Each chain is re-run
   (deterministic), the smallest eigenvalue recomputed at difference steps 1e-6, 1e-7 and 1e-8 m,
   and the state pushed both ways along its eigenvector (largest node move 0.5 mm) and re-solved
   with the same Newton settings. A saddle descends to a lower energy on at least one side; a
   minimum returns to the same energy.
2. From results.json, no new simulation: the lowest-energy seed per fabric, EA and lattice, and
   how its DC moves from 3.75 to 2.5 mm, against the seed mean (B3) and seed 0 (milestone 3b);
   the suiting's seed-mean change without seed 0 at 3.75 mm; energy-DC correlation across seeds.
"""
import json
import multiprocessing as mp
import sys
from pathlib import Path

import numpy as np
import scipy.sparse.linalg as spla

HERE = Path(__file__).resolve().parent
import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location("m3c_run", HERE / "run.py")   # run.py itself imports 3a's "run"
m3c = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m3c)

CASES = (("D", 0.00375, 3, 150.0), ("D", 0.00375, 2, 1341.0))


def lam_vec(sp, nw, X, eps):
    v = X[sp.free].ravel()
    grad = lambda u: sp.energy_grad(u, X)[1]
    H = nw.hessian(grad, v, grad(v), eps)
    scale = float(np.median(np.abs(H.diagonal())))
    vals, vecs = spla.eigsh(H, k=3, sigma=-1e-6 * scale, which="LM", tol=1e-8)
    i = int(np.argmin(vals))
    return float(vals[i]) / scale, vecs[:, i]


def one(case):
    f, a, seed, ea_end = case
    sp, nw, w = m3c.setup(f, m3c.CHAIN[f][0], a)
    X = sp.start(seed)
    for ea in m3c.CHAIN[f][:m3c.CHAIN[f].index(ea_end) + 1]:
        sp.EA = ea
        X, info = m3c.stage(sp, nw, w, X)
    E0 = float(sp.energy_grad(X[sp.free].ravel(), X)[0])
    out = dict(f=f, a=a, seed=seed, ea=ea_end, dc=sp.dc(X), folds=m3c.cusick.nodes(X, sp), energy=E0,
               gmax=info["gmax"] / w, lam={}, push=[])
    for eps in (1e-6, 1e-7, 1e-8):
        lam, vec = lam_vec(sp, nw, X, eps)
        out["lam"][f"{eps:g}"] = lam
        if eps == 1e-7:
            v7 = vec
    d = v7.reshape(-1, 3)
    d = d / np.abs(np.linalg.norm(d, axis=1)).max() * 5e-4
    for sgn in (1, -1):
        Y = X.copy()
        Y[sp.free] += sgn * d
        Z, inf = m3c.stage(sp, nw, w, Y)
        E = float(sp.energy_grad(Z[sp.free].ravel(), Z)[0])
        out["push"].append(dict(sign=sgn, dc=sp.dc(Z), folds=m3c.cusick.nodes(Z, sp), dE=E - E0,
                                conv=bool(inf["gmax"] < 1e-5 * w), steps=inf["iters"]))
    return out


def main():
    rows = json.loads((HERE / "results.json").read_text())
    with mp.Pool(2) as pool:
        res = pool.map(one, CASES)
    o = ["milestone 3c post hoc (not registered)", "",
         "1. B6's two flagged states: rerun, smallest eigenvalue over median diagonal at three difference steps, "
         "and a 0.5 mm push each way along its eigenvector, re-solved"]
    for r in res:
        o.append(f"{r['f']} {r['a']*1000:g} mm seed {r['seed']} EA {r['ea']:g}: DC {r['dc']:.4f} folds {r['folds']} "
                 f"E {r['energy']:.8e} gmax/w {r['gmax']:.1e}")
        o.append("   lam_min: " + ", ".join(f"eps {k}: {v:+.2e}" for k, v in r["lam"].items()))
        for p in r["push"]:
            o.append(f"   push {p['sign']:+d}: DC {p['dc']:.4f} folds {p['folds']} dE {p['dE']:+.3e} J "
                     f"converged {'yes' if p['conv'] else 'no'} steps {p['steps']}")
    o += ["", "2. lowest-energy seed per case (energies compared within one lattice only) and its DC change 3.75 -> 2.5 mm",
          "fabric EA | lowest-E seed: 3.75 mm (seed, folds, DC) | 2.5 mm (seed, folds, DC) | change | seed-mean change | seed-0 change"]
    P1 = [r for r in rows if r["part"] == 1 and r["conv"]]
    for f in m3c.SOURCED:
        for ea in m3c.CHAIN[f]:
            g = {a: [r for r in P1 if (r["f"], r["ea"], r["a"]) == (f, ea, a)] for a in m3c.AS}
            lo = {a: min(g[a], key=lambda r: r["energy"]) for a in m3c.AS}
            mean = {a: np.mean([r["dc"] for r in g[a]]) for a in m3c.AS}
            s0 = {a: next(r["dc"] for r in g[a] if r["seed"] == 0) for a in m3c.AS}
            c, k = lo[0.00375], lo[0.0025]
            o.append(f"{f} {ea:g} | {c['seed']}, {c['folds']}, {c['dc']:.4f} | {k['seed']}, {k['folds']}, {k['dc']:.4f} | "
                     f"{k['dc'] - c['dc']:+.4f} | {mean[0.0025] - mean[0.00375]:+.4f} | {s0[0.0025] - s0[0.00375]:+.4f}")
    o += ["", "2b. D seed-mean DC change 3.75 -> 2.5 mm with seed 0 (3b's 6-fold state at 3.75 mm) dropped from 3.75 mm"]
    for ea in m3c.CHAIN["D"]:
        x = [r["dc"] for r in P1 if (r["f"], r["ea"], r["a"]) == ("D", ea, 0.00375) and r["seed"] != 0]
        y = [r["dc"] for r in P1 if (r["f"], r["ea"], r["a"]) == ("D", ea, 0.0025)]
        o.append(f"D {ea:g}: {np.mean(y) - np.mean(x):+.4f}")
    o += ["", "3. within-case correlation of energy and DC across the seven seeds (sourced EA)"]
    for f in m3c.SOURCED:
        for ea in m3c.SOURCED[f]:
            for a in m3c.AS:
                g = [r for r in P1 if (r["f"], r["ea"], r["a"]) == (f, ea, a)]
                c = np.corrcoef([r["energy"] for r in g], [r["dc"] for r in g])[0, 1]
                o.append(f"{f} {ea:g} {a*1000:g} mm: r(E, DC) = {c:+.2f}")
    (HERE / "posthoc.txt").write_text("\n".join(o) + "\n")
    (HERE / "posthoc.json").write_text(json.dumps(res, indent=1))
    print("\n".join(o))


if __name__ == "__main__":
    main()
