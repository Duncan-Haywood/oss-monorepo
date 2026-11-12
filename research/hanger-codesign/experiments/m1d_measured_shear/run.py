"""Milestone 1d: with the sheet's shear stiffness set from each fabric's measured KES shear rigidity
G, does the shallow-arm width choice still follow the stretch stiffness EA?

    python3 experiments/m1d_measured_shear/run.py     (about 30 to 60 min on 4 cores; needs numpy)

Milestone 1c found the converged 3 cm arm's best width offset moves 1.5 cm across EA 40 to 800 N/m
(+2.0 to +2.5 cm at EA 40, +0.5 to +1.0 cm at 800). Milestone 2b then found that every EA sweep in
this programme also swept the shear spring (the sheet's diagonal springs are SHEAR = 0.1 of EA),
and on the Cusick test shear carried most of the "EA" effect. 1c's sheet is the same spring grid
(`hanger_3d.cloth3d.Sheet`), whose in-plane shear stiffness is exactly shear x EA on its l0 x dz
rectangles too (two diagonals of length d, stiffness shear EA d^2 / (2 l0 dz), store
shear EA gamma^2 / 2 per area; `tests/test_m1d.py` checks it on a sheared sheet). So this run fixes
the shear stiffness at the measured G of each fabric (`../m2b_locking/kes_shear.py`: 26, 27, 29 and
89 N/m per radian for A to D) and sweeps EA on its own.

Stretch stiffness. Ramaiah et al.'s Table 3 (the source of B, W and G) also gives KES-FB1 tensile
linearity LT and energy WT (A to D: LT 0.632, 0.849, 0.597, 0.667; WT 32.78, 6.72, 9.91, 10.50
gf cm/cm^2). With KES-FB1's standard maximum load Fm = 500 gf/cm (Kawabata 1980; the paper does not
state its load, so this is an assumption), the strain at Fm is EMT = 2 WT / (LT Fm) and the secant
stiffness is EA_kes = Fm / EMT: about 2370, 15500, 7380 and 7780 N/m. LT < 1 means the curve
stiffens with load, so the stiffness under a garment's own weight (a few N/m) is lower than this
secant: EA_kes is an upper bracket, not a measurement of the relevant tangent. Fabric B's 3% strain
at 500 gf/cm is implausibly low for a jersey with elastane (the paper itself warns that KES-FB on
knits "may not be proper"), so B's EA_kes is the least trusted.

Cases: fabrics A to D, EA 150, 800, 3200 N/m and EA_kes, and EA 40 on A and D (1c's softest), each
at offsets 0 to +3 cm in half-cm steps, with shear = G / EA; milestone 1b's converged solve and
stopping rule unchanged; the 2D chain (no shear) at the same EA for comparison. 126 cases.

Predictions, written before the first run (programme LOG.md, 2026-11-12, milestone 1d):
  S1  With shear at the measured G, the 3D best half-cm offset moves by at most 0.5 cm across
      EA 40, 150 and 800 on both A and D (1c, with shear tied to EA, moved 1.5 cm). Refuted by a
      larger move on either fabric: then stretch, not shear, carries 1c's effect.
  S2  Across EA 800, 3200 and EA_kes the 3D best moves by at most 0.5 cm on every fabric (the
      choice settles in the stiff regime where the KES bracket puts these fabrics). Refuted by a
      larger move on any fabric.
  S3  At EA_kes the 3D best is within 0.5 cm of the 2D chain's best at the same EA on all four
      fabrics. Refuted otherwise.
  S4  At EA 150, measured G instead of 1c's 15 N/m moves fabric D's best narrower than 1c's +1.5
      (to +1.0 or less) and fabric A's by at most 0.5 cm. Refuted otherwise.
  S5  At EA_kes the margin between the best and the runner-up exceeds twice the larger of their
      last-chunk changes on all four fabrics (the decision is certified by the stopping rule).
      Refuted on any fabric where it does not.
"""
import importlib.util
import multiprocessing as mp
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("m1c_ea_mesh_run", HERE.parent / "m1c_ea_mesh" / "run.py")
m1c = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m1c)  # puts hanger-fit, hanger-3d and hanger-kes on the path
sys.path.insert(0, str(HERE.parent / "m2b_locking"))
import kes_shear  # noqa: E402
from hanger_3d.cloth3d import DS, NZ, Arm, Sheet, score  # noqa: E402

