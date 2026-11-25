"""Milestone 7zzg: does moving the strip's pitch coefficients at speed toward Journee's tank values close the
Wigley III Fn 0.2 added-resistance shortfall? A labelled sensitivity, not a correction.

    PYTHONPATH=src:experiments python3 experiments/run_pitch_sensitivity.py > experiments/results_pitch_sensitivity.txt

Data (second-hand): Journee (1992), DUT-SHL report 0909, Wigley III forced pitch at omega' = omega_e sqrt(L/g) = 2.2,
B55/(rho V L^2) sqrt(L/g) = 0.074 / 0.073 / 0.066 at Fn 0.2 / 0.3 / 0.4, and the summary that strip pitch added inertia
at speed is "~30% low", both as quoted by the open strip code boatmath (github.com/electricshipwrights/boatmath, MIT,
commit 2d4b3acf1f33, docs/seakeeping-findings.md, read 2026-11-24). Only the numbers are used; no code is copied.
Heave at Fn 0.2 and the 22.2 peak as in 7zzf and 7zk.

Plan and expectations P0 to P5 were committed to LOG.md (792de2922) before this file was written.
"""
import math
import sys
import time

from marine_hull import nearfield as nf
from marine_hull import reflection as rf
from marine_hull import strip as st

G = st.G
L, B, D, KYY, RHO = 3.0, 0.3, 0.1875, 0.25, 1000.0
Z3, Z5 = 0.0375, 0.0
MEAS_PEAK = 22.2                                  # Journee, Wigley III Fn 0.2, rho g zeta^2 B^2 / L (7zk)
REF_7ZU = {"gb": 17.38, "nf_pg": 18.01}           # results_nearfield_longwave.txt, (16, 30)
B55_MEAS = {0.2: 0.074, 0.3: 0.073, 0.4: 0.066}   # omega' 2.2, as quoted by boatmath
B55_BOATMATH = {0.2: 0.108, 0.3: 0.130, 0.4: 0.162}
HEAVE_02 = [(1.25, 0.71), (1.5, 0.81), (2.0, 0.90)]   # Table 8-III, Fn 0.2 (7zzf)
HEAVE_03 = [(0.3, 1.25, 1.28), (0.3, 1.384, 1.11), (0.3, 1.5, 1.01), (0.3, 2.0, 0.99)]   # Table 8-III, Fn 0.3
A_SCALE = 1.0 / 0.7
WINDOW = [round(0.78 + 0.01 * i, 2) for i in range(25)]
A_GRID = [round(1.0 + 0.1 * i, 1) for i in range(7)]
B_GRID = [round(0.4 + 0.1 * i, 1) for i in range(7)]


def head_omega(lam):
    return math.sqrt(2.0 * math.pi / (lam * L) * G)


