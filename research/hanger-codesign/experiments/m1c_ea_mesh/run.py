"""Milestone 1c: does milestone 1b's tier disagreement (the converged 3 cm arm picks a width
0.5 cm wider than the 2D chain) survive changing the unmeasured stretch stiffness EA and the mesh?

    python3 experiments/m1c_ea_mesh/run.py     (about 15 min on 4 cores; needs numpy)

Milestone 2a found that the 3D spring sheet's Cusick drape coefficient moves with EA (40 against
800 N/m: 0.15 to 0.23) and with the grid (7.5 against 5 mm: up to 0.047) as much as with bending
rigidity, which it read as membrane locking of the square spring grid. The shallow-arm sheet of
milestones 1 and 1b is the same grid, so 1b's 0.5 cm disagreement with the 2D chain could be a
locking artefact. This run repeats 1b's converged solve (same chunked L-BFGS, same stopping rule,
reused unchanged) on fabrics A (softest) and D (stiffest) at five configurations:

    EA 40, 150, 800 N/m at the base mesh (5 mm rows, 9 depth columns);
    at EA 150, 7.5 mm rows (9 columns) and 5 mm rows with 13 depth columns.

and the 2D chain on the same width grid at each EA and row spacing (it is cheap). Offsets
0 to +3 cm in half-cm steps (+2.5 added so a best at +2 is not on the edge).

Predictions, written before the first run (programme LOG.md, 2026-11-11, milestone 1c):
  R1  At the base configuration (EA 150, 5 mm, 9 columns) the converged best half-cm offset is
      +1.5 cm on both fabrics, reproducing 1b. Refuted otherwise.
  R2  Across EA 40 to 800 at the base mesh, the 3D best half-cm offset moves by at most 0.5 cm on
      each fabric. Refuted by a larger move. (Shape over an arm is mostly hanging in tension, so
      we expect EA to matter less here than in the Cusick test, where folds must form.)
  R3  The two mesh changes at EA 150 each move the 3D best half-cm offset by at most 0.5 cm.
      Refuted by a larger move on either fabric.
  R4  The tier disagreement keeps its sign: in every configuration and fabric the 3D best offset
      is at least the 2D chain's best on the same row spacing and EA, and in at least 8 of the 10
      it is strictly wider. Refuted otherwise.
  R5  The 3D shape error at the 3D best offset moves by more than 0.05 cm across EA 40 to 800 on
      at least one fabric (EA changes the absolute numbers even if not the choice). Refuted if
      it moves less on both.
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
from hanger_3d.cloth3d import DS, NZ, Arm, Sheet, score  # noqa: E402
from hanger_kes.kes import kes_garment  # noqa: E402

SHALLOW = m1.SHALLOW
CHUNK, TOL, MAXIT = 3000, 0.002, 60000   # milestone 1b's stopping rule
FABRICS = ["A", "D"]
OFFSETS = [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
BASE = (150.0, DS, NZ)
CONFIGS = [BASE, (40.0, DS, NZ), (800.0, DS, NZ), (150.0, 1.5 * DS, NZ), (150.0, DS, 13)]


def label(cfg):
    ea, ds, nz = cfg
    return f"EA{ea:g}_ds{ds * 1000:g}mm_nz{nz}"


def width(code, o, ea):
    g = kes_garment(code, ea, "M")
    return m1.dataclasses.replace(m1.m2.STOCK["wood-shaped"], w=g.half_shoulder + o), g


def solve(args):
    """Milestone 1b's chunked solve; returns per-chunk (iterations, err_all)."""
    code, o, cfg = args
    ea, ds, nz = cfg
    h, g = width(code, o, ea)
    sh = Sheet(Arm(h, SHALLOW), g, nz=nz, ds=ds)
    X = sh.start()
    v = X[sh.free]
    traj, total, t0 = [], 0, time.time()
    while total < MAXIT:
        v, used = m1.m2.lbfgs(lambda u: sh.energy_grad(u, X), v, iters=CHUNK, tol=1e-6)
        total += CHUNK
        X[sh.free] = v
        traj.append((total, score(X, sh)["err_all"]))
        if used < CHUNK or (len(traj) > 1 and abs(traj[-1][1] - traj[-2][1]) < TOL):
            break
    return code, o, cfg, traj, time.time() - t0


def run2(code, o, ea, ds):
    h, g = width(code, o, ea)
    old = m1.m2.SEG
    m1.m2.SEG = ds
    try:
        return m1.m2.score(h, g)["err"]
    finally:
        m1.m2.SEG = old