m1 = m1c.m1
SHALLOW, CHUNK, TOL, MAXIT, OFFSETS = m1c.SHALLOW, m1c.CHUNK, m1c.TOL, m1c.MAXIT, m1c.OFFSETS
FABRICS = ["A", "B", "C", "D"]
FM = 500.0                                                  # gf/cm, KES-FB1 standard (assumed)
LT = {"A": 0.632, "B": 0.849, "C": 0.597, "D": 0.667}      # Table 3 row 1
WT = {"A": 32.78, "B": 6.72, "C": 9.91, "D": 10.50}        # Table 3 row 2, gf cm/cm^2
GF_CM = 9.80665e-3 / 1e-2                                   # gf/cm -> N/m


def emt(code):
    """Strain at the maximum load, from LT and WT (WT = LT * Fm * EMT / 2)."""
    return 2.0 * WT[code] / (LT[code] * FM)


def ea_kes(code):
    """Secant stretch stiffness at Fm, N/m (rounded to 10 N/m so labels stay short)."""
    return round(FM * GF_CM / emt(code), -1)


SWEEP = [150.0, 800.0, 3200.0]


def eas(code):
    return ([40.0] if code in ("A", "D") else []) + SWEEP + [ea_kes(code)]


def shear_frac(code, ea):
    return kes_shear.g_si(code) / ea


def solve(args):
    """Milestone 1b's chunked solve with shear set from G; returns per-chunk (iterations, err_all)."""
    code, o, ea = args
    h, g = m1c.width(code, o, ea)
    sh = Sheet(Arm(h, SHALLOW), g, nz=NZ, ds=DS, shear=shear_frac(code, ea))
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
    return code, o, ea, traj, time.time() - t0


def m1c_best():
    """1c's decisions (shear tied to EA at 0.1) by (EA, fabric), from its results.txt."""
    best = {}
    for l in (HERE.parent / "m1c_ea_mesh" / "results.txt").read_text().splitlines():
        t = l.split()
        if len(t) == 7 and t[0].endswith("_ds5mm_nz9") and t[1] in "AD":
            best[(float(t[0][2:].split("_")[0]), t[1])] = float(t[2])
    return best


