"""Milestone 1b: does the 3 cm arm's choice of arm width survive when the 3D sheet is solved to
convergence instead of stopped at 3000 L-BFGS iterations?

    python3 experiments/m1b_converged/run.py     (about 20 to 30 min on 4 cores; needs numpy)

Milestone 1 found that on the 3 cm half-depth arm, 3000 and 6000 iterations differ by 0.110 cm
(fabric A) and 0.049 cm (D), while the margin that decides the width (best offset against the
runner-up) is 0.077 to 0.126 cm. So its P3 ("held: +1 cm on all four fabrics") rests on numbers
whose solver error is as large as the margin. This run solves each case in chunks of CHUNK
iterations (L-BFGS restarted from the last positions, same energy, same models as milestone 1,
reused unchanged) until the whole-sheet shape error moves less than TOL cm over a chunk, up to
MAXIT iterations, and records the trajectory. Offsets add +0.5 and +1.5 cm to milestone 1's grid.
The first chunk is milestone 1's 3000-iteration solve, so it must reproduce its numbers.

Predictions, written before the first run (programme LOG.md, 2026-11-10, milestone 1b):
  Q1  On the integer grid (-1..+3 cm), the converged best offset is +1 cm on all four fabrics.
      Refuted by any other best offset.
  Q2  On every fabric the converged margin (runner-up minus best, integer grid) is more than twice
      the last-chunk change of either case, so the choice is certified at the solver's residual.
      Refuted by any fabric where it is not.
  Q3  The 3000-iteration error underestimates the converged one in every case (milestone 1's two
      checks both rose), by at least 0.03 cm on average over the cases. Refuted otherwise.
  Q4  On the half-cm grid the converged best offset lies in [+0.5, +1.5] on all four fabrics.
      Refuted by a best offset outside that interval.
"""
import importlib.util
import multiprocessing as mp
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("m1_kes_fidelity_run", HERE.parent / "m1_kes_fidelity" / "run.py")
m1 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m1)  # also puts hanger-fit, hanger-3d and hanger-kes on the path
from hanger_3d.cloth3d import Arm, Sheet, score  # noqa: E402

SHALLOW = m1.SHALLOW
CHUNK = 3000
TOL = 0.002          # cm of whole-sheet shape error over one chunk
MAXIT = 60000
OFFSETS = [-1.0, 0.0, 0.5, 1.0, 1.5, 2.0, 3.0]
FABRICS = m1.FABRICS


def solve(args):
    """Chunked solve; returns the per-chunk (iterations, err_all, energy, max |grad|)."""
    code, o = args
    sh = Sheet(Arm(m1.width(code, o), SHALLOW), m1.garment(code))
    X = sh.start()
    v = X[sh.free]
    traj, total, t0 = [], 0, time.time()
    while total < MAXIT:
        v, used = m1.m2.lbfgs(lambda u: sh.energy_grad(u, X), v, iters=CHUNK, tol=1e-6)
        total += CHUNK
        X[sh.free] = v
        E, g = sh.energy_grad(v, X)
        traj.append((total, score(X, sh)["err_all"], float(E), float(np.abs(g).max())))
        if used < CHUNK or (len(traj) > 1 and abs(traj[-1][1] - traj[-2][1]) < TOL):
            break
    return code, o, traj, time.time() - t0


def main():
    cases = [(c, o) for c in FABRICS for o in OFFSETS]
    with mp.Pool() as P:
        res = P.map(solve, cases, chunksize=1)
    out = [f"hanger-codesign milestone 1b. Size M, EA {m1.EA:g} N/m, wood-shaped profile, 3 cm half-depth arm,",
           f"whole-sheet shape error (cm RMS). Chunks of {CHUNK} L-BFGS iterations until the error moves < {TOL} cm",
           f"over a chunk (or the gradient tolerance is met), cap {MAXIT}.", "",
           "1. per case: fabric offset err@3000 err_converged iterations last_chunk_change max|grad| converged seconds"]
    conv, first, resid = {}, {}, {}
    for code, o, tr, sec in res:
        e3, ec = tr[0][1], tr[-1][1]
        d = abs(tr[-1][1] - tr[-2][1]) if len(tr) > 1 else float("nan")
        ok = len(tr) > 1 and d < TOL
        conv[(code, o)], first[(code, o)], resid[(code, o)] = ec, e3, d
        out.append(f"{code} {o:+.1f} {e3:.4f} {ec:.4f} {tr[-1][0]} {d:.4f} {tr[-1][3]:.2e} {ok} {sec:.0f}")
    out += ["", "2. trajectories: fabric offset then (iterations: err_all) per chunk"]
    for code, o, tr, _ in res:
        out.append(f"{code} {o:+.1f} " + " ".join(f"{t}:{e:.4f}" for t, e, _, _ in tr))
    ints = [o for o in OFFSETS if o == int(o)]
    out += ["", "3. decisions per fabric",
            "fabric best_int@3000 best_int_converged margin_converged 2x_max_resid(best,runner) best_half_converged"]
    q1 = q2 = q4 = True
    for c in FABRICS:
        b3 = min(ints, key=lambda o: first[(c, o)])
        srt = sorted(ints, key=lambda o: conv[(c, o)])
        bc, ru = srt[0], srt[1]
        margin = conv[(c, ru)] - conv[(c, bc)]
        r2 = 2 * max(resid[(c, bc)], resid[(c, ru)])
        bh = min(OFFSETS, key=lambda o: conv[(c, o)])
        q1 &= bc == 1.0
        q2 &= margin > r2
        q4 &= 0.5 <= bh <= 1.5
        out.append(f"{c} {b3:+.0f} {bc:+.0f} {margin:.4f} {r2:.4f} {bh:+.1f}")
    rises = [conv[k] - first[k] for k in conv]
    q3 = all(r > 0 for r in rises) and sum(rises) / len(rises) >= 0.03
    out += ["", f"mean (converged - 3000) = {sum(rises)/len(rises):+.4f} cm, min {min(rises):+.4f}, max {max(rises):+.4f}", "",
            f"Q1 converged best integer offset +1 on all fabrics: {'held' if q1 else 'refuted'}",
            f"Q2 margin > 2x residual on all fabrics: {'held' if q2 else 'refuted'}",
            f"Q3 3000-iteration error underestimates in every case, mean >= 0.03 cm: {'held' if q3 else 'refuted'}",
            f"Q4 converged best half-cm offset in [+0.5, +1.5] on all fabrics: {'held' if q4 else 'refuted'}"]
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
