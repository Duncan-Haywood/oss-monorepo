"""Post hoc (not registered; written after results.txt was read): does milestone 3c's 7-fold suiting
state, the lowest-energy one at 2.5 mm, still exist on the 1.875 mm lattice, and is it lower in
energy than the 8-fold state that the registered rule picked there?

    python3 experiments/m3d_local_hessian/posthoc.py   (about 40 min, 2 processes)

Why: S1 failed on D because the lowest-energy DC jumped +0.0205 from 2.5 to 1.875 mm, and with it
the lowest-energy fold count went from 7 to 8; none of the seven 1.875 mm seeds found a 7-fold
state. So it is open whether the rule failed because the pattern moved, or because seven seeds
did not sample it.

Method: (1) rerun 3c's seed-0 D chain at 2.5 mm with 3c's own solver (the coloured Hessian,
deterministic, so it should land in 3c's 7-fold row: DC 0.5807 at 1896 N/m); (2) interpolate that
end state's positions onto the 1.875 mm rest nodes (piecewise linear on the 2.5 mm rest mesh,
of the displacement, nearest node's displacement outside its hull), and solve at 1896 N/m with the local-Hessian Newton; (3) compare
DC, folds, energy and smallest eigenvalue with the 1.875 mm rows in results.json.
(4) The same transfer for 3c's 2.5 mm jersey state with the lowest energy (A seed 6, 369 N/m).
"""
import importlib.util
import json
import multiprocessing as mp
import sys
import time
from pathlib import Path

import numpy as np
from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator

HERE = Path(__file__).resolve().parent
_s = importlib.util.spec_from_file_location("m3d_run", HERE / "run.py")   # this milestone's run.py,
m3d = importlib.util.module_from_spec(_s)                                 # loaded under its own name
_s.loader.exec_module(m3d)                                                # (it imports 3a's as "run")

m3c, m3, fem, cusick, localhess = m3d.m3c, m3d.m3, m3d.fem, m3d.cusick, m3d.localhess


def job(spec):
    f, seed = spec
    t = time.time()
    sp, nw, w = m3c.setup(f, m3c.CHAIN[f][0], 0.0025)       # 3c's solver, unchanged
    X = sp.start(seed)
    for ea in m3c.CHAIN[f]:
        sp.EA = ea
        X, info = m3c.stage(sp, nw, w, X)
    src = m3c.record(sp, nw, w, X, info, f=f, a=0.0025, seed=seed, ea=ea)
    # transfer
    tg = m3.Disc(f, ea, 0.001875, "kes")
    np.savez_compressed(Path("/tmp") / f"m3d_posthoc_state_{f}.npz", P=sp.P, X=X)   # scratch, not committed
    U = X - sp.X0                                    # interpolate displacements, not positions, so
    lin = LinearNDInterpolator(sp.P, U)              # nodes outside the coarse hull keep their rest
    near = NearestNDInterpolator(sp.P, U)            # offsets instead of collapsing onto one node
    D = lin(tg.P)
    bad = np.isnan(D).any(1)
    D[bad] = near(tg.P[bad])
    Y = tg.X0 + D
    Y[tg.fixed] = tg.X0[tg.fixed]
    nw2, w2 = localhess.LocalNewton(tg, Y), fem.GRAV * tg.mass.max()
    Y, info2 = m3c.stage(tg, nw2, w2, Y)
    out = m3c.record(tg, nw2, w2, Y, info2, f=f, a=0.001875, seed=seed, ea=ea, sec=time.time() - t)
    return dict(source=src, transferred=out, n_outside_hull=int(bad.sum()))


def main():
    with mp.Pool(2) as pool:
        res = pool.map(job, [("D", 0), ("A", 6)], chunksize=1)
    rows = json.loads((HERE / "results.json").read_text())["rows"]
    o = ["milestone 3d post hoc: 3c's lowest-energy 2.5 mm state carried to the 1.875 mm lattice",
         "case: DC folds energy_J lam_min converged steps"]
    for r in res:
        s, t = r["source"], r["transferred"]
        f, ea = s["f"], s["ea"]
        o.append(f"{f} {ea:g} 2.5 mm seed {s['seed']} rerun (3c solver): {s['dc']:.4f} {s['folds']} {s['energy']:.8e} "
                 f"{s['lam']:.2e} {s['conv']}")
        o.append(f"{f} {ea:g} transferred to 1.875 mm: {t['dc']:.4f} {t['folds']} {t['energy']:.8e} "
                 f"{t['lam'] if t['lam'] is None else format(t['lam'], '.2e')} {t['conv']} {t['steps']} "
                 f"({r['n_outside_hull']} nodes outside the 2.5 mm hull)")
        same = [x for x in rows if (x["f"], x["ea"], x["a"]) == (f, ea, 0.001875) and x["conv"]]
        lo = min(same, key=lambda x: x["energy"])
        o.append(f"   1.875 mm seeds: lowest energy {lo['energy']:.8e} (seed {lo['seed']}, {lo['folds']} folds, DC "
                 f"{lo['dc']:.4f}); transferred minus that: {t['energy'] - lo['energy']:+.3e} J; "
                 f"rank among seeds plus transfer: {1 + sum(x['energy'] < t['energy'] for x in same)} of {len(same) + 1}")
    (HERE / "posthoc.json").write_text(json.dumps(res, indent=1))
    (HERE / "posthoc.txt").write_text("\n".join(o) + "\n")
    print("\n".join(o))


if __name__ == "__main__":
    main()
