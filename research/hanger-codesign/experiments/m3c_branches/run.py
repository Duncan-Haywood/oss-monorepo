"""Milestone 3c: fold branches of the triangle element's Cusick drape. How wide is the seed
distribution of drape coefficient (DC) and fold count at each fabric's sourced stiffness, is the
suiting's milestone 3b mesh miss inside it, and which of 3b's discordant branches is lower in energy?

    python3 experiments/m3c_branches/run.py          (about two hours on 4 cores; numpy, scipy)
    python3 experiments/m3c_branches/run.py --quick  (seeds 0 and 1, 7.5 mm only, minutes)

Why: milestone 3b continued milestone 3a's element (constant-strain triangles, measured KES shear,
discrete-shell hinges, Newton) from the soft equilibrium and every stage converged. The jersey (A)
passed the Cusick acceptance test at its sourced tangent stiffness; the suiting (D) missed the 0.03
mesh bar by 0.004 to 0.006 through a 6-fold to 7-fold switch between the 3.75 and 2.5 mm lattices,
and in four cases a cold start and a continued solve converged to drape coefficients 0.05 to 0.32
apart. 3b ran one seed, so it could not say whether a 0.035 mesh change is larger than the spread
of branches a single lattice already admits, and it did not compare the branches' energies or check
that its end states are minima rather than saddles. A measured Cusick test reports DC and node
count over several specimens, so the comparable simulated quantity is a distribution, not one solve.

Method:
  Part 1 (seeds). 3b's protocol unchanged (3a's `Disc`, 30 cm specimen on an 18 cm disc, measured G;
  start = 5% tilt plus seeded noise of 2 mm amplitude; Newton, gtol 1e-5 node weights, cap 400 steps
  per stage), seeds 0 to 6 (seed 0 repeats 3b), lattices 3.75 and 2.5 mm, chains
      A: 150 -> 254 -> 369          D: 150 -> 800 -> 1341 -> 1896   (N/m)
  28 chains. Each end state records DC, fold count, total potential energy and the smallest
  Hessian eigenvalue (shift-invert Lanczos near zero on the coloured finite-difference Hessian;
  a negative value means a saddle). The eigenvalue is reported over the Hessian's median diagonal.
  Part 2 (branch energies). 3b's four discordant cases (A 800 at 7.5 mm, A 3200 at 7.5 and 5 mm,
  D 3200 at 3.75 mm): the cold seed-0 solve at that EA (3a's), and the continued seed-0 chain (3b's),
  each converged, compared on energy and the smallest eigenvalue.

Predictions (written before the first run; LOG.md, 2026-11-13, milestone 3c):
  B1  On D at 1896 N/m on the 2.5 mm lattice, the seven seeds land in at least 2 distinct fold counts.
  B2  Seed standard deviation of DC at the sourced stiffness (A 369, D 1896): at most 0.010 for A on
      both lattices; at least 0.015 for D on at least one lattice.
  B3  Revised acceptance: the seed-mean DC moves under 0.03 from 3.75 to 2.5 mm at both of D's
      sourced values (1341, 1896) and both of A's (254, 369).
  B4  On D at 1896, pooled over both lattices, fold count explains more than half the variance of
      DC (between-fold-count share of the sum of squares > 0.5).
  B5  In at least 3 of the 4 discordant cases the continued (lower-DC) branch has the lower energy.
  B6  Every converged end state, in both parts, is a local minimum (smallest eigenvalue > 0).
Acceptance for the sourced-stiffness use is B3: with the seed spread in hand, the mesh change of
the mean, not of one seed, is what a measured multi-specimen DC is compared against.
"""
import argparse
import json
import multiprocessing as mp
import sys
import time
from pathlib import Path

import numpy as np
import scipy.sparse.linalg as spla

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "m3_fem_tier"))
import run as m3  # noqa: E402  (milestone 3a's Disc, Newton set-up and Cusick scoring)
import fem  # noqa: E402
import newton  # noqa: E402
import cusick  # noqa: E402

CHAIN = {"A": (150.0, 254.0, 369.0), "D": (150.0, 800.0, 1341.0, 1896.0)}
SOURCED = {"A": (254.0, 369.0), "D": (1341.0, 1896.0)}
TOP = {"A": 369.0, "D": 1896.0}
AS = (0.00375, 0.0025)
SEEDS = tuple(range(7))
CAP = 400
# 3b's discordant cases: (fabric, EA, lattice), continued along 3b's chain
DISC = (("A", 800.0, 0.0075), ("A", 3200.0, 0.0075), ("A", 3200.0, 0.005), ("D", 3200.0, 0.00375))
CHAIN3B = {"A": (150.0, 254.0, 369.0, 800.0, 3200.0), "D": (150.0, 800.0, 1341.0, 1896.0, 3200.0)}


def setup(f, ea, a):
    sp = m3.Disc(f, ea, a, "kes")
    nw = newton.Newton(sp.n, [sp.T, np.column_stack([sp.hu, sp.hv, sp.ho1, sp.ho2])], sp.free)
    return sp, nw, fem.GRAV * sp.mass.max()


