"""Milestone 7y: added resistance in measured waves (ITTC STAWAVE-2) on the hull ranking.

    PYTHONPATH=src:experiments python3 experiments/run_wave_added_resistance.py > experiments/results_wave_added_resistance.txt

Every rung so far ran in calm water. This script adds the mean added resistance in irregular head seas
of ITTC 7.5-04-01-01.1 (2021) Annex G.2, STAWAVE-2 (`marine_hull.waves`), to the displacement monohull
and catamaran, over the 14,758 hourly NDBC sea states in experiments/data/ndbc_waves_2024.csv (12 buoys,
January and July 2024). T01 = 1.086 x APD (Pierson-Moskowitz T01/Tz); sensitivity T01 = 0.772 x DPD.
R_AWL is exactly proportional to Hs^2 at fixed T01, so records are binned on T01 (0.1 s) and Hs^2 summed
per bin. STAWAVE corrects only waves within +/-45 deg of the bow; with survey lines on every heading the
expected term is 0.25 of the head-sea value (primary); 1.0 is the all-head-seas bound.

The hydrofoil has no wave model: foilborne operation is allowed only where Hs <= H_lim (swept). In the
foil-favourable comparison the monohull pays its wave term averaged over the records where the foil can
fly and the foil pays nothing. SWATH and planing get no wave term and are left out.

Everything else is 7w unchanged (central rungs, speed grids, common basis, hotel 1 W to 10 kW).
Expectations (committed to LOG.md before the first run, d9788344c): V1 Bessel and spectrum checks;
Y1 30 W monohull loss 0.5-5% at share 0.25, 2-20% at 1.0; Y2 catamaran ratio moves < 3%; Y3 motion term >
reflection at the 30 W best speed; Y4 30 W best speed rises 0 to 0.10 m/s; Y5 foil break-even > 200 W and
no box case at or below 200 W at every H_lim, share 0.25; Y6 unlimited H_lim, share 0.25: foil break-even
400-659 W; Y7 pooled share of records with Hs <= 0.5 m under 20%, Hs <= 1.0 m in 20-50%.
"""
import csv
import itertools
import os
import sys
from collections import defaultdict

from marine_hull import waves as wv
import run_air_drag as ad
import run_hotel_ranking as hr
import run_michell as rm
import run_range_speed as rr
import run_wind_air_drag as wd

HERE = os.path.dirname(os.path.abspath(__file__))
CB = 4.0 / 9.0          # Wigley block coefficient
KYY = 0.25
SHARES = [0.25, 1.0]
HLIMS = [0.3, 0.5, 1.0, 1.5, 2.0, None]


def read_waves(path=os.path.join(HERE, "data", "ndbc_waves_2024.csv")):
    out = []
    with open(path) as f:
        for r in csv.DictReader(f):
            try:
                hs, dpd, apd = float(r["wvht"]), float(r["dpd"]), float(r["apd"])
            except (TypeError, ValueError):
                continue
            if 0.0 < hs < 30.0 and 0.0 < apd < 30.0 and 0.0 < dpd < 30.0:
                out.append((f"{r['buoy']}_{int(r['month']):02d}", hs, dpd, apd))
    return out


def t01_of(rec, mode="apd"):
    return round((1.086 * rec[3] if mode == "apd" else 0.772 * rec[2]) * 10.0) / 10.0


class WaveTable:
    """Head-sea R_AWL per unit Hs^2 for one hull, per T01 bin and speed."""

    def __init__(self, speeds, n_hulls, t01s):
        l, b, t, _ = rm.hull(4.0, n_hulls)
        self.speeds, self.n, self.dims = speeds, n_hulls, (l, b, t)
        self.f = {}
        for t01 in sorted(set(t01s)):
            self.f[t01] = [tuple(n_hulls * x for x in wv.spectral_parts(u, t01, l, b, t, CB, KYY)) for u in speeds]

    def mean(self, recs, mode="apd"):
        """Head-sea added resistance (motion, reflection) averaged over records, per speed."""
        w = defaultdict(float)
        for r in recs:
            w[t01_of(r, mode)] += r[1] ** 2
        n = len(recs)
        ml = [sum(w[t] * self.f[t][i][0] for t in w) / n for i in range(len(self.speeds))]
        rl = [sum(w[t] * self.f[t][i][1] for t in w) / n for i in range(len(self.speeds))]
        return ml, rl


