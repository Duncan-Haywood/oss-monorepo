"""Milestone 7x: measured ocean wind instead of still air on 7w's air-drag term.

    PYTHONPATH=src:experiments python3 experiments/run_wind_air_drag.py > experiments/results_wind_air_drag.txt

Milestone 7w added D = 0.5 rho CdA u^2 (still air) to every rung. At sea a wind of speed w meets the
craft at relative heading theta (0 = head wind); the apparent wind is V_a = (u + w cos theta, w sin theta)
and, with drag along the apparent wind and one CdA for every direction, the along-track air force is

    D(u, w, theta) = 0.5 * rho_air * CdA * |V_a| * (u + w cos theta)

(negative in a strong enough tail wind: windage pushes). This script averages D over heading (uniform,
72 points: survey lines run on every heading) and over the 84,776 ten-minute NDBC buoy wind records in
experiments/data/ndbc_wind_*.csv (19 buoy-months, January and July 2024, as measured at the buoy
anemometer, about 4 m). Everything else is 7w unchanged (central rungs, speed grids, common basis,
hotel 1 W to 10 kW at 12 per decade, CdA 0 to 0.4 m2, rho_air 1.225 kg/m3).

Speed policy 1 (primary): one survey speed for all headings and winds, the range-maximising one, so the
heading- and wind-averaged force simply replaces still-air drag. Policy 2: the speed re-chosen per
(wind, heading) cell on equal-length legs (range = E / mean over cells of min over u of J/m); run on
wind binned to 0.5 m/s and 36 headings, at CdA 0.1 m2.

Expectations (committed to LOG.md before the first run, 60e37ace4): W1 zero wind reproduces 7w;
W2 the monohull leads to 200 W under pooled wind at every CdA, central and 972 foil cases; W3 at every
CdA > 0 the pooled-wind foil break-even is below the still-air one, by under 10%; W4 at CdA 0.1, 30 W,
wind lowers the monohull's peak range 2-6% from still air and raises the foil/monohull ratio;
W5 catamaran and SWATH 30 W ratios move under 1% from still air; W6 policy 2 recovers under half of
the monohull's 30 W wind loss at CdA 0.1; W7 the 19 buoy-month foil break-evens at CdA 0.1 lie in
500-900 W.
"""
import csv
import glob
import itertools
import math
import os
import sys
from collections import Counter

import run_air_drag as ad
import run_hotel_ranking as hr
import run_range_speed as rr

HERE = os.path.dirname(os.path.abspath(__file__))
RHO = ad.RHO_AIR
CDAS = ad.CDAS
NHEAD = 72
LOG_PROFILE = math.log(1.0 / 0.0002) / math.log(4.0 / 0.0002)   # 4 m -> 1 m, z0 0.0002 m (open sea)
COS = [math.cos(2 * math.pi * k / NHEAD) for k in range(NHEAD)]
SIN = [math.sin(2 * math.pi * k / NHEAD) for k in range(NHEAD)]


def wind_files():
    return sorted(glob.glob(os.path.join(HERE, "data", "ndbc_wind_*.csv")))


def read_winds(path):
    out = []
    with open(path) as f:
        for r in csv.DictReader(f):
            try:
                w = float(r["speed"])
            except (TypeError, ValueError):
                continue
            if 0.0 <= w < 60.0:
                out.append(w)
    return out


def hist(winds, scale=1.0, step=0.1):
    """{w: probability} on a `step` grid (NDBC reports to 0.1 m/s)."""
    c = Counter(round(w * scale / step) * step for w in winds)
    n = sum(c.values())
    return {w: k / n for w, k in sorted(c.items())}


def head_avg(u, w, ncos=COS, nsin=SIN):
    """Heading average of |V_a| (u + w cos theta), per unit 0.5 rho CdA."""
    s = 0.0
    for c, sn in zip(ncos, nsin):
        ax = u + w * c
        s += math.hypot(ax, w * sn) * ax
    return s / len(ncos)


def mean_force_unit(speeds, h):
    """Heading- and wind-averaged along-track air force per unit CdA at each speed."""
    return [0.5 * RHO * sum(p * head_avg(u, w) for w, p in h.items()) for u in speeds]


def with_unit(res, unit, cda):
    return [None if r is None else r + cda * a for r, a in zip(res, unit)]


