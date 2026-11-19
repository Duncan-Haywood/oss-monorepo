"""Milestone 7zd: strip theory and STAWAVE-2 against tank data on an in-range slender Wigley.

    PYTHONPATH=src:experiments python3 experiments/run_wigley_seakeeping_tank.py > experiments/results_wigley_seakeeping_tank.txt

Data: Kashiwagi (2022), J. Ship Research 66(1) 1-14, doi:10.5957/JOSR.04200028, Figs. 2 and 3: measured heave,
pitch and added resistance of a slender modified Wigley (L 2 m, B 0.3 m, d 0.125 m, CB 0.5607, kyy 0.248 L) at
Fn 0.2 in regular head waves; points read from the PDF's vector markers by `digitise_kashiwagi2022.py` into
`data/kashiwagi2022_slender_wigley_fn020.csv`. The hull is inside STAWAVE-2's L/B (4-9) and B/T (2.2-9) range.

Methods: 7z's strip theory with Gerritsma-Beukelman added resistance on the modified-Wigley sections
(`strip.ModifiedWigleyStrip`); STAWAVE-2 (`waves.rao_parts`, 7y). The programme's combination is strip motion
plus STAWAVE-2 reflection. Then the 7za viscous-damping zeta is fitted to the measured area (instead of to
STAWAVE-2) and carried to the 4 m monohull for the 30 W range loss and the 200 W scope.

Expectations (committed to LOG.md before the first run, 019c593b4): K1 heave within 25% at lambda/L 1.0-1.3,
pitch within 25% at 1.3-2.0; K2 strip peak in 7.0-16.6 at lambda/L within 0.15 of 1.10-1.15; K3 STAWAVE-2 total
peak below 7; K4 strip+reflection area in 0.75-1.33 of measured mean, STAWAVE-2 under 0.75; K5 at lambda/L
0.3-0.6 strip alone under half the measured mean, with reflection within 50%; K6 measured-calibrated zeta under
0.05 and monohull 30 W loss (share 0.25) in 3.3-4.31%; K7 200 W scope holds.
"""
import csv
import math
import os
import sys
import time
from collections import defaultdict

from marine_hull import strip as st
from marine_hull import waves as wv
import run_air_drag as ad
import run_hotel_ranking as hr
import run_michell as rm
import run_range_speed as rr
import run_strip_added_resistance as rs
import run_wave_added_resistance as rw

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data", "kashiwagi2022_slender_wigley_fn020.csv")
L, B, D, CB, KYY, RHO, FN = 2.0, 0.3, 0.125, 0.5607, 0.248, 1000.0, 0.2
SERIES = ["dyn_2p5cm", "dyn_1p0cm", "measured_wave_1p0cm", "superposed_wave_1p0cm"]


def read_data(path=DATA):
    rows = defaultdict(list)
    with open(path) as f:
        for r in csv.DictReader(f):
            rows[r["series"]].append((float(r["lambda_over_L"]), float(r["value"])))
    return rows


def by_lambda(pts):
    """Average repeated runs at the same lambda/L (to 0.01): sorted [(lambda/L, mean value)]."""
    g = defaultdict(list)
    for x, v in pts:
        g[round(x, 2)].append(v)
    return sorted((x, sum(v) / len(v)) for x, v in g.items())


def trap(curve):
    return sum(0.5 * (curve[i][1] + curve[i + 1][1]) * (curve[i + 1][0] - curve[i][0]) for i in range(len(curve) - 1))