def pitch_coefficients(h, we, u):
    """(A55, B55), dimensional, from the strip's pitch-pitch sum h22 = omega_e^2 A55 - i omega_e B55 - C55."""
    a, b = h.sections(we)
    n, dx = len(h.x), h.dx
    ap = [(a[min(i + 1, n - 1)] - a[max(i - 1, 0)]) / (h.x[min(i + 1, n - 1)] - h.x[max(i - 1, 0)]) for i in range(n)]
    bp = [bb - u * aa for bb, aa in zip(b, ap)]
    h22 = 0j
    for i, x in enumerate(h.x):
        ft = a[i] * (we * we * x + 2j * u * we) + bp[i] * (u - 1j * we * x) - RHO * G * 2.0 * h.hb[i] * x
        h22 += x * ft * dx
    _, c55 = h.restoring()
    return (h22.real + c55) / (we * we), -h22.imag / we


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    h = st.ModifiedWigleyStrip(L, B, D, kyy=KYY, rho=RHO, alpha=0.0)
    h.set_viscous(Z3, Z5)
    s = math.sqrt(L / G)
    nd = RHO * h.vol * L * L
    norm = RHO * G * B * B / L
    integral = rf.waterline_integral(rf.modified_wigley_slope(L, B), L)
    pr("data: Journee (1992) DUT-SHL 0909, Wigley III; B55 at omega' 2.2 and the A55 summary as quoted in boatmath "
       "docs/seakeeping-findings.md (commit 2d4b3acf; second-hand)")
    pr(f"hull: Wigley III (alpha 0), L {L:g} B {B:g} d {D:g}, kyy {KYY} L, grid (16, 30), damping zeta3 {Z3} zeta5 {Z5}")

    pr("## P0. code checks")
    u2 = 0.2 * math.sqrt(G * L)
    w = head_omega(1.0)
    r0, r1 = h.response(w, u2), h.response(w, u2, pitch_adjust=(0.0, 0.0))
    same = all(abs(complex(x) - complex(y)) == 0.0 for x, y in zip(r0, r1))
    pr(f"pitch_adjust (0, 0) identical to the default: {same}")

    pr("## A. the strip's pitch coefficients: Fn omega' A55'' B55'' B55''_meas B55''_boatmath ours/meas")
    b55 = {}
    for fn in (0.2, 0.3, 0.4):
        u = fn * math.sqrt(G * L)
        a55, bb = pitch_coefficients(h, 2.2 / s, u)
        b55[fn] = bb / nd * s
        pr(f"row {fn:.1f} 2.20 {a55 / nd:.4f} {b55[fn]:.4f} {B55_MEAS[fn]:.3f} {B55_BOATMATH[fn]:.3f} "
           f"{b55[fn] / B55_MEAS[fn]:.3f}")
    pr("# Fn 0.2 across frequency: omega' A55'' B55''")
    for i in range(15):
        wn = 1.5 + 0.25 * i
        a55, bb = pitch_coefficients(h, wn / s, u2)
        pr(f"freq {wn:.2f} {a55 / nd:.4f} {bb / nd * s:.4f}")

    b_scale = B55_MEAS[0.2] / b55[0.2]

    def adjust(sa, sb, u=u2):
        """pitch_adjust as a function of omega_e: the strip's own A55, B55 scaled by sa, sb."""
        if sa == 1.0 and sb == 1.0:
            return None
        def f(we):
            a55, bb = pitch_coefficients(h, we, u)
            return ((sa - 1.0) * a55, (sb - 1.0) * bb)
        return f

    def gb_row(f, lam, u=u2):
        om = head_omega(lam)
        k = om * om / G
        pa = f(om + k * u) if f else None
        z, th, raw, _ = h.response(om, u, pitch_adjust=pa)
        return z, th, raw / norm + rf.rao(om, u, integral, D, rho=RHO) / norm

    pr(f"## B. variants at Fn 0.2 (B scale = {B55_MEAS[0.2]:.3f} / {b55[0.2]:.4f} = {b_scale:.3f}, A scale {A_SCALE:.3f})")
    pr("# variant: heave ratios at lambda/L 1.25 1.5 2.0; pitch RAO peak |theta|/(k zeta) at lambda/L; "
       "GB+F peak, lam, ratio; NF-PG peak, lam, ratio; NF-PG/GB+F")
    near = nf.NearField(h)
    variants = (("base", 1.0, 1.0), ("A", A_SCALE, 1.0), ("B", 1.0, b_scale), ("AB", A_SCALE, b_scale))
    res = {}
    for name, sa, sb in variants:
        f = adjust(sa, sb)
        hv = [abs(gb_row(f, lam)[0]) / zm for lam, zm in HEAVE_02]
        pitch = []
        for i in range(81):
            lam = 0.8 + 0.02 * i
            om = head_omega(lam)
            pitch.append((abs(gb_row(f, lam)[1]) / (om * om / G), lam))
        pk_th = max(pitch)
        gbs, nfs = [], []
        for lam in WINDOW:
            om = head_omega(lam)
            z, th, val = gb_row(f, lam)
            gbs.append((val, lam))
            o = near.response(om, u2, motions=(z, th))
            nfs.append((o["nf_pg"] / norm, lam))        # NF-PG carries no reflection term (7zu, 7zzd)
        g, n = max(gbs), max(nfs)
        res[name] = {"heave": hv, "gb": g, "nf": n}
        pr(f"var {name:4s} heave {' '.join(f'{v:.3f}' for v in hv)}; pitch peak {pk_th[0]:.3f} at {pk_th[1]:.2f}; "
           f"GB+F {g[0]:.2f} at {g[1]:.2f} ratio {g[0] / MEAS_PEAK:.3f}{' EDGE' if g[1] in (WINDOW[0], WINDOW[-1]) else ''}; "
           f"NF-PG {n[0]:.2f} at {n[1]:.2f} ratio {n[0] / MEAS_PEAK:.3f}{' EDGE' if n[1] in (WINDOW[0], WINDOW[-1]) else ''}; "
           f"NF-PG/GB+F {n[0] / g[0]:.3f}")
        print(f"variant {name} done {time.time() - t0:.0f} s", file=sys.stderr)

    pr("## C. bracket at Fn 0.2, GB+F: A scale, B scale, peak ratio, peak lam, heave within 15% at all three")
    best = None
    for sa in A_GRID:
        for sb in B_GRID:
            f = adjust(sa, sb)
            g = max((gb_row(f, lam)[2], lam) for lam in WINDOW)
            hv = [abs(gb_row(f, lam)[0]) / zm for lam, zm in HEAVE_02]
            ok = all(abs(v - 1) <= 0.15 for v in hv)
            edge = g[1] in (WINDOW[0], WINDOW[-1])
            pr(f"cell {sa:.1f} {sb:.1f} {g[0] / MEAS_PEAK:.3f} {g[1]:.2f}{' EDGE' if edge else ''} {ok} "
               f"heave {' '.join(f'{v:.3f}' for v in hv)}")
            if ok and (best is None or g[0] > best[0]):
                best = (g[0], sa, sb)
    print(f"bracket done {time.time() - t0:.0f} s", file=sys.stderr)

    pr("## D. added after P0 to P5 were read (not registered): variant B at Fn 0.3 and 0.4, B55 scaled by the "
       "measured/strip ratio at omega' 2.2 at that Fn")
    pr("# Fn variant: B scale; heave ratios at Table 8-III points (Fn 0.3); GB+F peak, lam, ratio; NF-PG peak, lam, ratio")
    for fn, centre, meas in ((0.3, 1.08, 20.2), (0.4, 1.25, 27.7)):
        u = fn * math.sqrt(G * L)
        win = [round(centre + 0.01 * i, 2) for i in range(-12, 13)]
        for name, sb in (("base", 1.0), ("B", B55_MEAS[fn] / b55[fn])):
            f = adjust(1.0, sb, u)
            hv = [abs(gb_row(f, lam, u)[0]) / zm for ff, lam, zm in HEAVE_03 if ff == fn]
            gbs, nfs = [], []
            for lam in win:
                om = head_omega(lam)
                z, th, val = gb_row(f, lam, u)
                gbs.append((val, lam))
                nfs.append((near.response(om, u, motions=(z, th))["nf_pg"] / norm, lam))
            g, n = max(gbs), max(nfs)
            ed = lambda x: " EDGE" if x in (win[0], win[-1]) else ""
            pr(f"fn {fn:.1f} {name:4s} x{sb:.3f}; heave {' '.join(f'{v:.3f}' for v in hv) or '-'}; "
               f"GB+F {g[0]:.2f} at {g[1]:.2f}{ed(g[1])} ratio {g[0] / meas:.3f}; "
               f"NF-PG {n[0]:.2f} at {n[1]:.2f}{ed(n[1])} ratio {n[0] / meas:.3f}")
    print(f"section D done {time.time() - t0:.0f} s", file=sys.stderr)

    pr("## expectations (registered in LOG.md, 792de2922)")
    base = res["base"]
    p0 = same and abs(base["gb"][0] - REF_7ZU["gb"]) <= 0.01 and abs(base["nf"][0] - REF_7ZU["nf_pg"]) <= 0.01
    pr(f"P0 identity {same}; base GB+F {base['gb'][0]:.3f} (7zu {REF_7ZU['gb']}), NF-PG {base['nf'][0]:.3f} "
       f"(7zu {REF_7ZU['nf_pg']}): {p0}")
    chg = b55[0.4] / b55[0.2] - 1
    pr(f"P1 B55'' Fn 0.2 -> 0.4 change {100 * chg:+.1f}% (under 10%): {abs(chg) < 0.10}")
    pr(f"P1b B55'' above the measured at all three Fn: {all(b55[f] > B55_MEAS[f] for f in B55_MEAS)}")
    d_a = res["A"]["gb"][0] / MEAS_PEAK - base["gb"][0] / MEAS_PEAK
    pr(f"P2 variant A moves the GB+F ratio by {d_a:+.3f} (more than 0.05 in size): {abs(d_a) > 0.05}")
    d_b = res["B"]["gb"][0] / MEAS_PEAK - base["gb"][0] / MEAS_PEAK
    pr(f"P3 variant B raises the GB+F ratio by {d_b:+.3f} (more than +0.05): {d_b > 0.05}")
    if best:
        pr(f"P4 best bracket cell with heave within 15%: A x{best[1]:.1f}, B x{best[2]:.1f}, ratio "
           f"{best[0] / MEAS_PEAK:.3f}; none at 0.95 or above: {best[0] / MEAS_PEAK < 0.95}")
    else:
        pr("P4 no bracket cell keeps heave within 15%: True (vacuously)")
    rat = [r["nf"][0] / r["gb"][0] for r in res.values()]
    spread = max(rat) / min(rat) - 1
    pr(f"P5 NF-PG/GB+F over the four variants {min(rat):.3f} to {max(rat):.3f} ({100 * spread:.1f}%, under 3%): "
       f"{spread < 0.03}")
    print(f"runtime {time.time() - t0:.0f} s", file=sys.stderr)


if __name__ == "__main__":
    main()
