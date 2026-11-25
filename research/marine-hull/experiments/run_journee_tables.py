"""Milestone 7zzf: the strip model against Journee's own tabulated Wigley III values (L/B 10), not peaks.

    PYTHONPATH=src python3 experiments/run_journee_tables.py > experiments/results_journee_tables.txt

Data: Journee (1992), "Experiments and calculations on four Wigley hull forms in head waves", Delft University of
Technology, Ship Hydromechanics Laboratory report 0909. Not opened here (the egress proxy refuses the TU Delft hosts).
The 16 values below are those the open strip code boatmath asserts its own model against and describes as "the
report's own" (github.com/electricshipwrights/boatmath, MIT licence, commit 2d4b3acf1f33,
crates/seakeeping/src/validation.rs, read 2026-11-24): Table 2-III, Table 6-III and Table 8-III. Second-hand, as
typed by that code's authors from the report's data files; only the numbers are used, no code is copied.

Plan and expectations E0 to E5 were committed to LOG.md (d4621716a) before this file was written. No model change:
`strip.ModifiedWigleyStrip` with alpha 0 (Wigley III), L 3 m, B 0.3 m, d 0.1875 m, kyy 0.25 L, fresh water.
"""
import cmath
import math
import sys
import time

from marine_hull import strip as st

L, B, D, KYY, RHO = 3.0, 0.3, 0.1875, 0.25, 1000.0
VOL_QUOTED = 0.0780
# Table 2-III, Fn 0.3: omega_e sqrt(L/g), A33/(rho V), B33/(rho V) sqrt(L/g)
COEF = [(2.22, 0.707, 1.963), (2.78, 0.537, 1.994), (3.34, 0.465, 1.854), (3.88, 0.425, 1.706),
        (4.45, 0.421, 1.518)]
# Table 6-III, Fn 0.3: lambda/L, |X3|/(C33 zeta), |X5|/(k C55 zeta)
LOADS = [(1.25, 0.345, 0.444), (1.5, 0.454, 0.546), (1.75, 0.515, 0.600), (2.0, 0.577, 0.658)]
# Table 8-III: Fn, lambda/L, heave RAO |z|/zeta
HEAVE = [(0.2, 1.25, 0.71), (0.2, 1.5, 0.81), (0.2, 2.0, 0.90), (0.3, 1.25, 1.28), (0.3, 1.384, 1.11),
         (0.3, 1.5, 1.01), (0.3, 2.0, 0.99)]
GRIDS = ((16, 30), (24, 40))
DAMPING = (("7zg", 0.0375, 0.0), ("zeta0", 0.0, 0.0))


def w0_from_we(we, u):
    """Absolute frequency whose head-sea encounter frequency at speed u is we: we = w0 + w0^2 u / g."""
    a = u / st.G
    return (-1.0 + math.sqrt(1.0 + 4.0 * a * we)) / (2.0 * a)


def heave_coefficients(h, we, u):
    """(A33, B33) of the strip sums at encounter frequency we: sum a dx, sum (b - U da/dx) dx, as in `response`."""
    a, b = h.sections(we)
    n = len(h.x)
    ap = [(a[min(i + 1, n - 1)] - a[max(i - 1, 0)]) / (h.x[min(i + 1, n - 1)] - h.x[max(i - 1, 0)]) for i in range(n)]
    return sum(a) * h.dx, sum(bb - u * aa for bb, aa in zip(b, ap)) * h.dx


def restrained_loads(h, omega, u):
    """(|F3|, |F5|) per unit wave amplitude on the restrained hull: `response`'s right-hand side f1, f2."""
    k = omega * omega / st.G
    we = omega + k * u
    a, b = h.sections(we)
    n = len(h.x)
    ap = [(a[min(i + 1, n - 1)] - a[max(i - 1, 0)]) / (h.x[min(i + 1, n - 1)] - h.x[max(i - 1, 0)]) for i in range(n)]
    smith = math.exp(-k * h.dm)
    f1 = f2 = 0j
    for i, x in enumerate(h.x):
        bp = b[i] - u * ap[i]
        f0 = (-a[i] * omega * omega + 1j * omega * bp + h.rho * st.G * 2.0 * h.hb[i]) * smith * cmath.exp(1j * k * x)
        f1 += f0 * h.dx
        f2 += x * f0 * h.dx
    return abs(f1), abs(f2)


def head_omega(lam):
    return math.sqrt(2.0 * math.pi / (lam * L) * st.G)


