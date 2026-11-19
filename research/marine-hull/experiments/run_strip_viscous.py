"""Milestone 7za: does 7z's strip-theory wave term survive viscous heave and pitch damping?

    PYTHONPATH=src:experiments python3 experiments/run_strip_viscous.py > experiments/results_strip_viscous.txt

7z found the Gerritsma-Beukelman (strip-theory) motion term about twice STAWAVE-2's on the 4 m monohull,
carried by a sharp heave/pitch resonance damped only by wave radiation. This script adds an equivalent
linear viscous damping B_v = 2 zeta sqrt(C (M + A)) to the heave and pitch equations (`WigleyStrip.zeta_v`)
and sweeps zeta 0 to 0.20 (no measured value exists for this notional hull). Viscous damping radiates no
waves, so it changes R_aw only through the motions.

Expectations (committed to LOG.md before the first run, 0d814d58f): D1 zeta 0 reproduces 7z; D2 radiation
damping at the zero-speed heave natural frequency under 15% of critical; D3 Fr 0.16 peak monotone in zeta,
peak ratio to STAWAVE-2 under 3 at zeta 0.10; D4 pooled 1.00 m/s ratio in 1.2-2.0 at zeta 0.10; D5 in-range
area ratio falls by a smaller fraction than the monohull's (zeta 0 -> 0.20); D6 30 W loss (share 0.25)
monotone and between 2.52% and 4.31% for zeta > 0; D7 200 W scope holds at every zeta.
"""
import math
import sys
import time

from marine_hull import strip as st
import run_air_drag as ad
import run_hotel_ranking as hr
import run_michell as rm
import run_range_speed as rr
import run_strip_added_resistance as rs
import run_wave_added_resistance as rw

ZETAS = [0.0, 0.025, 0.05, 0.10, 0.15, 0.20]