def stage(sp, nw, w, X):
    v, info = nw.solve(lambda u: sp.energy_grad(u, X), X[sp.free].ravel(), gtol=1e-5 * w, maxit=CAP)
    X = X.copy()
    X[sp.free] = v.reshape(-1, 3)
    return X, info


def lam_min(sp, nw, X):
    """Smallest Hessian eigenvalue near zero (shift-invert), over the median |diagonal|."""
    v = X[sp.free].ravel()
    grad = lambda u: sp.energy_grad(u, X)[1]
    H = nw.hessian(grad, v, grad(v), 1e-7)
    scale = float(np.median(np.abs(H.diagonal())))
    sigma = -1e-6 * scale
    vals = spla.eigsh(H, k=3, sigma=sigma, which="LM", return_eigenvectors=False, tol=1e-8)
    return float(vals.min()) / scale


def record(sp, nw, w, X, info, **kw):
    E = float(sp.energy_grad(X[sp.free].ravel(), X)[0])
    conv = bool(info["gmax"] < 1e-5 * w)
    return dict(kw, n=sp.n, dc=sp.dc(X), folds=cusick.nodes(X, sp), energy=E, steps=info["iters"],
                gmax=info["gmax"] / w, conv=conv, lam=lam_min(sp, nw, X) if conv else None)


def seed_chain(job):
    f, a, seed, chain = job
    sp, nw, w = setup(f, chain[0], a)
    X = sp.start(seed)
    out = []
    for ea in chain:
        t = time.time()
        sp.EA = ea
        X, info = stage(sp, nw, w, X)
        r = record(sp, nw, w, X, info, part=1, f=f, a=a, seed=seed, ea=ea, sec=time.time() - t)
        print(f"P1 {f} {a*1000:g}mm seed {seed} EA {ea:g}: DC {r['dc']:.4f} folds {r['folds']} "
              f"E {r['energy']:.6e} lam {r['lam']} steps {r['steps']} {r['sec']:.0f}s", flush=True)
        out.append(r)
    return out


def branch_job(job):
    kind, f, ea, a = job
    t = time.time()
    if kind == "cold":
        sp, nw, w = setup(f, ea, a)
        X, info = stage(sp, nw, w, sp.start(0))
    else:
        sp, nw, w = setup(f, CHAIN3B[f][0], a)
        X = sp.start(0)
        for e in CHAIN3B[f][:CHAIN3B[f].index(ea) + 1]:
            sp.EA = e
            X, info = stage(sp, nw, w, X)
    r = record(sp, nw, w, X, info, part=2, kind=kind, f=f, a=a, seed=0, ea=ea, sec=time.time() - t)
    print(f"P2 {kind} {f} {a*1000:g}mm EA {ea:g}: DC {r['dc']:.4f} folds {r['folds']} E {r['energy']:.6e} "
          f"lam {r['lam']} conv {r['conv']} {r['sec']:.0f}s", flush=True)
    return [r]


def run_job(job):
    return seed_chain(job[1:]) if job[0] == "seed" else branch_job(job[1:])


def sd(x):
    return float(np.std(x, ddof=1)) if len(x) > 1 else 0.0