class Predict:
    """sigma = R_aw / (rho g zeta^2 B^2/L) and motions of the modified Wigley at Fn 0.2, per lambda/L."""

    def __init__(self, hull):
        self.h = hull
        self.u = FN * math.sqrt(st.G * L)
        self.norm = RHO * st.G * B * B / L

    def at(self, lam):
        k = 2.0 * math.pi / (lam * L)
        w = math.sqrt(k * st.G)
        z, th, raw, _ = self.h.response(w, self.u)
        ml, rl = wv.rao_parts(w, self.u, L, B, D, CB, KYY, rho=RHO)
        return dict(heave=abs(z), pitch=abs(th) / k, strip=raw / self.norm, refl=rl / self.norm,
                    sta_motion=ml / self.norm, sta=(ml + rl) / self.norm)


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    t0 = time.time()
    data = read_data()
    hull0 = st.ModifiedWigleyStrip(L, B, D)
    pred = Predict(hull0)
    pr(f"hull: modified Wigley (Kashiwagi 2022 eq. 42) L {L:g} m B {B:g} m d {D:g} m (L/B {L / B:.2f}, B/T {B / D:.2f}); "
       f"from the form: volume {hull0.vol:.5f} m3 (CB {hull0.vol / (L * B * D):.4f}), Aw {hull0.area_wp:.4f} m2, "
       f"Smith depth {hull0.dm:.4f} m; kyy {KYY} L; fresh water; Fn {FN} (U {pred.u:.3f} m/s); 30 stations, 16 panels")
    tb = hull0.table
    pr(f"check: section table {len(tb.ratios)} stations x {len(tb.nu_t)} nu T: {tb.n_irregular} points near irregular "
       f"frequencies interpolated; max kept near/far damping mismatch {100 * tb.max_mismatch:.2f}%")
    c33, c55 = hull0.restoring()
    (w3, a33, b33), (w5, a55, b55) = hull0.natural()
    pr(f"zero-speed natural: heave {w3:.3f} rad/s (radiation damping {100 * b33 / (2 * math.sqrt(c33 * (hull0.mass + a33))):.1f}% "
       f"of critical), pitch {w5:.3f} rad/s ({100 * b55 / (2 * math.sqrt(c55 * (hull0.iyy + a55))):.1f}%)")

    pr("## A. motions against measured (Fig. 2)")
    k1 = True
    for q, lo, hi in (("heave", 1.0, 1.3), ("pitch", 1.3, 2.0)):
        errs = []
        for x, v in sorted(data[q]):
            p = pred.at(x)[q]
            tag = ""
            if lo <= x <= hi + 1e-9:
                errs.append(p / v - 1)
                tag = " *"
            pr(f"{q} lambda/L {x:.3f}: measured {v:.3f}, strip {p:.3f} ({100 * (p / v - 1):+.0f}%){tag}")
        worst = max(errs, key=abs)
        k1 = k1 and abs(worst) <= 0.25
        pr(f"{q} in lambda/L {lo}-{hi}: {len(errs)} points, mean error {100 * sum(errs) / len(errs):+.1f}%, worst {100 * worst:+.1f}%")
    pr(f"K1 (within 25%): {k1}")

    pr("## B. added resistance against measured (Fig. 3)")
    allpts = [p for s in SERIES for p in data[s]]
    mean = by_lambda(allpts)
    lams = [x for x, _ in mean]
    P = {x: pred.at(x) for x in lams}
    pr("# table: lambda_L measured_mean n strip strip_plus_refl stawave2 stawave2_motion")
    for x, v in mean:
        n = sum(1 for p in allpts if round(p[0], 2) == x)
        p = P[x]
        pr(f"row {x:.2f} {v:.3f} {n} {p['strip']:.3f} {p['strip'] + p['refl']:.3f} {p['sta']:.3f} {p['sta_motion']:.3f}")
    fine = [0.30 + 0.01 * i for i in range(171)]
    F = [(x, pred.at(x)) for x in fine]
    for key, nm in (("strip", "strip"), ("sp", "strip+refl"), ("sta", "STAWAVE-2")):
        cur = [(x, p["strip"] + p["refl"] if key == "sp" else p[key]) for x, p in F]
        xb, vb = max(cur, key=lambda c: c[1])
        pr(f"{nm} peak {vb:.2f} at lambda/L {xb:.2f}")
    pr("measured series:")
    sp_curve = [(x, P[x]["strip"] + P[x]["refl"]) for x in lams]
    for s in SERIES:
        c = by_lambda(data[s])
        xb, vb = max(c, key=lambda q: q[1])
        xs = [x for x, _ in c]
        a_m = trap(c)
        a_sp = trap([(x, pred.at(x)["strip"] + pred.at(x)["refl"]) for x in xs])
        a_st = trap([(x, pred.at(x)["sta"]) for x in xs])
        pr(f"  {s}: {len(data[s])} points, lambda/L {xs[0]:.2f}-{xs[-1]:.2f}, peak {vb:.2f} at {xb:.2f}; area {a_m:.3f}; "
           f"strip+refl/measured {a_sp / a_m:.2f}, STAWAVE-2/measured {a_st / a_m:.2f}")
    am = trap(mean)
    a_strip = trap([(x, P[x]["strip"]) for x in lams])
    a_sp = trap(sp_curve)
    a_st = trap([(x, P[x]["sta"]) for x in lams])
    pr(f"area over lambda/L {lams[0]:.2f}-{lams[-1]:.2f} (trapezoid on the measured lambdas): measured mean {am:.3f}; "
       f"strip {a_strip:.3f} ({a_strip / am:.2f}); strip+refl {a_sp:.3f} ({a_sp / am:.2f}); STAWAVE-2 {a_st:.3f} ({a_st / am:.2f})")
    short = [(x, v) for x, v in mean if x <= 0.6 + 1e-9]
    ms = sum(v for _, v in short) / len(short)
    ss = sum(P[x]["strip"] for x, _ in short) / len(short)
    sr = sum(P[x]["strip"] + P[x]["refl"] for x, _ in short) / len(short)
    sw = sum(P[x]["sta"] for x, _ in short) / len(short)
    pr(f"short waves lambda/L 0.3-0.6 ({len(short)} lambdas): measured mean {ms:.3f}; strip {ss:.3f} ({ss / ms:.2f}); "
       f"strip+refl {sr:.3f} ({sr / ms:.2f}); STAWAVE-2 {sw:.3f} ({sw / ms:.2f})")

    pr("## C. zeta fitted to the measured area (strip+refl), carried to the 4 m monohull")

    def area_ratio(z, target, xs):
        h = st.ModifiedWigleyStrip(L, B, D, table=hull0.table, zeta_v=z)
        pp = Predict(h)
        return trap([(x, pp.at(x)["strip"] + pp.at(x)["refl"]) for x in xs]) / target

    def fit(target, xs):
        if area_ratio(0.0, target, xs) <= 1.0:
            return 0.0
        lo, hi = 0.0, 0.4
        for _ in range(40):
            mid = 0.5 * (lo + hi)
            if area_ratio(mid, target, xs) > 1.0:
                lo = mid
            else:
                hi = mid
        return 0.5 * (lo + hi)

    fits = {"mean": fit(am, lams)}
    for s in SERIES:
        c = by_lambda(data[s])
        fits[s] = fit(trap(c), [x for x, _ in c])
    for k, z in fits.items():
        pr(f"fitted zeta ({k}): {z:.3f}")

    recs = rw.read_waves()
    l, b, t = rm.hull(4.0, 1)[:3]
    mono0 = st.WigleyStrip(l, b, t)
    t01s = [rw.t01_of(r, "apd") for r in recs]
    sta_t = rw.WaveTable(rr.DISP, 1, t01s)
    wp = sta_t.mean(recs)
    mono_calm, rungs0 = ad.base_rungs()
    rung = {nm: (s_, r_) for nm, s_, r_ in rungs0}
    foil_sp, foil0 = rung["hydrofoil"]
    calm = hr.peak_at(rr.DISP, mono_calm, 30.0)
    box = rw.foil_box()
    mono_k25 = rr.michell_r(4.0, 1, 0.0, 0.25, 0.0, rr.DISP)
    pr(f"reference: calm 30 W range {calm[0]:.1f} km at {calm[1]:.2f} m/s")
    def mono_eval(z, refl_scale=1.0):
        mono = st.WigleyStrip(l, b, t, table=mono0.table, zeta_v=z)
        strip_t = rs.StripWaveTable(mono, rr.DISP, t01s)
        if refl_scale != 1.0:
            strip_t.f = {k: [(m, refl_scale * r) for m, r in v] for k, v in strip_t.f.items()}
        sp, rp = strip_t.mean(recs)
        i1 = rr.DISP.index(1.0)
        loss = {}
        for s in rw.SHARES:
            az = hr.peak_at(rr.DISP, rw.add(mono_calm, rw.tot((sp, rp)), s), 30.0)
            loss[s] = 100 * (az[0] / calm[0] - 1)
        ok = True
        for hl in (None, 1.0):
            sub = [r for r in recs if hl is None or r[1] <= hl]
            pt = strip_t.mean(sub)
            mres = rw.add(mono_calm, rw.tot(pt), 0.25)
            mb = rw.add(mono_k25, rw.tot(pt), 0.25)
            mk = [hr.peak_at(rr.DISP, mb, x)[0] for x in hr.HOTELS]
            below = 0
            for c in box:
                x = hr.crossing(hr.HOTELS, [hr.peak_at(rr.FAST, c, h_)[0] / m for h_, m in zip(hr.HOTELS, mk)])
                below += x is not None and x <= hr.SOURCED_BAND
            lead = all(hr.peak_at(foil_sp, foil0, x)[0] <= hr.peak_at(rr.DISP, mres, x)[0]
                       for x in hr.HOTELS if x <= hr.SOURCED_BAND)
            ok = ok and lead and below == 0
        return f"{z:.3f} {sp[i1]:.2f} {sp[i1] / wp[0][i1]:.2f} {rp[i1]:.2f} {loss[0.25]:.2f} {loss[1.0]:.2f} {ok}"

    zs = sorted(set([0.0, 0.091] + [round(z, 3) for z in fits.values()]))
    pr("# table: zeta pooled_1ms_motion_N ratio_to_stawave2 pooled_1ms_reflection_N loss30W_share025 loss30W_share1 scope200W")
    for z in zs:
        pr("row " + mono_eval(z))
    pr("note: zeta 0.091 is 7za's STAWAVE-2-calibrated value, kept for comparison")

    # Post hoc (added after the first run, not in the committed plan). Section B showed STAWAVE-2's reflection
    # term alone at lambda/L 0.3-0.6 about twice the measured total on this hull, so the programme's
    # strip-plus-reflection combination overshoots short waves and the area fit of section C absorbs that into
    # zeta. Here the reflection term is scaled by f_r = (measured - strip) / reflection averaged over lambda/L
    # 0.3-0.6, zeta is refitted with the scaled term, and both are carried to the monohull. That f_r transfers
    # from this hull (d 0.125 m) to the monohull (T 0.274 m) is an untested assumption.
    pr("## D. post hoc: reflection term scaled to the short-wave measurements, zeta refitted")
    fr = sum(v - P[x]["strip"] for x, v in short) / sum(P[x]["refl"] for x, _ in short)
    pr(f"reflection scale f_r {fr:.3f} (lambda/L 0.3-0.6)")

    def area_ratio_r(z, target, xs):
        h = st.ModifiedWigleyStrip(L, B, D, table=hull0.table, zeta_v=z)
        pp = Predict(h)
        return trap([(x, pp.at(x)["strip"] + fr * pp.at(x)["refl"]) for x in xs]) / target

    if area_ratio_r(0.0, am, lams) <= 1.0:
        zr = 0.0
    else:
        lo, hi = 0.0, 0.4
        for _ in range(40):
            mid = 0.5 * (lo + hi)
            if area_ratio_r(mid, am, lams) > 1.0:
                lo = mid
            else:
                hi = mid
        zr = 0.5 * (lo + hi)
    hz = st.ModifiedWigleyStrip(L, B, D, table=hull0.table, zeta_v=zr)
    pz = Predict(hz)
    cz = [(x, pz.at(x)["strip"] + fr * pz.at(x)["refl"]) for x in fine]
    xb, vb = max(cz, key=lambda c: c[1])
    rms = math.sqrt(sum((pz.at(x)["strip"] + fr * pz.at(x)["refl"] - v) ** 2 for x, v in mean) / len(mean))
    rms0 = math.sqrt(sum((P[x]["strip"] + P[x]["refl"] - v) ** 2 for x, v in mean) / len(mean))
    rmsw = math.sqrt(sum((P[x]["sta"] - v) ** 2 for x, v in mean) / len(mean))
    pr(f"refitted zeta {zr:.3f}: peak {vb:.2f} at lambda/L {xb:.2f}; rms error against the measured mean {rms:.2f} "
       f"(strip+refl at zeta 0: {rms0:.2f}; STAWAVE-2: {rmsw:.2f})")
    pr("# table: zeta pooled_1ms_motion_N ratio_to_stawave2 pooled_1ms_reflection_N loss30W_share025 loss30W_share1 scope200W")
    pr(f"row_scaled {mono_eval(zr, fr)}")
    pr(f"row_scaled {mono_eval(0.0, fr)}")
    print(f"runtime {time.time() - t0:.0f} s", file=sys.stderr)


if __name__ == "__main__":
    main()