def central_ratios(mono0, rungs0, units, cda):
    mono = with_unit(mono0, units[id(rr.DISP)], cda)
    mk = [hr.peak_at(rr.DISP, mono, h) for h in hr.HOTELS]
    ratios = {}
    for n, sp, res in rungs0:
        r = with_unit(res, units[id(sp)], cda)
        ratios[n] = [hr.peak_at(sp, r, h)[0] / m[0] for h, m in zip(hr.HOTELS, mk)]
    return ratios, mk


def policy2_range(speeds, res, cda, h, hotel, nhead=36):
    """Range (km) when the speed is re-chosen per (wind bin, heading) cell on equal-length legs."""
    cs = [math.cos(2 * math.pi * k / nhead) for k in range(nhead)]
    ss = [math.sin(2 * math.pi * k / nhead) for k in range(nhead)]
    jpm = 0.0
    for w, p in h.items():
        for c, sn in zip(cs, ss):
            best = None
            for u, r in zip(speeds, res):
                if r is None:
                    continue
                ax = u + w * c
                d = r + 0.5 * RHO * cda * math.hypot(ax, w * sn) * ax
                j = d / hr.ETA + hotel / u
                if best is None or j < best:
                    best = j
            jpm += p * best / nhead
    return rr.WH * 3600.0 / jpm / 1000.0


def policy2_speeds(speeds, res, cda, h, hotel, nhead=36):
    """Probability-weighted distribution of the chosen speed over (wind bin, heading) cells (post hoc)."""
    dist = Counter()
    for w, p in h.items():
        for k in range(nhead):
            c, sn = math.cos(2 * math.pi * k / nhead), math.sin(2 * math.pi * k / nhead)
            best = None
            for u, r in zip(speeds, res):
                if r is None:
                    continue
                ax = u + w * c
                j = (r + 0.5 * RHO * cda * math.hypot(ax, w * sn) * ax) / hr.ETA + hotel / u
                if best is None or j < best[0]:
                    best = (j, u)
            dist[best[1]] += p / nhead
    return dist


def jpm_at(speeds, res, unit, cda, hotel):
    """(best speed, J/m) under policy 1."""
    best = None
    for u, r, a in zip(speeds, res, unit):
        if r is None:
            continue
        j = (r + cda * a) / hr.ETA + hotel / u
        if best is None or j < best[1]:
            best = (u, j)
    return best


