"""Milestone 7zk: the L/B 10 test on Journee's (1992) Wigley I and III at Fn 0.2, 0.3 and 0.4.

    PYTHONPATH=src:experiments python3 experiments/run_journee_lb10.py > experiments/results_journee_lb10.txt

Data: Journee (1992), "Experiments and calculations on four Wigley hull forms in head waves", Delft University of
Technology, Ship Hydromechanics Laboratory report 0909. Not opened here (the egress proxy refused every data host);
the measured peaks below are as quoted, in the report's normalisation, by the documentation of an independent
open strip-theory code that read the report's data files (github.com/electricshipwrights/boatmath,
docs/seakeeping-findings.md, section 4.2, read 2026-11-20). Second-hand, peak only.

Nothing is refitted: 7zg's motion-fitted damping (zeta3 0.0375, zeta5 0) from Kashiwagi's L/B 6.67 tank hull, plus
zeta 0 and 7zd's 0.025 as sensitivity. Expectations (committed to LOG.md before the first run, e84101401):
J1 Fn 0.2 main peak ratio in 0.75-1.25 on both hulls; J2 ratio rises with Fn on both and > 1.5 at Fn 0.4 on both;
J3 main row orders I > III at Fn 0.2 and 0.3; J4 heave RAO at I, Fn 0.3, lambda/L 1.25 within 15% of 2.52;
J5 at Fn 0.2 the reflection choice moves the peak by < 15%; J6 at Fn 0.2 the zeta-0 ratio exceeds the 7zg ratio.

Section C (post hoc, added after the first run and labelled so in the output): the monohull's 30 W loss with its
strip motion term scaled by measured / model at Fn 0.2 (the monohull runs near Fn 0.16), Faltinsen reflection.
"""
import math
import sys
import time

from marine_hull import reflection as rf
from marine_hull import strip as st
from marine_hull import waves as wv

L, B, D, KYY, RHO = 3.0, 0.3, 0.1875, 0.25, 1000.0
FNS = (0.2, 0.3, 0.4)
HULLS = (("I", 1.0), ("III", 0.0))
# measured peak R_aw / (rho g zeta^2 B^2 / L), Journee (1992) as quoted (see module docstring); I at 0.4 marked noisy
MEASURED = {("I", 0.2): 31.8, ("I", 0.3): 27.6, ("I", 0.4): 14.9, ("III", 0.2): 22.2, ("III", 0.3): 20.2,
            ("III", 0.4): 27.7}
HEAVE_POINT = ("I", 0.3, 1.25, 2.52)
# that code's own Gerritsma-Beukelman peaks, quoted in the same place (not blind: for comparison only)
OTHER_GB = {("I", 0.2): 35.0, ("I", 0.3): 51.4, ("I", 0.4): 91.8, ("III", 0.2): 24.0, ("III", 0.3): 49.2,
            ("III", 0.4): 71.5}
DAMPING = (("7zg motion fit", 0.0375, 0.0), ("zeta 0", 0.0, 0.0), ("7zd area fit", 0.025, None))
MAIN_DAMPING = DAMPING[0][0]
LAMS = [round(0.30 + 0.01 * i, 2) for i in range(271)]


def curves(h, u, cb, integral):
    """Per lambda/L: (strip, Faltinsen refl, STAWAVE-2 refl, NMRI refl) in sigma units, and the heave RAO."""
    norm = RHO * st.G * B * B / L
    out = []
    for x in LAMS:
        k = 2.0 * math.pi / (x * L)
        w = math.sqrt(k * st.G)
        z, th, raw, _ = h.response(w, u)
        _, rsta = wv.rao_parts(w, u, L, B, D, cb, KYY, rho=RHO)
        out.append((x, raw / norm, rf.rao(w, u, integral, D, rho=RHO) / norm, rsta / norm,
                    rf.nmri_rao(w, u, integral, B, D, L, rho=RHO) / norm, abs(z)))
    return out


