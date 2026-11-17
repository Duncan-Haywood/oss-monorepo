"""Milestone 3b: continuation in stretch stiffness on milestone 3a's triangle element, and the
Cusick acceptance test at each fabric's sourced tangent stiffness.

    python3 experiments/m3b_continuation/run.py          (one to three hours on 4 cores; numpy, scipy)
    python3 experiments/m3b_continuation/run.py --quick  (7.5 and 5 mm only, minutes)

Why: milestone 3a's element converged on the soft jersey (A) only at EA 150 N/m; 9 of its 32
Cusick solves hit the 400-step Newton cap with residuals 8 to 1e4 node weights, so those drape
coefficients (DC) are not equilibria, and 3a could not say whether the jersey's mesh and EA
dependence is membrane locking or a solver that never arrived. 3a's Next asked for a continuation
in EA, and for fabric A at its sourced tangent stiffness. Milestone 1d's post hoc
(`m1d_measured_shear/posthoc_tangent.py`, from the KES-FB tensile LT, WT and EMT of `hanger-kes`)
puts the tangent at garment load (and half of it) at 369 (254) N/m for A and 1,896 (1,341) N/m for
D. Those are the EA values a measured drape should be compared at.

Method: 3a's `Disc` (30 cm specimen, 18 cm disc), measured KES shear G, lattices a = 7.5, 5, 3.75,
2.5 mm. Per fabric and lattice one chain: a cold solve at EA 150 from 3a's start (seed 0, the same
as 3a, so it reproduces 3a's EA 150 row), then each next EA started from the previous equilibrium:
  A: 150 -> 254 -> 369 -> 800 -> 3200
  D: 150 -> 800 -> 1341 -> 1896 -> 3200
Newton as 3a (gtol 1e-5 of the heaviest node's weight), cap 400 steps per stage. A stage that
stalls passes its last iterate on. "Converged" means max |g| < gtol at exit.

Predictions (written before the first run; LOG.md, 2026-11-13, milestone 3b):
  G1  Every A stage at EA <= 369 converges, on every lattice (12 of 12).
  G2  At A's sourced EA (254 and 369), DC moves by under 0.03 from a = 3.75 to 2.5 mm
      (3a's acceptance test F3, at the stiffness the fabric has).
  G3  At a = 2.5 mm, |DC(369) - DC(150)| on A is under 0.03 (3a's F4 over the sourced range).
  G4  Continuation converges A at EA 800 on all four lattices (cold start: 2 of 4).
  G5  Continuation converges A at EA 3200 on at least 3 of 4 lattices (cold start: 2 of 4).
  G6  Where a cold 3a solve and a continued solve both converged at the same case, their DC agree
      within 0.03 (one equilibrium branch, not several).
  G7  D at its sourced EA (1341 and 1896): DC moves by under 0.03 from 3.75 to 2.5 mm, and every D
      stage converges.
Acceptance for the sourced-stiffness use (the programme's practical question: can this element be
the top tier for these two fabrics if it is run at their own stiffness?): G2 and G7's mesh clause.
"""
import argparse
import json
import multiprocessing as mp
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "m3_fem_tier"))
import run as m3  # noqa: E402  (milestone 3a's Disc, Newton set-up and Cusick scoring)
import fem  # noqa: E402
import newton  # noqa: E402
import cusick  # noqa: E402

CHAIN = {"A": (150.0, 254.0, 369.0, 800.0, 3200.0), "D": (150.0, 800.0, 1341.0, 1896.0, 3200.0)}
SOURCED = {"A": (254.0, 369.0), "D": (1341.0, 1896.0)}
AS = (0.0075, 0.005, 0.00375, 0.0025)
CAP = 400

# milestone 3a's cold-start results (results_cusick.txt): DC, converged?
COLD = {}
for line in (HERE.parent / "m3_fem_tier" / "results_cusick.txt").read_text().splitlines():
    p = line.split()
    if len(p) == 10 and p[3] == "kes" and p[0] in "AD":
        COLD[(p[0], float(p[1]), float(p[2]) / 1000)] = (float(p[5]), float(p[7]) < 1e-5)


def chain(job):
    f, a = job
    sp = m3.Disc(f, CHAIN[f][0], a, "kes")
    X = sp.start(0)
    w = fem.GRAV * sp.mass.max()
    nw = newton.Newton(sp.n, [sp.T, np.column_stack([sp.hu, sp.hv, sp.ho1, sp.ho2])], sp.free)
    out = []
    for ea in CHAIN[f]:
        t = time.time()
        sp.EA = ea
        v, info = nw.solve(lambda u: sp.energy_grad(u, X), X[sp.free].ravel(), gtol=1e-5 * w, maxit=CAP)
        X = X.copy()
        X[sp.free] = v.reshape(-1, 3)
        r = dict(f=f, a=a, ea=ea, n=sp.n, dc=sp.dc(X), steps=info["iters"], gmax=info["gmax"] / w,
                 conv=bool(info["gmax"] < 1e-5 * w), folds=cusick.nodes(X, sp), sec=time.time() - t)
        print(f"{f} {a*1000:g}mm EA {ea:g}: DC {r['dc']:.4f} steps {r['steps']} g/w {r['gmax']:.1e} "
              f"{r['sec']:.0f}s", flush=True)
        out.append(r)
    return out