def main(out=sys.stdout):
    pr = lambda s="": print(s, file=out)
    files = wind_files()
    per_file = {os.path.basename(f)[len("ndbc_wind_"):-4]: read_winds(f) for f in files}
    pooled = [w for ws in per_file.values() for w in ws]
    mono0, rungs0 = ad.base_rungs()
    grids = [rr.DISP, rr.FAST]
    srt = sorted(pooled)
    pr(f"basis: 7w unchanged (200 kg, {rr.WH:.0f} Wh, eta 0.55 x 0.85, central rungs); air force 0.5 x {RHO} x CdA x |V_a| (u + w cos theta), "
       f"averaged over {NHEAD} headings and the measured wind")
    pr(f"wind: {len(pooled)} ten-minute NDBC records, {len(files)} buoy-months; mean {sum(pooled) / len(pooled):.2f} m/s, "
       f"median {srt[len(srt) // 2]:.1f}, 90th {srt[int(0.9 * len(srt))]:.1f}, max {srt[-1]:.1f}; log-profile factor to 1 m {LOG_PROFILE:.3f}")
    scenarios = [("still air", {0.0: 1.0}), ("pooled wind", hist(pooled)),
                 ("pooled x0.86 (1 m)", hist(pooled, LOG_PROFILE)), ("pooled x1.5", hist(pooled, 1.5))]
    unit_cache = {}
    for name, h in scenarios:
        unit_cache[name] = {id(g): mean_force_unit(g, h) for g in grids}
    # still-air cross-check of the averaging: at w = 0, head_avg = u^2
    pr(f"check: head_avg(3, 0) = {head_avg(3.0, 0.0):.6f} (u^2 = 9); 7w still-air term reproduced by construction")
    for u in (1.0, 2.5, 15.0):
        pr(f"force per unit CdA at {u:g} m/s: still {0.5 * RHO * u * u:.2f} N/m2, "
           f"pooled wind {mean_force_unit([u], scenarios[1][1])[0]:.2f} N/m2")
    foil_ax = dict(area=[0.02, 0.04, 0.08], ar=[6.0, 10.0, 14.0], e=[0.8, 0.95], cd0=[0.008, 0.012, 0.02],
                   draft=[0.3, 0.5], extra=[1.0, 1.15, 1.4], clmax=[0.8, 1.2, 1.6])
    foil_cases = [hr.foil_res(*c, rr.FAST) for c in itertools.product(*foil_ax.values())]
    foil_cases = [c for c in foil_cases if any(r is not None for r in c)]
    mono_k25 = rr.michell_r(4.0, 1, 0.0, 0.25, 0.0, rr.DISP)
    still = {}
    curves = {}
    for name, _ in scenarios:
        units = unit_cache[name]
        pr(f"## {name}")
        for cda in CDAS:
            ratios, mk = central_ratios(mono0, rungs0, units, cda)
            m30 = hr.peak_at(rr.DISP, with_unit(mono0, units[id(rr.DISP)], cda), 30.0)[0]
            r30 = {n: hr.peak_at(sp, with_unit(res, units[id(sp)], cda), 30.0)[0] / m30 for n, sp, res in rungs0}
            be = {n: hr.crossing(hr.HOTELS, ratios[n]) for n in ratios}
            lead = all(max(ratios[n][i] for n in ratios) <= 1.0 for i, x in enumerate(hr.HOTELS) if x <= hr.SOURCED_BAND)
            if name == "still air":
                still[cda] = (m30, r30, be)
            s_m30, s_r30, s_be = still[cda]
            line = (f"CdA {cda:g}: mono 30 W {m30:.1f} km ({100 * (m30 / s_m30 - 1):+.2f}% vs still); 30 W ratios "
                    + ", ".join(f"{n} {r30[n]:.3f} ({100 * (r30[n] / s_r30[n] - 1):+.2f}%)" for n in r30))
            pr(line)
            pr(f"  break-even: " + ", ".join(
                f"{n} {hr.fmt_w(be[n])}" + ("" if be[n] is None or s_be[n] is None else f" ({100 * (be[n] / s_be[n] - 1):+.1f}%)")
                for n in be) + f"; monohull leads to {hr.SOURCED_BAND:.0f} W: {lead}")
            curves[(name, cda)] = ratios["hydrofoil"]
            if name in ("still air", "pooled wind"):
                mres = with_unit(mono_k25, units[id(rr.DISP)], cda)
                mkb = [hr.peak_at(rr.DISP, mres, x)[0] for x in hr.HOTELS]
                bes, below = [], 0
                for c in foil_cases:
                    cc = with_unit(c, units[id(rr.FAST)], cda)
                    x = hr.crossing(hr.HOTELS, [hr.peak_at(rr.FAST, cc, hh)[0] / m for hh, m in zip(hr.HOTELS, mkb)])
                    if x is not None:
                        bes.append(x)
                        below += x <= hr.SOURCED_BAND
                pr(f"  foil box (k 0.25): {len(foil_cases)} cases, overtake by 10 kW in {len(bes)}; break-even min {min(bes):.0f} W, "
                   f"median {hr.q(bes, 0.5):.0f}, 90th {hr.q(bes, 0.9):.0f}; at or below {hr.SOURCED_BAND:.0f} W: {below}")
    # policy 2 at CdA 0.1, 30 W
    cda = 0.1
    hb = hist(pooled, step=0.5)
    pr(f"## policy 2 (speed per wind-heading cell; wind in 0.5 m/s bins, 36 headings), CdA {cda:g}, 30 W")
    m_still = still[cda][0]
    m_p1 = hr.peak_at(rr.DISP, with_unit(mono0, mean_force_unit(rr.DISP, hb), cda), 30.0)[0]
    m_p2 = policy2_range(rr.DISP, mono0, cda, hb, 30.0)
    loss = m_still - m_p1
    pr(f"monohull: still {m_still:.1f} km, policy 1 {m_p1:.1f} km, policy 2 {m_p2:.1f} km; share of wind loss recovered "
       f"{(m_p2 - m_p1) / loss:.3f}" if loss > 0 else f"monohull: still {m_still:.1f}, policy 1 {m_p1:.1f}, policy 2 {m_p2:.1f} (no loss)")
    for n, sp, res in rungs0:
        a1 = hr.peak_at(sp, with_unit(res, mean_force_unit(sp, hb), cda), 30.0)[0]
        a2 = policy2_range(sp, res, cda, hb, 30.0)
        pr(f"{n}: policy 1 {a1:.1f} km, policy 2 {a2:.1f} km; ratio to monohull p1 {a1 / m_p1:.3f}, p2 {a2 / m_p2:.3f}")
    # policy 2 break-even for the foil, coarse: hotel grid 6 per decade around the crossover
    hs = [10 ** (i / 12.0) for i in range(24, 43)]   # 100 W to 3.2 kW
    foil = dict((n, (sp, res)) for n, sp, res in rungs0)["hydrofoil"]
    rat2 = [policy2_range(*foil, cda, hb, x) / policy2_range(rr.DISP, mono0, cda, hb, x) for x in hs]
    pr(f"policy 2 hydrofoil break-even (CdA {cda:g}): {hr.fmt_w(hr.crossing(hs, rat2))}")
    # post hoc (added after the first run): why policy 2 recovers nothing, and why the break-even rises
    dist = policy2_speeds(rr.DISP, mono0, cda, hb, 30.0)
    pr("post hoc: monohull policy-2 speed share at 30 W: " + ", ".join(f"{u:.2f} m/s {p:.3f}" for u, p in sorted(dist.items()) if p >= 0.0005))
    fine = [0.30 + 0.005 * i for i in range(0, 341)]
    mono_f = rr.michell_r(4.0, 1, 0.0, 0.25, 0.0, fine)
    f1 = hr.peak_at(fine, with_unit(mono_f, mean_force_unit(fine, hb), cda), 30.0)[0]
    f2 = policy2_range(fine, mono_f, cda, hb, 30.0, nhead=12)
    pr(f"post hoc: monohull on a 0.005 m/s grid (12 headings for policy 2), CdA {cda:g}, 30 W: policy 1 {f1:.2f} km, policy 2 {f2:.2f} km "
       f"({100 * (f2 / f1 - 1):+.2f}%)")
    x0 = still[cda][2]["hydrofoil"]
    us, uw = unit_cache["still air"], unit_cache["pooled wind"]
    for n, sp, res in [("monohull", rr.DISP, mono0), ("hydrofoil",) + foil]:
        s_u, s_j = jpm_at(sp, res, us[id(sp)], cda, x0)
        w_u, w_j = jpm_at(sp, res, uw[id(sp)], cda, x0)
        r_s = dict(zip(sp, res))[s_u]
        pr(f"post hoc: at {x0:.0f} W, CdA {cda:g}: {n} best speed {s_u:.2f} -> {w_u:.2f} m/s, J/m {s_j:.1f} -> {w_j:.1f} "
           f"({100 * (w_j / s_j - 1):+.2f}%); water resistance {r_s:.1f} N, air still {cda * 0.5 * RHO * s_u ** 2:.2f} N, "
           f"wind-averaged {cda * mean_force_unit([s_u], hist(pooled))[0]:.2f} N")
    # per buoy-month at CdA 0.1, policy 1
    pr(f"## per buoy-month, CdA {cda:g}, policy 1")
    bes = []
    for key, ws in per_file.items():
        h = hist(ws)
        units = {id(g): mean_force_unit(g, h) for g in grids}
        ratios, _ = central_ratios(mono0, rungs0, units, cda)
        x = hr.crossing(hr.HOTELS, ratios["hydrofoil"])
        bes.append(x)
        pr(f"buoy-month {key}: n {len(ws)}, mean wind {sum(ws) / len(ws):.2f} m/s, hydrofoil break-even {hr.fmt_w(x)}")
    pr(f"buoy-month break-even range: {min(bes):.0f} to {max(bes):.0f} W (still air {still[cda][2]['hydrofoil']:.0f} W)")
    pr("# curve: scenario CdA hotel_W hydrofoil_ratio")
    for (name, c), rat in curves.items():
        if c in (0.0, 0.1, 0.4):
            for x, r in zip(hr.HOTELS, rat):
                pr(f"curve {name.replace(' ', '_')} {c:g} {x:.1f} {r:.4f}")


if __name__ == "__main__":
    main()