def main():
    cases = [(c, o, ea) for c in FABRICS for ea in eas(c) for o in OFFSETS]
    cases.sort(key=lambda a: -a[2])                         # stiffest first
    with mp.Pool() as P:
        res = P.map(solve, cases, chunksize=1)
    e3, last, its = {}, {}, {}
    for code, o, ea, tr, sec in res:
        k = (code, ea, o)
        e3[k] = tr[-1][1]
        last[k] = abs(tr[-1][1] - tr[-2][1]) if len(tr) > 1 else float("nan")
        its[k] = (tr[-1][0], sec)
    e2 = {(c, ea, o): m1c.run2(c, o, ea, DS) for c in FABRICS for ea in eas(c) for o in OFFSETS}
    out = ["hanger-codesign milestone 1d. Size M, wood-shaped profile, 3 cm half-depth arm, 5 mm rows,",
           f"{NZ} depth columns, whole-sheet shape error (cm RMS); shear spring = measured KES G, EA swept;",
           f"milestone 1b's stopping rule (chunks of {CHUNK}, stop when the error moves < {TOL} cm, cap {MAXIT}).",
           "", "0. fabric G_N/m LT WT EMT EA_kes_N/m (Fm = 500 gf/cm assumed)"]
    for c in FABRICS:
        out.append(f"{c} {kes_shear.g_si(c):.1f} {LT[c]} {WT[c]} {emt(c):.4f} {ea_kes(c):g}")
    out += ["", "1. per case: fabric EA shear_frac offset err3d iterations last_chunk_change converged seconds err2d"]
    for c in FABRICS:
        for ea in eas(c):
            for o in OFFSETS:
                k = (c, ea, o)
                it, sec = its[k]
                out.append(f"{c} {ea:g} {shear_frac(c, ea):.4f} {o:+.1f} {e3[k]:.4f} {it} {last[k]:.4f} "
                           f"{last[k] < TOL} {sec:.0f} {e2[k]:.4f}")
    best3, best2, cert = {}, {}, {}
    out += ["", "2. decisions: fabric EA best3d err3d@best runner_up margin 2*max_last certified best2d gap(3d-2d)"]
    for c in FABRICS:
        for ea in eas(c):
            srt = sorted(OFFSETS, key=lambda o: e3[(c, ea, o)])
            b, r = srt[0], srt[1]
            best3[(c, ea)] = b
            best2[(c, ea)] = min(OFFSETS, key=lambda o: e2[(c, ea, o)])
            margin = e3[(c, ea, r)] - e3[(c, ea, b)]
            tol = 2 * max(last[(c, ea, b)], last[(c, ea, r)])
            cert[(c, ea)] = margin > tol
            out.append(f"{c} {ea:g} {b:+.1f} {e3[(c, ea, b)]:.4f} {r:+.1f} {margin:.4f} {tol:.4f} "
                       f"{cert[(c, ea)]} {best2[(c, ea)]:+.1f} {b - best2[(c, ea)]:+.1f}")

    def span(c, ks):
        v = [best3[(c, k)] for k in ks]
        return max(v) - min(v)
    old = m1c_best()
    s1 = all(span(c, [40.0, 150.0, 800.0]) <= 0.5 for c in "AD")
    s2 = all(span(c, [800.0, 3200.0, ea_kes(c)]) <= 0.5 for c in FABRICS)
    s3 = all(abs(best3[(c, ea_kes(c))] - best2[(c, ea_kes(c))]) <= 0.5 for c in FABRICS)
    s4 = best3[("D", 150.0)] <= 1.0 and abs(best3[("A", 150.0)] - old[(150.0, "A")]) <= 0.5
    s5 = all(cert[(c, ea_kes(c))] for c in FABRICS)
    out += ["", "3. shear tied (1c, 0.1 EA) against measured G (this run): fabric EA best_1c best_1d"]
    for (ea, c), b in sorted(old.items()):
        out.append(f"{c} {ea:g} {b:+.1f} {best3[(c, ea)]:+.1f}")
    conv = sum(v < TOL for v in last.values())
    out += ["", f"cases meeting the stopping rule: {conv} of {len(last)}",
            "best-offset span EA 40-800 (A, D): " + ", ".join(f"{c} {span(c, [40.0, 150.0, 800.0]):.1f}" for c in "AD"),
            "best-offset span EA 800-EA_kes: " + ", ".join(f"{c} {span(c, [800.0, 3200.0, ea_kes(c)]):.1f}" for c in FABRICS),
            "", f"S1 measured G: EA 40-800 moves the 3D best by <= 0.5 cm on A and D: {'held' if s1 else 'refuted'}",
            f"S2 EA 800, 3200, EA_kes move the 3D best by <= 0.5 cm on every fabric: {'held' if s2 else 'refuted'}",
            f"S3 at EA_kes 3D best within 0.5 cm of 2D best on all fabrics: {'held' if s3 else 'refuted'}",
            f"S4 EA 150: D's best <= +1.0, A's within 0.5 cm of 1c: {'held' if s4 else 'refuted'}",
            f"S5 at EA_kes margin > 2 x last-chunk change on all fabrics: {'held' if s5 else 'refuted'}"]
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
