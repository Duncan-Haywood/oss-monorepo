"""Milestone 2b: is the drape coefficient's dependence on stretch stiffness physics or membrane
locking? A mesh-refinement study of milestone 2a's simulated Cusick test.

    python3 experiments/m2b_locking/run.py      (about an hour on 4 cores; needs numpy)

Milestone 2a found that on the spring sheet the drape coefficient (DC) climbs with EA (fabric A:
0.19, 0.36, 0.57, 0.78 at EA 150, 800, 3200, 12,800 N/m) and that a coarser grid raises it
further, and read that as membrane locking. Two readings remain open. (i) Locking: a converged
discretisation of a nearly inextensible sheet should not care about EA once gravity strains are
negligible (here under 0.1% even at EA 150, a back-of-envelope W g L / EA with L = 6 cm), so DC at
high EA should fall as the grid is refined and the EA dependence should shrink. (ii) Physics of a
soft membrane: at low EA the overhang can shorten its circumference by compressing in-plane rather
than by folding, which a real woven or knit, whose in-plane compression is resisted by buckling
at the yarn scale, does not do freely. Then low-EA DC is wrong for the opposite reason, and the
mesh-converged high-EA value is the physical one. This step refines the grid (7.5, 5, 3.75 and
2.5 mm) at EA 150, 800 and 3200 N/m on fabrics A (softest) and D (stiffest), and reads the
overhang's in-plane strain on the axis springs to tell the two apart.

Solver and stopping rule: milestone 2a's `cusick.solve` unchanged (chunks of 2000 L-BFGS
iterations until DC moves under 0.001), cap raised to 100,000. Seed 0 throughout, plus seed 1 at
EA 3200 on the 3.75 mm grid. 26 cases (a 2.5 mm energy evaluation costs about 22 ms, eight times
the 7.5 mm one, so the second seed is not affordable on the finest grid).

Predictions, written before the first run (LOG.md, 2026-11-11, milestone 2b):
  L1  Locking: at EA 3200, DC falls monotonically as h goes 7.5 -> 5 -> 3.75 -> 2.5 mm on both
      fabrics, by at least 0.05 in total. Refuted by a rise at any step or a smaller total fall.
  L2  The EA dependence is mostly numerical: DC(3200) - DC(800) at 2.5 mm is under half its value
      at 5 mm on both fabrics.
  L3  Locking grows with EA: the 7.5 -> 2.5 mm change in DC is larger at EA 3200 than at EA 150
      on both fabrics.
  L4  Soft-membrane compression: on the 5 mm grid at EA 150, the mean compressive strain of the
      overhang's compressed axis springs exceeds 1% on both fabrics, and at EA 3200 it is under
      0.3%.
  L5  Not converged yet: even at 2.5 mm, EA 800 and 3200 differ in DC by more than 0.03 on at least
      one fabric (so a spring grid fine enough for this test is out of reach on modest hardware).
"""
import multiprocessing as mp
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "m2_cusick"))
sys.path.insert(0, str(HERE.parents[2] / "hanger-kes" / "src"))
import cusick  # noqa: E402
from hanger_kes.kes import KES  # noqa: E402

FABRICS = ("A", "D")
EAS = (150.0, 800.0, 3200.0)
HS = (0.0075, 0.005, 0.00375, 0.0025)
CASES = ([(f, ea, h, 0) for f in FABRICS for ea in EAS for h in HS]
         + [(f, 3200.0, 0.00375, 1) for f in FABRICS])


def strains(sp, X):
    """In-plane strain of the axis springs with both ends in the overhang (rho0 > disc + h)."""
    out = sp.rho0 > cusick.R_DISC + sp.h
    eps = []
    for a, b, L0, _ in sp.springs[:2]:
        ok = out[a] & out[b]
        L = np.linalg.norm(X[b[ok]] - X[a[ok]], axis=1)
        eps.append(L / L0 - 1)
    e = np.concatenate(eps)
    c = e[e < 0]
    return dict(comp_share=float((e < 0).mean()), comp_mean=float(-c.mean()) if len(c) else 0.0,
                comp_p95=float(-np.percentile(c, 5)) if len(c) else 0.0, tens_max=float(e.max()))