def peak(cv, col):
    """(peak sigma, lambda/L) of strip plus the reflection column col (0: strip alone)."""
    best = max(cv, key=lambda r: r[1] + (r[col] if col else 0.0))
    return best[1] + (best[col] if col else 0.0), best[0]


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    integral = rf.waterline_integral(rf.modified_wigley_slope(L, B), L)
    pr("data: Journee (1992) DUT-SHL report 0909 peaks as quoted by boatmath docs/seakeeping-findings.md 4.2 "
       "(second-hand; report not opened here)")
    pr(f"hulls: L {L:g} B {B:g} d {D:g} (L/B {L / B:.1f}, B/T {B / D:.2f}), kyy {KYY} L, fresh water; "
       f"waterline integral I/B {integral / B:.4f} (same waterline for I and III)")
    res, heave = {}, {}
    for name, alpha in HULLS:
        h = st.ModifiedWigleyStrip(L, B, D, kyy=KYY, rho=RHO, alpha=alpha)
        cb = h.vol / (L * B * D)
        tb = h.table
        pr(f"## Wigley {name} (alpha {alpha:g}): volume {h.vol:.5f} m3, CB {cb:.4f}, Smith depth {h.dm:.4f} m; "
           f"section table {tb.n_irregular} of {tb.n_points} points near irregular frequencies interpolated")
        for dname, z3, z5 in DAMPING:
            h.set_viscous(z3, z5)
            pr(f"# damping {dname} (zeta3 {z3:g}, zeta5 {z3 if z5 is None else z5:g})")
            pr("# table: Fn measured strip_GB(peak@lam) +Faltinsen +STAWAVE2 +NMRI ratio_main(Faltinsen) other_code_GB")
            for fn in FNS:
                u = fn * math.sqrt(st.G * L)
                cv = curves(h, u, cb, integral)
                pk = [peak(cv, c) for c in (0, 2, 3, 4)]
                m = MEASURED[(name, fn)]
                res[(name, dname, fn)] = dict(peaks=[p for p, _ in pk], ratio=pk[1][0] / m)
                pr(f"row {fn:.1f} {m:.1f} " + " ".join(f"{p:.2f}@{x:.2f}" for p, x in pk) +
                   f" {pk[1][0] / m:.3f} {OTHER_GB[(name, fn)]:.1f}")
                if (name, fn) == HEAVE_POINT[:2]:
                    heave[dname] = next(r[5] for r in cv if abs(r[0] - HEAVE_POINT[2]) < 1e-9)
                if dname == MAIN_DAMPING:
                    pk3 = max(cv, key=lambda r: r[5])
                    pr(f"  heave RAO peak {pk3[5]:.3f} at lambda/L {pk3[0]:.2f}")
    pr(f"heave RAO, Wigley I Fn 0.3 lambda/L 1.25 (measured {HEAVE_POINT[3]}): " +
       ", ".join(f"{k} {v:.3f} ({100 * (v / HEAVE_POINT[3] - 1):+.1f}%)" for k, v in heave.items()))

    pr("## expectations")
    r = lambda n, f, d=MAIN_DAMPING: res[(n, d, f)]["ratio"]
    j1 = all(0.75 <= r(n, 0.2) <= 1.25 for n, _ in HULLS)
    pr(f"J1 Fn 0.2 peak ratio I {r('I', 0.2):.3f}, III {r('III', 0.2):.3f} in 0.75-1.25: {j1}")
    j2 = all(r(n, 0.2) < r(n, 0.3) < r(n, 0.4) and r(n, 0.4) > 1.5 for n, _ in HULLS)
    pr("J2 ratio rises with Fn and > 1.5 at 0.4: " + "; ".join(
        f"{n} " + " ".join(f"{r(n, f):.3f}" for f in FNS) for n, _ in HULLS) + f": {j2}")
    pk = lambda n, f: res[(n, MAIN_DAMPING, f)]["peaks"][1]
    j3 = all(pk("I", f) > pk("III", f) for f in (0.2, 0.3))
    pr(f"J3 I > III at Fn 0.2 ({pk('I', 0.2):.2f} vs {pk('III', 0.2):.2f}) and 0.3 ({pk('I', 0.3):.2f} vs "
       f"{pk('III', 0.3):.2f}): {j3}")
    hv = heave[MAIN_DAMPING]
    pr(f"J4 heave {hv:.3f} within 15% of {HEAVE_POINT[3]}: {abs(hv / HEAVE_POINT[3] - 1) <= 0.15}")
    spread = {n: (lambda p: max(p[1:]) / min(p[1:]) - 1)(res[(n, MAIN_DAMPING, 0.2)]["peaks"]) for n, _ in HULLS}
    pr("J5 Fn 0.2 reflection spread " + ", ".join(f"{n} {100 * v:.1f}%" for n, v in spread.items()) +
       f" < 15%: {all(v < 0.15 for v in spread.values())}")
    j6 = all(r(n, 0.2, "zeta 0") > r(n, 0.2) for n, _ in HULLS)
    pr("J6 zeta-0 ratio above 7zg at Fn 0.2: " + ", ".join(
        f"{n} {r(n, 0.2, 'zeta 0'):.3f} vs {r(n, 0.2):.3f}" for n, _ in HULLS) + f": {j6}")
    mono_scaled(pr, {f"{n}, {d}": 1.0 / r(n, 0.2, d) for n, _ in HULLS for d in (MAIN_DAMPING, "zeta 0")})
    print(f"runtime {time.time() - t0:.0f} s", file=sys.stderr)


class Scaled:
    """A hull whose added resistance per zeta^2 is the strip motion term times s (motions unchanged)."""

    def __init__(self, hull, s):
        self.h, self.s, self.t = hull, s, hull.t

    def response(self, w, u):
        z, th, raw, we = self.h.response(w, u)
        return z, th, raw * self.s, we


def mono_scaled(pr, scales):
    import run_a0_coupling_transfer as a0
    import run_faltinsen_reflection as fr
    import run_range_speed as rr
    pr("## C. post hoc (not in the plan): the 4 m monohull, 7zg damping, strip motion term x (measured / model at Fn 0.2)")
    mono = a0.Mono()
    i_mono = rf.waterline_integral(rf.wigley_slope(mono.l, mono.b), mono.l)
    hull = st.WigleyStrip(mono.l, mono.b, mono.t, table=mono.table)
    hull.set_viscous(0.0375, 0.0)
    pr("# table: scale_from scale pooled_1ms_motion_N pooled_1ms_refl_N loss30W_share025 loss30W_share1 scope200W")
    for tag, sc in [("none (7zh row)", 1.0)] + list(scales.items()):
        e = fr.mono_eval(mono, fr.FaltinsenWaveTable(Scaled(hull, sc), rr.DISP, mono.t01s, i_mono))
        pr(f"row {tag.replace(' ', '_')} {sc:.3f} {e['motion']:.3f} {e['refl']:.3f} {e['loss25']:.2f} {e['loss1']:.2f} "
           f"{e['scope']}")


if __name__ == "__main__":
    main()