def main():
    cases = [(c, o, cfg) for cfg in CONFIGS for c in FABRICS for o in OFFSETS]
    # longest first (fine depth mesh, stiff EA) so the pool finishes together
    cases.sort(key=lambda a: -(a[2][2] * a[2][0] ** 0.3 / a[2][1]))
    with mp.Pool() as P:
        res = P.map(solve, cases, chunksize=1)
    e3, last, its = {}, {}, {}
    for code, o, cfg, tr, sec in res:
        e3[(cfg, code, o)] = tr[-1][1]
        last[(cfg, code, o)] = abs(tr[-1][1] - tr[-2][1]) if len(tr) > 1 else float("nan")
        its[(cfg, code, o)] = (tr[-1][0], sec)
    e2 = {(cfg, c, o): run2(c, o, cfg[0], cfg[1]) for cfg in CONFIGS for c in FABRICS for o in OFFSETS}
    out = ["hanger-codesign milestone 1c. Size M, wood-shaped profile, 3 cm half-depth arm, whole-sheet shape",
           f"error (cm RMS), converged with milestone 1b's rule (chunks of {CHUNK}, stop when the error moves",
           f"< {TOL} cm over a chunk, cap {MAXIT}). 2D chain at the same EA and row spacing.", "",
           "1. per case: config fabric offset err3d iterations last_chunk_change converged seconds err2d"]
    for cfg in CONFIGS:
        for c in FABRICS:
            for o in OFFSETS:
                k = (cfg, c, o)
                it, sec = its[k]
                out.append(f"{label(cfg)} {c} {o:+.1f} {e3[k]:.4f} {it} {last[k]:.4f} "
                           f"{last[k] < TOL} {sec:.0f} {e2[k]:.4f}")
    best3 = {(cfg, c): min(OFFSETS, key=lambda o: e3[(cfg, c, o)]) for cfg in CONFIGS for c in FABRICS}
    best2 = {(cfg, c): min(OFFSETS, key=lambda o: e2[(cfg, c, o)]) for cfg in CONFIGS for c in FABRICS}
    out += ["", "2. decisions: config fabric best3d err3d@best margin3d(runner-up minus best) best2d gap(3d-2d)"]
    for cfg in CONFIGS:
        for c in FABRICS:
            b = best3[(cfg, c)]
            srt = sorted(e3[(cfg, c, o)] for o in OFFSETS)
            out.append(f"{label(cfg)} {c} {b:+.1f} {e3[(cfg, c, b)]:.4f} {srt[1] - srt[0]:.4f} "
                       f"{best2[(cfg, c)]:+.1f} {b - best2[(cfg, c)]:+.1f}")
    ea_cfgs = [cfg for cfg in CONFIGS if cfg[1:] == BASE[1:]]
    mesh_cfgs = [cfg for cfg in CONFIGS if cfg[0] == BASE[0] and cfg != BASE]
    r1 = all(best3[(BASE, c)] == 1.5 for c in FABRICS)
    r2 = all(max(best3[(k, c)] for k in ea_cfgs) - min(best3[(k, c)] for k in ea_cfgs) <= 0.5 for c in FABRICS)
    r3 = all(abs(best3[(k, c)] - best3[(BASE, c)]) <= 0.5 for k in mesh_cfgs for c in FABRICS)
    gaps = [best3[k] - best2[k] for k in best3]
    r4 = all(gp >= 0 for gp in gaps) and sum(gp > 0 for gp in gaps) >= 8
    moves = {c: max(e3[(k, c, best3[(k, c)])] for k in ea_cfgs) - min(e3[(k, c, best3[(k, c)])] for k in ea_cfgs)
             for c in FABRICS}
    r5 = any(m > 0.05 for m in moves.values())
    conv = sum(v < TOL for v in last.values())
    out += ["", f"cases meeting the stopping rule: {conv} of {len(last)}",
            "error at the 3D best across EA (max - min): " + ", ".join(f"{c} {m:.4f}" for c, m in moves.items()),
            "", f"R1 base best +1.5 on both fabrics: {'held' if r1 else 'refuted'}",
            f"R2 EA 40-800 moves the 3D best by <= 0.5 cm: {'held' if r2 else 'refuted'}",
            f"R3 each mesh change moves the 3D best by <= 0.5 cm: {'held' if r3 else 'refuted'}",
            f"R4 3D best >= 2D best everywhere, strictly wider in >= 8 of 10: {'held' if r4 else 'refuted'}",
            f"R5 error at the best moves > 0.05 cm across EA on some fabric: {'held' if r5 else 'refuted'}"]
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