def main(quick):
    lat = (0.0075,) if quick else AS
    seeds = SEEDS[:2] if quick else SEEDS
    jobs = [("seed", f, a, s, CHAIN[f]) for a in lat for f in CHAIN for s in seeds]
    if not quick:
        jobs += [("branch", k, f, ea, a) for (f, ea, a) in DISC for k in ("cold", "cont")]
    jobs.sort(key=lambda j: (j[2] if j[0] == "seed" else j[4], j[0]))      # finest lattice first
    t0 = time.time()
    with mp.Pool(4) as pool:
        rows = [r for rs in pool.imap_unordered(run_job, jobs, chunksize=1) for r in rs]
    tag = "_quick" if quick else ""
    (HERE / f"results{tag}.json").write_text(json.dumps(rows, indent=1))
    P1 = [r for r in rows if r["part"] == 1]
    o = ["milestone 3c: seed distribution of the triangle element's Cusick drape, and branch energies",
         "part 1: fabric EA a_mm seed nodes DC folds energy_J newton_steps gmax_over_w converged lam_min_over_median_diag sec"]
    key = lambda r: (r["f"], r["ea"], r["a"], r["seed"])
    for r in sorted(P1, key=key):
        lam = f"{r['lam']:.2e}" if r["lam"] is not None else "-"
        o.append(f"{r['f']} {r['ea']:g} {r['a']*1000:g} {r['seed']} {r['n']} {r['dc']:.4f} {r['folds']} "
                 f"{r['energy']:.8e} {r['steps']} {r['gmax']:.1e} {'yes' if r['conv'] else 'no'} {lam} {r['sec']:.0f}")
    o += ["", "summary over seeds (converged only): fabric EA a_mm n mean_DC sd_DC min max fold_counts"]
    S = {}
    for f in CHAIN:
        for ea in CHAIN[f]:
            for a in lat:
                rs = [r for r in P1 if (r["f"], r["ea"], r["a"]) == (f, ea, a) and r["conv"]]
                dc = [r["dc"] for r in rs]
                if not dc:
                    continue
                folds = {}
                for r in rs:
                    folds[r["folds"]] = folds.get(r["folds"], 0) + 1
                S[(f, ea, a)] = (float(np.mean(dc)), sd(dc), rs)
                o.append(f"{f} {ea:g} {a*1000:g} {len(dc)} {np.mean(dc):.4f} {sd(dc):.4f} {min(dc):.4f} {max(dc):.4f} "
                         + " ".join(f"{k}x{v}" for k, v in sorted(folds.items())))
    o.append("")
    if not quick:
        conv1 = sum(r["conv"] for r in P1)
        o.append(f"part 1 stages converged: {conv1} of {len(P1)}")
        fc = {r["folds"] for r in S[("D", 1896.0, 0.0025)][2]}
        o.append(f"B1 D 1896 at 2.5 mm fold counts {sorted(fc)}: {'held' if len(fc) >= 2 else 'refuted'}")
        sa = [S[("A", 369.0, a)][1] for a in AS]
        sdd = [S[("D", 1896.0, a)][1] for a in AS]
        b2 = max(sa) <= 0.010 and max(sdd) >= 0.015
        o.append(f"B2 seed sd A 369: {', '.join(f'{x:.4f}' for x in sa)}; D 1896: {', '.join(f'{x:.4f}' for x in sdd)}: "
                 f"{'held' if b2 else 'refuted'}")
        dm = {(f, ea): S[(f, ea, 0.0025)][0] - S[(f, ea, 0.00375)][0] for f in SOURCED for ea in SOURCED[f]}
        b3 = all(abs(v) < 0.03 for v in dm.values())
        o.append("B3 mean DC(2.5) - mean DC(3.75): " + ", ".join(f"{f} {ea:g} {v:+.4f}" for (f, ea), v in dm.items())
                 + f": {'held' if b3 else 'refuted'}")
        for (f, ea), v in dm.items():
            x, y = [r["dc"] for r in S[(f, ea, 0.0025)][2]], [r["dc"] for r in S[(f, ea, 0.00375)][2]]
            se = (np.var(x, ddof=1) / len(x) + np.var(y, ddof=1) / len(y)) ** 0.5
            o.append(f"   {f} {ea:g}: difference {v:+.4f}, Welch standard error {se:.4f}")
        rs = S[("D", 1896.0, 0.0025)][2] + S[("D", 1896.0, 0.00375)][2]
        dc = np.array([r["dc"] for r in rs])
        tot = float(((dc - dc.mean()) ** 2).sum())
        btw = sum(len(g) * (np.mean(g) - dc.mean()) ** 2
                  for g in [[r["dc"] for r in rs if r["folds"] == k] for k in {r["folds"] for r in rs}])
        share = btw / tot if tot > 0 else float("nan")
        o.append(f"B4 D 1896 pooled: between-fold-count share of DC sum of squares {share:.3f}: "
                 f"{'held' if share > 0.5 else 'refuted'}")
        P2 = {(r["kind"], r["f"], r["ea"], r["a"]): r for r in rows if r["part"] == 2}
        o += ["", "part 2: case kind DC folds energy_J converged lam_min_over_median_diag steps"]
        wins, ncmp = 0, 0
        for f, ea, a in DISC:
            c, k = P2[("cold", f, ea, a)], P2[("cont", f, ea, a)]
            for r in (c, k):
                lam = f"{r['lam']:.2e}" if r["lam"] is not None else "-"
                o.append(f"{f} {ea:g} {a*1000:g} {r['kind']} {r['dc']:.4f} {r['folds']} {r['energy']:.8e} "
                         f"{'yes' if r['conv'] else 'no'} {lam} {r['steps']}")
            if c["conv"] and k["conv"]:
                ncmp += 1
                lo = k if k["dc"] < c["dc"] else c
                hi = c if lo is k else k
                wins += lo["energy"] < hi["energy"]
                o.append(f"   lower-DC branch ({lo['kind']}) energy minus higher-DC: {lo['energy'] - hi['energy']:+.3e} J")
        o.append(f"B5 lower-DC branch has lower energy in {wins} of {ncmp} compared: {'held' if wins >= 3 else 'refuted'}")
        lams = [r["lam"] for r in rows if r["conv"]]
        neg = [r for r in rows if r["conv"] and r["lam"] <= 0]
        o.append(f"B6 converged end states with lam_min <= 0: {len(neg)} of {len(lams)}: {'held' if not neg else 'refuted'}")
        o.append(f"acceptance (B3): {'passed' if b3 else 'failed'}")
    o.append(f"wall {time.time()-t0:.0f}s")
    (HERE / f"results{tag}.txt").write_text("\n".join(o) + "\n")
    print("\n".join(o))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    main(ap.parse_args().quick)
