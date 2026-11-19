"""Milestone 7z: strip-theory (Gerritsma-Beukelman) check of the STAWAVE-2 wave term at 4 m.

    PYTHONPATH=src:experiments python3 experiments/run_strip_added_resistance.py > experiments/results_strip_added_resistance.txt

7y added the ITTC STAWAVE-2 mean added resistance in waves to the monohull, but STAWAVE-2 is a fit to ships
of 50-400 m with L/B 4-9 and B/T 2.2-9; the monohull is L/B 10, B/T 1.46. This script computes the same
quantity from the hull's own sections (`marine_hull.strip`: Frank close-fit 2D coefficients, ordinary strip
theory in relative-motion form, Gerritsma-Beukelman radiated energy), compares it with STAWAVE-2 on an
in-range Wigley (L/B 7, B/T 2.5) and on the monohull, and reruns 7y's sections A and B with the strip-theory
motion term in place of STAWAVE-2's (the short-wave reflection term stays STAWAVE-2's: strip theory has none).

Expectations (committed to LOG.md before the first run, 0c63b1567): S1 verification; S2 in-range peak
within a factor 2 of STAWAVE-2 and at lambda/L within 0.3; S3 pooled head-sea motion term at 1.0 m/s in
0.7-2.8 N (7y: 1.39 N); S4 30 W monohull loss at share 0.25 in 1-6% (7y: 2.52%); S5 200 W scope survives
at every H_lim (share 0.25); S6 30 W best speed moves by at most 0.10 m/s.
"""
import math
import sys
import time
from collections import defaultdict

from marine_hull import strip as st
from marine_hull import waves as wv
import run_air_drag as ad
import run_hotel_ranking as hr
import run_michell as rm
import run_range_speed as rr
import run_wave_added_resistance as rw

FRS = [0.15, 0.20, 0.25]
LAM = [0.3 + 0.05 * i for i in range(55)]        # lambda / L, 0.30 to 3.00


def sigma_curve(hull, fr, lam=LAM):
    """[(lambda/L, strip sigma, STAWAVE-2 motion sigma)], sigma = R_aw / (rho g zeta^2 B^2 / L)."""
    u = fr * math.sqrt(st.G * hull.l)
    norm = st.RHO * st.G * hull.bm ** 2 / hull.l
    out = []
    for x in lam:
        k = 2.0 * math.pi / (x * hull.l)
        w = math.sqrt(k * st.G)
        s = hull.response(w, u)[2] / norm
        sw = wv.rao_parts(w, u, hull.l, hull.bm, hull.t, rw.CB, rw.KYY)[0] / norm
        out.append((x, s, sw))
    return out


def peak(curve, col):
    best = max(curve, key=lambda c: c[col])
    return best[0], best[col]