def main(quick):
    lat = AS[:2] if quick else AS
    jobs = sorted([(f, a) for f in CHAIN for a in lat], key=lambda j: j[1])   # finest first
    t0 = time.time()
    with mp.Pool(4) as pool:
        rows = [r for rs in pool.map(chain, jobs, chunksize=1) for r in rs]
    (HERE / ("results_quick.json" if quick else "results.json")).write_text(json.dumps(rows, indent=1))
    R = {(r["f"], r["ea"], r["a"]): r for r in rows}
    o = ["milestone 3b: EA continuation on milestone 3a's triangle element (Cusick, measured G)",
         "fabric EA a_mm nodes DC newton_steps gmax_over_node_weight converged folds sec cold3a_DC cold3a_converged"]
    for f in CHAIN:
        for ea in CHAIN[f]:
            for a in lat:
                r = R[(f, ea, a)]
                c = COLD.get((f, ea, a))
                cs = f"{c[0]:.4f} {'yes' if c[1] else 'no'}" if c else "- -"
                o.append(f"{f} {ea:g} {a*1000:g} {r['n']} {r['dc']:.4f} {r['steps']} {r['gmax']:.1e} "
                         f"{'yes' if r['conv'] else 'no'} {r['folds']} {r['sec']:.0f} {cs}")
    o += ["", "fabric EA " + " ".join(f"DC@{a*1000:g}mm" for a in lat) + "  (* = not converged)"]
    for f in CHAIN:
        for ea in CHAIN[f]:
            o.append(f"{f} {ea:g} " + " ".join(f"{R[(f, ea, a)]['dc']:.4f}{'' if R[(f, ea, a)]['conv'] else '*'}" for a in lat))
    o.append("")
    if not quick:
        g1 = [R[("A", ea, a)]["conv"] for ea in (150.0, 254.0, 369.0) for a in AS]
        o.append(f"G1 A stages at EA <= 369 converged: {sum(g1)} of 12: {'held' if all(g1) else 'refuted'}")
        d = {ea: R[("A", ea, 0.0025)]["dc"] - R[("A", ea, 0.00375)]["dc"] for ea in SOURCED["A"]}
        o.append("G2 A DC(2.5) - DC(3.75): " + ", ".join(f"EA {k:g} {v:+.4f}" for k, v in d.items())
                 + f": {'held' if all(abs(v) < 0.03 for v in d.values()) else 'refuted'}")
        g2 = all(abs(v) < 0.03 for v in d.values())
        x = R[("A", 369.0, 0.0025)]["dc"] - R[("A", 150.0, 0.0025)]["dc"]
        o.append(f"G3 A at 2.5 mm DC(369) - DC(150) {x:+.4f}: {'held' if abs(x) < 0.03 else 'refuted'}")
        g4 = [R[("A", 800.0, a)]["conv"] for a in AS]
        o.append(f"G4 A at EA 800 converged on {sum(g4)} of 4: {'held' if all(g4) else 'refuted'}")
        g5 = [R[("A", 3200.0, a)]["conv"] for a in AS]
        o.append(f"G5 A at EA 3200 converged on {sum(g5)} of 4: {'held' if sum(g5) >= 3 else 'refuted'}")
        both = [(k, COLD[k][0], R[k]["dc"]) for k in R if k in COLD and COLD[k][1] and R[k]["conv"]]
        bad = [b for b in both if abs(b[1] - b[2]) >= 0.03]
        o.append(f"G6 cases converged both ways: {len(both)}; |cold - continued| >= 0.03 in {len(bad)}: "
                 f"{'held' if not bad else 'refuted'}")
        for k, c, r in both:
            o.append(f"   {k[0]} EA {k[1]:g} {k[2]*1000:g} mm: cold {c:.4f}, continued {r:.4f}, diff {r-c:+.4f}")
        d = {ea: R[("D", ea, 0.0025)]["dc"] - R[("D", ea, 0.00375)]["dc"] for ea in SOURCED["D"]}
        g7m = all(abs(v) < 0.03 for v in d.values())
        g7c = all(R[("D", ea, a)]["conv"] for ea in CHAIN["D"] for a in AS)
        o.append("G7 D DC(2.5) - DC(3.75): " + ", ".join(f"EA {k:g} {v:+.4f}" for k, v in d.items())
                 + f"; every D stage converged: {g7c}: {'held' if g7m and g7c else 'refuted'}")
        o.append(f"acceptance at sourced stiffness (G2 and G7's mesh clause): {'passed' if g2 and g7m else 'failed'}")
    o.append(f"wall {time.time()-t0:.0f}s")
    (HERE / ("results_quick.txt" if quick else "results.txt")).write_text("\n".join(o) + "\n")
    print("\n".join(o))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    main(ap.parse_args().quick)