def add(res, extra, share):
    return [None if r is None else r + share * e for r, e in zip(res, extra)]


def tot(parts):
    return [a + b for a, b in zip(*parts)]


def foil_box():
    ax = dict(area=[0.02, 0.04, 0.08], ar=[6.0, 10.0, 14.0], e=[0.8, 0.95], cd0=[0.008, 0.012, 0.02],
              draft=[0.3, 0.5], extra=[1.0, 1.15, 1.4], clmax=[0.8, 1.2, 1.6])
    cases = [hr.foil_res(*c, rr.FAST) for c in itertools.product(*ax.values())]
    return [c for c in cases if any(r is not None for r in c)]


def break_even(foil_sp, foil_res, mono_res):
    mk = [hr.peak_at(rr.DISP, mono_res, x)[0] for x in hr.HOTELS]
    return hr.crossing(hr.HOTELS, [hr.peak_at(foil_sp, foil_res, x)[0] / m for x, m in zip(hr.HOTELS, mk)])


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    recs = read_waves()
    hs = sorted(r[1] for r in recs)
    n = len(recs)
    pr(f"basis: 7w unchanged (200 kg, {rr.WH:.0f} Wh, eta 0.55 x 0.85, central rungs); added resistance ITTC 7.5-04-01-01.1 "
       f"(2021) G.2 STAWAVE-2, ITTC 1978 spectrum, CB {CB:.3f}, kyy {KYY}")
    pr(f"waves: {n} hourly NDBC records, {len(set(r[0] for r in recs))} buoy-months; Hs mean {sum(hs) / n:.2f} m, "
       f"median {hs[n // 2]:.2f}, 90th {hs[int(0.9 * n)]:.2f}, max {hs[-1]:.2f}; rms Hs {(sum(h * h for h in hs) / n) ** 0.5:.2f} m")
    # V1 checks
    pr(f"check: I1(1) {wv.bessel_i1(1.0):.9f} (A&S 0.565159104), K1(1) {wv.bessel_k1(1.0):.9f} (0.601907230), "
       f"I1(5) {wv.bessel_i1(5.0):.6f} (24.335642), K1(5) {wv.bessel_k1(5.0):.9f} (0.004044613)")
    for t01 in (4.0, 7.0, 10.0):
        m0 = wv.trap([wv.ittc_spectrum(w, 2.0, t01) for w in wv.OMEGAS], wv.OMEGAS)
        pr(f"check: spectrum Hs 2 m, T01 {t01:g} s: m0 {m0:.5f} m2 (Hs^2/16 = 0.25000; {100 * (m0 / 0.25 - 1):+.2f}%)")
    l, b, t = rm.hull(4.0, 1)[:3]
    lc, bc, tc = rm.hull(4.0, 2)[:3]
    pr(f"hulls: monohull L {l:g} B {b:.3f} T {t:.3f} (L/B {l / b:.1f}, B/T {b / t:.2f}); catamaran demi-hull B {bc:.3f} T {tc:.3f} "
       f"(L/B {lc / bc:.1f}, B/T {bc / tc:.2f}); STAWAVE-2 range L 50-400 m, L/B 4-9, B/T 2.2-9, Fr 0.10-0.30: outside (extrapolation)")
    t01s = [t01_of(r, "apd") for r in recs] + [t01_of(r, "dpd") for r in recs]
    mono_t = WaveTable(rr.DISP, 1, t01s)
    cat_t = WaveTable(rr.DISP, 2, t01s)
    mono0, rungs0 = ad.base_rungs()
    rung = {nm: (sp, res) for nm, sp, res in rungs0}
    cat0 = rung["catamaran"][1]
    foil_sp, foil0 = rung["hydrofoil"]

    # A. pooled waves on the displacement rungs at 30 W
    m_parts = mono_t.mean(recs)
    c_parts = cat_t.mean(recs)
    calm_m = hr.peak_at(rr.DISP, mono0, 30.0)
    calm_c = hr.peak_at(rr.DISP, cat0, 30.0)
    pr("## A. pooled waves, 30 W (T01 from APD)")
    pr(f"calm: monohull {calm_m[0]:.1f} km at {calm_m[1]:.2f} m/s; catamaran {calm_c[0]:.1f} km at {calm_c[1]:.2f} m/s; ratio {calm_c[0] / calm_m[0]:.3f}")
    for share in SHARES:
        mw = hr.peak_at(rr.DISP, add(mono0, tot(m_parts), share), 30.0)
        cw = hr.peak_at(rr.DISP, add(cat0, tot(c_parts), share), 30.0)
        i = rr.DISP.index(mw[1])
        ic = rr.DISP.index(calm_m[1])
        pr(f"share {share:g}: monohull {mw[0]:.1f} km ({100 * (mw[0] / calm_m[0] - 1):+.2f}%) at {mw[1]:.2f} m/s "
           f"({mw[1] - calm_m[1]:+.2f}); catamaran {cw[0]:.1f} km ({100 * (cw[0] / calm_c[0] - 1):+.2f}%) at {cw[1]:.2f} m/s; "
           f"ratio {cw[0] / mw[0]:.3f} ({100 * (cw[0] / mw[0] / (calm_c[0] / calm_m[0]) - 1):+.2f}%)")
        pr(f"  monohull at its new best speed: water {mono0[i]:.2f} N, wave motion {share * m_parts[0][i]:.2f} N, "
           f"reflection {share * m_parts[1][i]:.2f} N; at the calm best speed {calm_m[1]:.2f}: water {mono0[ic]:.2f} N, "
           f"motion {share * m_parts[0][ic]:.2f}, reflection {share * m_parts[1][ic]:.2f}")
    for u in (0.5, 1.0, 1.5, 2.0, 3.0):
        i = rr.DISP.index(u)
        pr(f"  head-sea pooled added resistance at {u:.1f} m/s (Fr {wv.froude(u, 4.0):.3f}): monohull motion {m_parts[0][i]:.2f} N, "
           f"reflection {m_parts[1][i]:.2f} N; calm water {mono0[i]:.2f} N")
    # sensitivity: T01 from DPD
    md = mono_t.mean(recs, "dpd")
    for share in SHARES:
        mw = hr.peak_at(rr.DISP, add(mono0, tot(md), share), 30.0)
        pr(f"sensitivity T01 = 0.772 DPD, share {share:g}: monohull 30 W {mw[0]:.1f} km ({100 * (mw[0] / calm_m[0] - 1):+.2f}%) at {mw[1]:.2f} m/s")

    # B. foil-favourable comparison by H_lim
    box = foil_box()
    mono_k25 = rr.michell_r(4.0, 1, 0.0, 0.25, 0.0, rr.DISP)   # identical to the central monohull (k 0.25)
    calm_be = break_even(foil_sp, foil0, mono0)
    pr("## B. foil-favourable: foil flies only where Hs <= H_lim and pays no wave term; monohull pays its wave term over those records")
    pr(f"calm (7v/7w CdA 0): central foil break-even {hr.fmt_w(calm_be)}")
    for share in SHARES:
        for hl in HLIMS:
            sub = [r for r in recs if hl is None or r[1] <= hl]
            frac = len(sub) / n
            parts = mono_t.mean(sub)
            mres = add(mono0, tot(parts), share)
            be = break_even(foil_sp, foil0, mres)
            mb = add(mono_k25, tot(parts), share)
            mk = [hr.peak_at(rr.DISP, mb, x)[0] for x in hr.HOTELS]
            bes, below = [], 0
            for c in box:
                x = hr.crossing(hr.HOTELS, [hr.peak_at(rr.FAST, c, h)[0] / m for h, m in zip(hr.HOTELS, mk)])
                if x is not None:
                    bes.append(x)
                    below += x <= hr.SOURCED_BAND
            lead = all(hr.peak_at(foil_sp, foil0, x)[0] <= hr.peak_at(rr.DISP, mres, x)[0]
                       for x in hr.HOTELS if x <= hr.SOURCED_BAND)
            pr(f"share {share:g}, H_lim {'none' if hl is None else f'{hl:g} m'}: foilborne share {100 * frac:.1f}% of hours; "
               f"central foil break-even {hr.fmt_w(be)}; monohull leads central foil to 200 W: {lead}; "
               f"box {len(box)} cases, overtake by 10 kW {len(bes)}, min {min(bes):.0f} W, median {hr.q(bes, 0.5):.0f}; "
               f"at or below 200 W: {below}")

    # C. per buoy-month
    pr("## C. per buoy-month (share 0.25, T01 from APD)")
    by = defaultdict(list)
    for r in recs:
        by[r[0]].append(r)
    losses = []
    for key in sorted(by):
        rs_ = by[key]
        h = sorted(r[1] for r in rs_)
        mw = hr.peak_at(rr.DISP, add(mono0, tot(mono_t.mean(rs_)), 0.25), 30.0)
        loss = 100 * (mw[0] / calm_m[0] - 1)
        losses.append(loss)
        f05 = sum(x <= 0.5 for x in h) / len(h)
        f10 = sum(x <= 1.0 for x in h) / len(h)
        pr(f"{key}: n {len(h)}, Hs median {h[len(h) // 2]:.2f} m; monohull 30 W {loss:+.2f}%; foilborne share Hs<=0.5 {100 * f05:.1f}%, "
           f"Hs<=1.0 {100 * f10:.1f}%")
    pr(f"buoy-month monohull 30 W change: {min(losses):+.2f}% to {max(losses):+.2f}%")
    for hl in (0.3, 0.5, 1.0, 1.5, 2.0):
        pr(f"pooled share of hours with Hs <= {hl:g} m: {100 * sum(x <= hl for x in hs) / n:.1f}%")

    # D. waves plus 7x pooled wind at CdA 0.1
    pr("## D. waves (share 0.25) plus 7x pooled wind, CdA 0.1")
    winds = [w for f in wd.wind_files() for w in wd.read_winds(f)]
    hw = wd.hist(winds)
    um = wd.mean_force_unit(rr.DISP, hw)
    uf = wd.mean_force_unit(foil_sp, hw)
    mwind = wd.with_unit(mono0, um, 0.1)
    fwind = wd.with_unit(foil0, uf, 0.1)
    mboth = add(mwind, tot(m_parts), 0.25)
    a = hr.peak_at(rr.DISP, mwind, 30.0)
    c = hr.peak_at(rr.DISP, mboth, 30.0)
    pr(f"monohull 30 W: calm {calm_m[0]:.1f} km, wind {a[0]:.1f} km, wind + waves {c[0]:.1f} km ({100 * (c[0] / calm_m[0] - 1):+.2f}% vs calm)")
    pr(f"central foil break-even (wind on both, waves on the monohull, unlimited H_lim): {hr.fmt_w(break_even(foil_sp, fwind, mboth))} "
       f"(wind only {hr.fmt_w(break_even(foil_sp, fwind, mwind))})")

    pr("# curve: share hotel_W monohull_km_calm monohull_km_waves")
    for share in SHARES:
        r = add(mono0, tot(m_parts), share)
        for x in hr.HOTELS:
            pr(f"curve {share:g} {x:.1f} {hr.peak_at(rr.DISP, mono0, x)[0]:.2f} {hr.peak_at(rr.DISP, r, x)[0]:.2f}")


if __name__ == "__main__":
    main()