def run_grid(pr, n_panels, n_stations):
    h = st.ModifiedWigleyStrip(L, B, D, n_stations=n_stations, kyy=KYY, rho=RHO, n_panels=n_panels, alpha=0.0)
    out = {}
    s = math.sqrt(L / st.G)
    pr(f"## grid ({n_panels}, {n_stations}): volume {h.vol:.5f} m3 (quoted {VOL_QUOTED}, "
       f"{100 * (h.vol / VOL_QUOTED - 1):+.2f}%), CB {h.vol / (L * B * D):.4f}; "
       f"table {h.table.n_irregular} of {h.table.n_points} points near irregular frequencies interpolated")
    out["vol"] = h.vol
    u3 = 0.3 * math.sqrt(st.G * L)
    pr("# A. forced heave, Fn 0.3: omega' A33''_exp A33''_model ratio B33''_exp B33''_model ratio")
    for wn, a_e, b_e in COEF:
        a33, b33 = heave_coefficients(h, wn / s, u3)
        am, bm = a33 / (RHO * h.vol), b33 / (RHO * h.vol) * s
        out[("A33", wn)], out[("B33", wn)] = am / a_e, bm / b_e
        pr(f"row {wn:.2f} {a_e:.3f} {am:.3f} {am / a_e:.3f} {b_e:.3f} {bm:.3f} {bm / b_e:.3f}")
    c33, c55 = h.restoring()
    pr("# B. restrained wave loads, Fn 0.3: lambda/L X3''_exp X3''_model ratio X5''_exp X5''_model ratio")
    for lam, x3, x5 in LOADS:
        w = head_omega(lam)
        k = w * w / st.G
        f3, f5 = restrained_loads(h, w, u3)
        m3, m5 = f3 / c33, f5 / (k * c55)
        out[("X3", lam)], out[("X5", lam)] = m3 / x3, m5 / x5
        pr(f"row {lam:.3f} {x3:.3f} {m3:.3f} {m3 / x3:.3f} {x5:.3f} {m5:.3f} {m5 / x5:.3f}")
    pr("# C. heave RAO in head waves: Fn lambda/L measured " + " ".join(f"{d}_model {d}_ratio" for d, _, _ in DAMPING))
    for fn, lam, z_e in HEAVE:
        u = fn * math.sqrt(st.G * L)
        cells = []
        for dname, z3, z5 in DAMPING:
            h.set_viscous(z3, z5)
            z = abs(h.response(head_omega(lam), u)[0])
            out[("z", dname, fn, lam)] = z / z_e
            cells.append(f"{z:.3f} {z / z_e:.3f}")
        pr(f"row {fn:.1f} {lam:.3f} {z_e:.2f} " + " ".join(cells))
    h.set_viscous(0.0375, 0.0)
    pk = max(((x, abs(h.response(head_omega(x), u3)[0])) for x in [1.0 + 0.01 * i for i in range(101)]),
             key=lambda r: r[1])
    pr(f"  Fn 0.3 heave RAO peak (7zg) {pk[1]:.3f} at lambda/L {pk[0]:.2f} (scan 1.00 to 2.00 by 0.01)")
    return out


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    pr("data: Journee (1992) DUT-SHL report 0909, Tables 2-III, 6-III, 8-III, as asserted in boatmath "
       "crates/seakeeping/src/validation.rs (commit 2d4b3acf; second-hand, report not opened here)")
    pr(f"hull: Wigley III (alpha 0), L {L:g} B {B:g} d {D:g}, kyy {KYY} L, fresh water")
    res = {g: run_grid(pr, *g) for g in GRIDS}
    r = res[GRIDS[0]]
    pr("## expectations (registered in LOG.md, d4621716a)")
    e0 = abs(r["vol"] / VOL_QUOTED - 1) <= 0.005
    pr(f"E0 volume within 0.5%: {100 * (r['vol'] / VOL_QUOTED - 1):+.2f}%: {e0}")
    na = sum(abs(r[("A33", w)] - 1) <= 0.15 for w, _, _ in COEF)
    nb = sum(abs(r[("B33", w)] - 1) <= 0.15 for w, _, _ in COEF)
    pr(f"E1 A33 within 15% at {na}/5, B33 at {nb}/5 (need >= 4 each): {na >= 4 and nb >= 4}")
    n3 = sum(abs(r[("X3", x)] - 1) <= 0.10 for x, _, _ in LOADS)
    n5 = sum(abs(r[("X5", x)] - 1) <= 0.15 for x, _, _ in LOADS)
    pr(f"E2 X3 within 10% at {n3}/4, X5 within 15% at {n5}/4 (need 4 each): {n3 == 4 and n5 == 4}")
    z2 = [r[("z", "7zg", 0.2, x)] for f, x, _ in HEAVE if f == 0.2]
    pr("E3 Fn 0.2 heave ratios (7zg) " + " ".join(f"{v:.3f}" for v in z2) +
       f" all within 15%: {all(abs(v - 1) <= 0.15 for v in z2)}")
    zg, z0 = r[("z", "7zg", 0.3, 1.25)], r[("z", "zeta0", 0.3, 1.25)]
    pr(f"E4 Fn 0.3 lambda/L 1.25 heave ratio 7zg {zg:.3f} (more than 15% low: {zg < 0.85}), zeta 0 {z0:.3f} "
       f"(within 15%: {abs(z0 - 1) <= 0.15}): {zg < 0.85 and abs(z0 - 1) <= 0.15}")
    rf = res[GRIDS[1]]
    moves = {k: rf[k] / r[k] - 1 for k in r if k != "vol"}
    worst = max(moves, key=lambda k: abs(moves[k]))
    pr(f"E5 largest move from {GRIDS[0]} to {GRIDS[1]}: {100 * moves[worst]:+.2f}% at {worst}: "
       f"{abs(moves[worst]) < 0.03}")
    print(f"runtime {time.time() - t0:.0f} s", file=sys.stderr)


if __name__ == "__main__":
    main()