def one(c):
    f, ea, h, s = c
    _, B, W = KES[f]
    t = time.time()
    sp = cusick.Specimen(B, W, ea, h=h)
    r = cusick.solve(sp, s, maxit=100000)
    st = strains(sp, r["X"])
    return c, dict(dc=r["dc"], iters=r["iters"], last=r["last_change"], nodes=r["nodes"],
                   n=sp.n, drop=r["drop"], sec=time.time() - t, **st)


def mean_dc(res, f, ea, h):
    return float(np.mean([v["dc"] for k, v in res.items() if k[:3] == (f, ea, h)]))


if __name__ == "__main__":
    t0 = time.time()
    order = sorted(CASES, key=lambda c: (c[2], -c[1]))      # finest, stiffest first
    res = {}
    with mp.Pool() as pool:
        for c, r in pool.imap_unordered(one, order):
            res[c] = r
            print(c, f"{r['dc']:.4f} {r['iters']} {r['sec']:.0f}s", flush=True)
    out = ["milestone 2b: simulated Cusick DC against grid spacing h and EA",
           "fabric EA h_mm seed nodes_mesh DC iters last_change folds comp_share comp_mean comp_p95 tens_max sec"]
    for c in CASES:
        r = res[c]
        out.append(f"{c[0]} {c[1]:g} {c[2]*1000:g} {c[3]} {r['n']} {r['dc']:.4f} {r['iters']} {r['last']:.5f} "
                   f"{r['nodes']} {r['comp_share']:.3f} {r['comp_mean']:.5f} {r['comp_p95']:.5f} "
                   f"{r['tens_max']:.5f} {r['sec']:.0f}")
    out += ["", "fabric EA " + " ".join(f"DC@{h*1000:g}mm" for h in HS)]
    for f in FABRICS:
        for ea in EAS:
            out.append(f"{f} {ea:g} " + " ".join(f"{mean_dc(res, f, ea, h):.4f}" for h in HS))
    out.append("")
    v = []
    for f in FABRICS:
        d = [mean_dc(res, f, 3200.0, h) for h in HS]
        mono = all(d[i + 1] < d[i] for i in range(3))
        v.append(mono and d[0] - d[-1] >= 0.05)
        out.append(f"L1 {f}: DC(3200) by h {['%.4f' % x for x in d]} monotone_fall={mono} total_fall={d[0]-d[-1]:.4f}")
    out.append(f"L1 {'held' if all(v) else 'refuted'}")
    v = []
    for f in FABRICS:
        g5 = mean_dc(res, f, 3200.0, 0.005) - mean_dc(res, f, 800.0, 0.005)
        g25 = mean_dc(res, f, 3200.0, 0.0025) - mean_dc(res, f, 800.0, 0.0025)
        v.append(abs(g25) < 0.5 * abs(g5))
        out.append(f"L2 {f}: DC(3200)-DC(800) at 5 mm {g5:.4f}, at 2.5 mm {g25:.4f}")
    out.append(f"L2 {'held' if all(v) else 'refuted'}")
    v = []
    for f in FABRICS:
        d150 = mean_dc(res, f, 150.0, 0.0075) - mean_dc(res, f, 150.0, 0.0025)
        d3200 = mean_dc(res, f, 3200.0, 0.0075) - mean_dc(res, f, 3200.0, 0.0025)
        v.append(abs(d3200) > abs(d150))
        out.append(f"L3 {f}: 7.5->2.5 mm change at EA 150 {d150:.4f}, at EA 3200 {d3200:.4f}")
    out.append(f"L3 {'held' if all(v) else 'refuted'}")
    v = []
    for f in FABRICS:
        c150 = res[(f, 150.0, 0.005, 0)]["comp_mean"]
        c3200 = res[(f, 3200.0, 0.005, 0)]["comp_mean"]
        v.append(c150 > 0.01 and c3200 < 0.003)
        out.append(f"L4 {f}: mean compressive strain at 5 mm, EA 150 {c150:.5f}, EA 3200 {c3200:.5f}")
    out.append(f"L4 {'held' if all(v) else 'refuted'}")
    gaps = [abs(mean_dc(res, f, 3200.0, 0.0025) - mean_dc(res, f, 800.0, 0.0025)) for f in FABRICS]
    out.append(f"L5 gaps at 2.5 mm {['%.4f' % g for g in gaps]}: {'held' if max(gaps) > 0.03 else 'refuted'}")
    out.append(f"wall {time.time()-t0:.0f}s")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