class StripWaveTable:
    """Drop-in for 7y's WaveTable: (strip-theory motion term, STAWAVE-2 reflection term) per speed."""

    def __init__(self, hull, speeds, t01s, omegas=wv.OMEGAS):
        self.speeds = speeds
        l, b, t = hull.l, hull.bm, hull.t
        raos = [[hull.response(w, u)[2] for w in omegas] for u in speeds]
        refl = [[wv.rao_parts(w, u, l, b, t, rw.CB, rw.KYY)[1] for w in omegas] for u in speeds]
        self.f = {}
        for t01 in sorted(set(t01s)):
            s = [wv.ittc_spectrum(w, 1.0, t01) for w in omegas]
            self.f[t01] = [(2.0 * wv.trap([r * x for r, x in zip(ra, s)], omegas),
                            2.0 * wv.trap([r * x for r, x in zip(rf, s)], omegas)) for ra, rf in zip(raos, refl)]

    mean = rw.WaveTable.mean


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    recs = rw.read_waves()
    n = len(recs)
    l, b, t = rm.hull(4.0, 1)[:3]
    pr(f"basis: 7y unchanged (200 kg, {rr.WH:.0f} Wh, eta 0.55 x 0.85, central rungs, {n} NDBC records, ITTC 1978 spectrum); "
       f"strip theory: Frank close-fit 16 panels per half-section, 30 stations, kyy {rw.KYY} L, Smith depth 2T/3")
    pr(f"monohull L {l:g} B {b:.3f} T {t:.3f} (L/B {l / b:.1f}, B/T {b / t:.2f}); in-range Wigley L/B 7.0, B/T 2.50")

    # V. verification
    pr("## V. verification")
    pr(f"check: E1(1) {st.e1(1.0).real:.10f} (A&S 5.1: 0.2193839344); E1(i) {st.e1(1j).real:.10f}{st.e1(1j).imag:+.10f}i "
       f"(-Ci(1) {-0.3374039229:.10f}, Si(1) - pi/2 {0.9460830704 - math.pi / 2:+.10f})")
    nu, bb, cc = 1.3, 0.4, -0.6
    res = []
    for y in (0.1, 1.0, 3.0):
        h = 1e-6
        gz = (st.green(y, -h, bb, cc, nu) - st.green(y, -3 * h, bb, cc, nu)) / (2 * h)
        g0 = st.green(y, -2 * h, bb, cc, nu)
        res.append(abs(gz - nu * g0) / abs(g0))
    pr(f"check: free-surface residual |G_z - nu G| / |G| at z = -2e-6, y 0.1/1/3: {max(res):.1e}")
    far = st.wave_part(60.0, -0.3, bb, cc, nu) / (2j * math.pi * math.exp(nu * (cc - 0.3)) * complex(math.cos(nu * (60.0 - bb)), -math.sin(nu * (60.0 - bb))))
    pr(f"check: wave part at y = 60 over 2 pi i e^(nu(z+c)) e^(-i nu |y-b|): {far.real:.5f}{far.imag:+.5f}i (outgoing: 1)")
    mono = st.WigleyStrip(l, b, t)
    lo, ld = 7.0, 2.5
    inr = st.WigleyStrip(4.0, 4.0 / lo, 4.0 / lo / ld)
    for nm, hh in (("monohull", mono), ("in-range", inr)):
        tb = hh.table
        pr(f"check: {nm} section table {len(tb.ratios)} ratios x {len(tb.nu_t)} nu T: energy balance (near- vs far-field "
           f"damping) within 3% at {tb.n_points - tb.n_irregular} points, max kept mismatch {100 * tb.max_mismatch:.2f}%; "
           f"{tb.n_irregular} points ({100 * tb.n_irregular / tb.n_points:.1f}%) near irregular frequencies interpolated")
    for u in (0.0, 1.0):
        for x in (20.0, 10.0):
            k = 2 * math.pi / (x * l)
            z, th, r, _ = mono.response(math.sqrt(k * st.G), u)
            pr(f"check: monohull U {u:.1f} m/s lambda/L {x:g}: |heave| {abs(z):.4f} (1), |pitch|/k {abs(th) / k:.4f} (1), "
               f"sigma {r / (st.RHO * st.G * b * b / l):.5f} (0)")
    # convergence at the monohull's Fr 0.16 peak
    c0 = sigma_curve(mono, 0.16)
    x0, s0 = peak(c0, 1)
    fine = st.WigleyStrip(l, b, t, n_stations=60, n_panels=24)
    c1 = sigma_curve(fine, 0.16)
    x1, s1 = peak(c1, 1)
    pr(f"convergence: monohull Fr 0.16 strip peak sigma {s0:.3f} at lambda/L {x0:.2f} (16 panels, 30 stations); "
       f"{s1:.3f} at {x1:.2f} (24 panels, 60 stations), {100 * (s0 / s1 - 1):+.1f}%")

    # A. regular waves
    pr("## A. regular head waves, sigma = R_aw / (rho g zeta^2 B^2 / L): strip theory (GB) against STAWAVE-2 motion term")
    curves = {}
    for nm, hh in (("in-range", inr), ("monohull", mono)):
        for fr in FRS + ([0.16] if nm == "monohull" else []):
            c = sigma_curve(hh, fr)
            curves[(nm, fr)] = c
            xs, ss = peak(c, 1)
            xw, sw = peak(c, 2)
            area_s = sum(r[1] for r in c)
            area_w = sum(r[2] for r in c)
            pr(f"{nm} Fr {fr:.2f}: strip peak {ss:.2f} at lambda/L {xs:.2f}; STAWAVE-2 peak {sw:.2f} at {xw:.2f}; "
               f"peak ratio {ss / sw:.2f}, lambda/L shift {xs - xw:+.2f}; area ratio over 0.3-3.0 {area_s / area_w:.2f}")
    pr("# curve: hull Fr lambda/L sigma_strip sigma_stawave")
    for (nm, fr), c in curves.items():
        for x, s, sw in c:
            pr(f"curve {nm} {fr:.2f} {x:.2f} {s:.4f} {sw:.4f}")

    # B. pooled irregular head seas
    t01s = [rw.t01_of(r, "apd") for r in recs] + [rw.t01_of(r, "dpd") for r in recs]
    strip_t = StripWaveTable(mono, rr.DISP, t01s)
    sta_t = rw.WaveTable(rr.DISP, 1, t01s)
    sp, rp = strip_t.mean(recs)
    wp = sta_t.mean(recs)
    mono0, rungs0 = ad.base_rungs()
    rung = {nm: (s_, r_) for nm, s_, r_ in rungs0}
    foil_sp, foil0 = rung["hydrofoil"]
    pr("## B. pooled irregular head seas (T01 from APD), monohull, N")
    for u in (0.5, 1.0, 1.5, 2.0, 2.3, 3.0):
        i = rr.DISP.index(round(u * 20) / 20)
        pr(f"U {u:.2f} m/s (Fr {wv.froude(u, 4.0):.3f}): motion strip {sp[i]:.2f}, STAWAVE-2 {wp[0][i]:.2f} (ratio {sp[i] / wp[0][i]:.2f}); "
           f"reflection {rp[i]:.2f}; calm water {mono0[i]:.2f}")

    # C. 7y section A with the strip motion term
    calm = hr.peak_at(rr.DISP, mono0, 30.0)
    pr("## C. monohull at 30 W: calm, STAWAVE-2 (7y), strip motion + STAWAVE-2 reflection")
    for share in rw.SHARES:
        a7 = hr.peak_at(rr.DISP, rw.add(mono0, rw.tot(wp), share), 30.0)
        az = hr.peak_at(rr.DISP, rw.add(mono0, rw.tot((sp, rp)), share), 30.0)
        pr(f"share {share:g}: calm {calm[0]:.1f} km at {calm[1]:.2f} m/s; STAWAVE-2 {a7[0]:.1f} km ({100 * (a7[0] / calm[0] - 1):+.2f}%) "
           f"at {a7[1]:.2f}; strip {az[0]:.1f} km ({100 * (az[0] / calm[0] - 1):+.2f}%) at {az[1]:.2f} m/s ({az[1] - calm[1]:+.2f})")
    sd, rd = strip_t.mean(recs, "dpd")
    for share in rw.SHARES:
        az = hr.peak_at(rr.DISP, rw.add(mono0, rw.tot((sd, rd)), share), 30.0)
        pr(f"sensitivity T01 = 0.772 DPD, share {share:g}: strip {az[0]:.1f} km ({100 * (az[0] / calm[0] - 1):+.2f}%) at {az[1]:.2f} m/s")
    # per buoy-month
    by = defaultdict(list)
    for r in recs:
        by[r[0]].append(r)
    loss = []
    for key in sorted(by):
        az = hr.peak_at(rr.DISP, rw.add(mono0, rw.tot(strip_t.mean(by[key])), 0.25), 30.0)
        loss.append((100 * (az[0] / calm[0] - 1), key))
    pr(f"per buoy-month, share 0.25: strip 30 W change {min(loss)[0]:+.2f}% ({min(loss)[1]}) to {max(loss)[0]:+.2f}% ({max(loss)[1]})")

    # D. foil-favourable comparison
    pr("## D. foil-favourable (foil flies only where Hs <= H_lim, pays no wave term), strip motion on the monohull")
    box = rw.foil_box()
    mono_k25 = rr.michell_r(4.0, 1, 0.0, 0.25, 0.0, rr.DISP)
    for share in rw.SHARES:
        for hl in rw.HLIMS:
            sub = [r for r in recs if hl is None or r[1] <= hl]
            parts = strip_t.mean(sub)
            mres = rw.add(mono0, rw.tot(parts), share)
            be = rw.break_even(foil_sp, foil0, mres)
            mb = rw.add(mono_k25, rw.tot(parts), share)
            mk = [hr.peak_at(rr.DISP, mb, x)[0] for x in hr.HOTELS]
            bes, below = [], 0
            for c in box:
                x = hr.crossing(hr.HOTELS, [hr.peak_at(rr.FAST, c, h_)[0] / m for h_, m in zip(hr.HOTELS, mk)])
                if x is not None:
                    bes.append(x)
                    below += x <= hr.SOURCED_BAND
            lead = all(hr.peak_at(foil_sp, foil0, x)[0] <= hr.peak_at(rr.DISP, mres, x)[0]
                       for x in hr.HOTELS if x <= hr.SOURCED_BAND)
            pr(f"share {share:g}, H_lim {'none' if hl is None else f'{hl:g} m'}: foilborne {100 * len(sub) / n:.1f}% of hours; "
               f"central foil break-even {hr.fmt_w(be)}; monohull leads to 200 W: {lead}; box overtake by 10 kW {len(bes)}, "
               f"min {min(bes):.0f} W, median {hr.q(bes, 0.5):.0f}; at or below 200 W: {below}")

    pr("# curve: share hotel_W monohull_km_calm monohull_km_stawave monohull_km_strip")
    for share in rw.SHARES:
        r7 = rw.add(mono0, rw.tot(wp), share)
        rz = rw.add(mono0, rw.tot((sp, rp)), share)
        for x in hr.HOTELS:
            pr(f"hotel {share:g} {x:.1f} {hr.peak_at(rr.DISP, mono0, x)[0]:.2f} {hr.peak_at(rr.DISP, r7, x)[0]:.2f} "
               f"{hr.peak_at(rr.DISP, rz, x)[0]:.2f}")
    print(f"runtime {time.time() - t0:.0f} s", file=sys.stderr)


if __name__ == "__main__":
    main()