def area(c, col):
    return sum(r[col] for r in c)


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    recs = rw.read_waves()
    l, b, t = rm.hull(4.0, 1)[:3]
    mono0_hull = st.WigleyStrip(l, b, t)
    inr0 = st.WigleyStrip(4.0, 4.0 / 7.0, 4.0 / 7.0 / 2.5)
    pr(f"basis: 7z unchanged (monohull L {l:g} B {b:.3f} T {t:.3f}; in-range Wigley L/B 7.0 B/T 2.50; {len(recs)} NDBC records; "
       f"Frank close-fit 16 panels, 30 stations, kyy {rw.KYY} L); viscous B_v = 2 zeta sqrt(C (M + A)) in heave and pitch, "
       f"A at the zero-speed natural frequency; R_aw from radiation damping only")

    pr("## N. natural frequencies and radiation damping (zero speed)")
    for nm, hh in (("monohull", mono0_hull), ("in-range", inr0)):
        c33, c55 = hh.restoring()
        (w3, a33, b33), (w5, a55, b55) = hh.natural()
        z3 = b33 / (2 * math.sqrt(c33 * (hh.mass + a33)))
        z5 = b55 / (2 * math.sqrt(c55 * (hh.iyy + a55)))
        lam3 = 2 * math.pi * st.G / w3 ** 2 / hh.l
        pr(f"{nm}: heave w_n {w3:.3f} rad/s (T {2 * math.pi / w3:.2f} s, A33/M {a33 / hh.mass:.3f}, lambda/L at w_n {lam3:.2f}), "
           f"radiation damping {100 * z3:.1f}% of critical; pitch w_n {w5:.3f} rad/s (A55/I {a55 / hh.iyy:.3f}), "
           f"radiation damping {100 * z5:.1f}% of critical")

    t01s = [rw.t01_of(r, "apd") for r in recs]
    sta_t = rw.WaveTable(rr.DISP, 1, t01s)
    wp = sta_t.mean(recs)
    mono_calm, rungs0 = ad.base_rungs()
    rung = {nm: (s_, r_) for nm, s_, r_ in rungs0}
    foil_sp, foil0 = rung["hydrofoil"]
    calm = hr.peak_at(rr.DISP, mono_calm, 30.0)
    box = rw.foil_box()
    mono_k25 = rr.michell_r(4.0, 1, 0.0, 0.25, 0.0, rr.DISP)
    a7 = {s: hr.peak_at(rr.DISP, rw.add(mono_calm, rw.tot(wp), s), 30.0) for s in rw.SHARES}
    pr(f"reference: calm 30 W range {calm[0]:.1f} km at {calm[1]:.2f} m/s; STAWAVE-2 (7y) "
       + "; ".join(f"share {s:g} {100 * (a7[s][0] / calm[0] - 1):+.2f}%" for s in rw.SHARES))

    rows = []
    for z in ZETAS:
        mono = st.WigleyStrip(l, b, t, table=mono0_hull.table, zeta_v=z)
        inr = st.WigleyStrip(4.0, 4.0 / 7.0, 4.0 / 7.0 / 2.5, table=inr0.table, zeta_v=z)
        pr(f"## zeta {z:g} (B_v33 {mono.bv33:.1f} N s/m, B_v55 {mono.bv55:.1f} N m s on the monohull)")
        rec = {"zeta": z}
        for nm, hh, fr in (("monohull", mono, 0.16), ("monohull", mono, 0.20), ("in-range", inr, 0.20)):
            c = rs.sigma_curve(hh, fr)
            xs, ss = rs.peak(c, 1)
            xw, sw = rs.peak(c, 2)
            ar = area(c, 1) / area(c, 2)
            rec[(nm, fr)] = (ss, ss / sw, ar)
            pr(f"A {nm} Fr {fr:.2f}: strip peak {ss:.2f} at lambda/L {xs:.2f}; STAWAVE-2 {sw:.2f} at {xw:.2f}; "
               f"peak ratio {ss / sw:.2f}; area ratio {ar:.2f}")
        strip_t = rs.StripWaveTable(mono, rr.DISP, t01s)
        sp, rp = strip_t.mean(recs)
        parts = []
        for u in (0.5, 1.0, 1.5, 2.3):
            i = rr.DISP.index(round(u * 20) / 20)
            parts.append(f"{u:.2f} m/s {sp[i]:.2f} N (ratio {sp[i] / wp[0][i]:.2f})")
            if u == 1.0:
                rec["ratio1"] = sp[i] / wp[0][i]
        pr("B pooled head-sea motion term: " + "; ".join(parts))
        for s in rw.SHARES:
            az = hr.peak_at(rr.DISP, rw.add(mono_calm, rw.tot((sp, rp)), s), 30.0)
            loss = 100 * (az[0] / calm[0] - 1)
            rec[("loss", s)] = loss
            pr(f"C share {s:g}: 30 W range {az[0]:.1f} km ({loss:+.2f}%) at {az[1]:.2f} m/s ({az[1] - calm[1]:+.2f})")
        ok = True
        for hl in (None, 1.0):
            sub = [r for r in recs if hl is None or r[1] <= hl]
            pt = strip_t.mean(sub)
            mres = rw.add(mono_calm, rw.tot(pt), 0.25)
            be = rw.break_even(foil_sp, foil0, mres)
            mb = rw.add(mono_k25, rw.tot(pt), 0.25)
            mk = [hr.peak_at(rr.DISP, mb, x)[0] for x in hr.HOTELS]
            below = 0
            for c in box:
                x = hr.crossing(hr.HOTELS, [hr.peak_at(rr.FAST, c, h_)[0] / m for h_, m in zip(hr.HOTELS, mk)])
                below += x is not None and x <= hr.SOURCED_BAND
            lead = all(hr.peak_at(foil_sp, foil0, x)[0] <= hr.peak_at(rr.DISP, mres, x)[0]
                       for x in hr.HOTELS if x <= hr.SOURCED_BAND)
            ok = ok and lead and below == 0
            pr(f"D share 0.25, H_lim {'none' if hl is None else f'{hl:g} m'}: central foil break-even {hr.fmt_w(be)}; "
               f"monohull leads to 200 W: {lead}; box cases at or below 200 W: {below} of {len(box)}")
        rec["scope"] = ok
        rows.append(rec)

    pr("## summary")
    pr("# table: zeta mono_fr016_peak_ratio mono_fr016_area_ratio inrange_fr020_area_ratio pooled_1ms_ratio loss30W_share025 loss30W_share1 scope200W")
    for r in rows:
        pr(f"row {r['zeta']:.3f} {r[('monohull', 0.16)][1]:.2f} {r[('monohull', 0.16)][2]:.2f} {r[('in-range', 0.20)][2]:.2f} "
           f"{r['ratio1']:.2f} {r[('loss', 0.25)]:.2f} {r[('loss', 1.0)]:.2f} {r['scope']}")
    m0, m1 = rows[0][("monohull", 0.16)][2], rows[-1][("monohull", 0.16)][2]
    i0, i1 = rows[0][("in-range", 0.20)][2], rows[-1][("in-range", 0.20)][2]
    pr(f"area ratio fall zeta 0 -> {ZETAS[-1]:g}: monohull Fr 0.16 {m0:.2f} -> {m1:.2f} ({100 * (m1 / m0 - 1):+.0f}%); "
       f"in-range Fr 0.20 {i0:.2f} -> {i1:.2f} ({100 * (i1 / i0 - 1):+.0f}%)")
    pr(f"check: pooled 1.00 m/s ratio at zeta 0.10 to four digits {rows[ZETAS.index(0.10)]['ratio1']:.4f}")

    # Post hoc (added after the first run, not in the committed plan): calibrate zeta on the in-range Wigley, where
    # STAWAVE-2 is inside its fit range, so that strip theory's Fr 0.20 area matches STAWAVE-2's; carry that zeta
    # to the monohull. This assumes STAWAVE-2 is right in range and that the missing damping is the same fraction
    # of critical on both hulls; neither is tested here.
    pr("## post hoc: zeta calibrated on the in-range Wigley (strip area = STAWAVE-2 area at Fr 0.20), carried to the monohull")

    def inr_area(z):
        h = st.WigleyStrip(4.0, 4.0 / 7.0, 4.0 / 7.0 / 2.5, table=inr0.table, zeta_v=z)
        c = rs.sigma_curve(h, 0.20)
        return area(c, 1) / area(c, 2)

    lo, hi = 0.05, 0.10
    flo, fhi = inr_area(lo) - 1.0, inr_area(hi) - 1.0
    for _ in range(30):
        mid = 0.5 * (lo + hi)
        fm = inr_area(mid) - 1.0
        if abs(fm) < 1e-4:
            break
        if (fm > 0) == (flo > 0):
            lo, flo = mid, fm
        else:
            hi, fhi = mid, fm
    zc = mid
    mono = st.WigleyStrip(l, b, t, table=mono0_hull.table, zeta_v=zc)
    c16 = rs.sigma_curve(mono, 0.16)
    strip_t = rs.StripWaveTable(mono, rr.DISP, t01s)
    sp, rp = strip_t.mean(recs)
    i1 = rr.DISP.index(1.0)
    pr(f"calibrated zeta {zc:.3f} (in-range Fr 0.20 area ratio {fm + 1.0:.4f}); monohull Fr 0.16 area ratio "
       f"{area(c16, 1) / area(c16, 2):.2f}; pooled 1.00 m/s motion {sp[i1]:.2f} N (ratio {sp[i1] / wp[0][i1]:.2f})")
    for s in rw.SHARES:
        az = hr.peak_at(rr.DISP, rw.add(mono_calm, rw.tot((sp, rp)), s), 30.0)
        pr(f"calibrated share {s:g}: 30 W range {az[0]:.1f} km ({100 * (az[0] / calm[0] - 1):+.2f}%) at {az[1]:.2f} m/s")
    print(f"runtime {time.time() - t0:.0f} s", file=sys.stderr)


if __name__ == "__main__":
    main()
