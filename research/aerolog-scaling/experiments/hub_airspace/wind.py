"""Milestone 11b: does wind change how often one delivery hub's own drones lose separation, and does the direction
split (outbound and inbound in separate layers) still work when ground speed depends on bearing?

Milestone 11a counted conflicts for one hub's traffic in still air. In a steady wind an aircraft holding airspeed v
along a ground track at angle beta from the wind's downwind direction has ground speed
    g(beta) = W cos(beta) + sqrt(v^2 - W^2 sin(beta)^2)
(crabbing to hold the track). Outbound and inbound legs on one bearing then have different ground speeds, and two
outbound aircraft on nearby bearings do too, so in a direction-split layer a later departure can catch up with an
earlier one: wind brings back conflicts that the split removed in still air.

Closed form, derived here (generalising 11a's; no fitting). For any two legs that start from (or end at) the hub,
with ground velocities fixed per leg, every distance in the pair's encounter scales with the time offset tau between
their hub events, so the closest approach is tau * m, where m depends only on the two bearings and ground speeds:
    in-out: A leaves the hub at 0 at ground speed g1 along e1, B reaches it at tau at ground speed h2 along e2;
            m = min over s in [0, 1] of |g1 s e1 - h2 (1 - s) e2|.
    out-out: A leaves at 0 (g1, e1), B leaves at tau (g2, e2); m = min over u >= 1 of |g1 u e1 - g2 (u - 1) e2|.
    in-in: the time reverse of out-out with the inbound ground speeds.
Pairs with offset in d tau occur at lambda^2 d tau per unit time, so each type's conflict rate is
    C = lambda^2 E[ max(0, min(R / m, tau_edge) - tau_term) ],
where tau_edge is the largest offset whose closest approach still lies on both legs (11a's 2 min(d1, d2) / v) and
tau_term = r_t / rho excludes approaches inside the terminal radius (rho = mean distance from the hub at the
closest approach per unit tau). The expectation is a Monte Carlo over destination pairs (and airspeeds, when they
spread). In still air at equal speeds it reduces exactly to 11a's formula. Edge effects ignored, as in 11a.

A small-angle reading of the in-out term: for nearby bearings m ~ dphi * H / 2 and tau_edge ~ 2 d / H with H the
harmonic mean of the outbound and inbound ground speeds, so the head-on rate scales with 1 / H, the same factor by
which wind lengthens each flight's time in the layer:
    v / H = sqrt(1 - w^2 sin(beta)^2) / (1 - w^2),  w = W / v,
which is 1 / (1 - w^2) along the track and 1 / sqrt(1 - w^2) across it.

Wind data (opened only after this docstring was committed): ERA5 reanalysis 100 m wind, hourly, April to September
2014 (the months of the Uber destinations), at the hub (40.75 N, 73.9875 W), from the Open-Meteo historical
weather API (CC BY 4.0; ERA5: Hersbach et al., 2020, doi:10.1002/qj.3803). Fetched by wind_extract.py to
era5_wind_nyc_2014.json. Cruise at about 100 m is the layer delivery drones use under 120 m rules.

Parameters as 11a: v 20 m/s base (15 and 30 as sensitivity), R 50 m, r_t 250 m, h 60 s, lambda 60 flights/h, NYC
destinations within 5 km; "shuffled" bearings as the control. Wind ratio w = W / v swept 0 to 0.5; wind direction
swept in 15 degree steps; then the measured hours.

Predictions (fixed before the wind data was opened or any windy conflict counted):
 (1) The generalised closed form is within 5% of the simulator for single-layer en-route (outside r_t) conflicts
     at w = 0.3 for along-axis and cross-axis wind (NYC), and within 10% over the w x direction grid; for the
     split layers' en-route conflicts (a small count) within 20% where the simulator counts at least 200.
 (2) Single layer: wind raises en-route conflicts per flight by within 3% (relative) of the factor by which it
     raises the mean time in the layer (the 1 / H reading), at every grid point.
 (3) Direction matters for NYC, not for shuffled bearings: at w = 0.4 the single-layer rise with the wind along
     Manhattan's axis is at least 5% larger than with it across the axis (NYC), and the two differ by under 2% for
     shuffled bearings.
 (4) Split layers, equal airspeeds: at w = 0.3 wind brings back en-route conflicts at 0.5% to 5% of the single
     layer's (zero in still air), rising with w.
 (5) Split layers with the +-15% airspeed spread and w = 0.3: still at most 10% of the single layer's.
 (6) Measured hours, v = 20 m/s: the hour-weighted mean single-layer en-route rate is 3% to 15% above still air,
     and fewer than 5% of hours have W above 12 m/s at 100 m.
Preliminary; one hub, steady uniform wind per hour (no shear with height, no gusts), straight legs, no avoidance.
"""
import json
import math
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import DMAX, HOVER, R_TERM, load_nyc, shuffled  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
AXIS_DEG = None   # Manhattan's axis bearing, measured from the destinations below (not assumed)


def ground_speed(ex, ey, v, wx, wy):
    """Ground speed along unit track (ex, ey) for airspeed v in wind (wx, wy) (the direction the air moves to)."""
    along = wx * ex + wy * ey
    cross = wx * ey - wy * ex
    disc = v * v - cross * cross
    if disc <= 0:
        return None
    g = along + math.sqrt(disc)
    return g if g > 0 else None


# ---------------- simulator (11a's, with wind) ----------------

def flights(dests, lam_h, t_end, v, spread, rnd):
    lam = lam_h / 3600.0
    t, out = 0.0, []
    while True:
        t += rnd.expovariate(lam)
        if t > t_end:
            return out
        x, y = dests[rnd.randrange(len(dests))]
        out.append((t, x, y, v * (1 + spread * rnd.uniform(-1, 1))))


def legs(fl, split, wind):
    wx, wy = wind
    out = []
    for t0, x, y, va in fl:
        d = math.hypot(x, y)
        ux, uy = x / d, y / d
        go = ground_speed(ux, uy, va, wx, wy)
        gi = ground_speed(-ux, -uy, va, wx, wy)
        if go is None or gi is None:
            raise ValueError("wind exceeds airspeed")
        ti = t0 + d / go + HOVER
        out.append((0, t0, t0 + d / go, 0.0, 0.0, go * ux, go * uy, "o"))
        out.append((1 if split else 0, ti, ti + d / gi, x, y, -gi * ux, -gi * uy, "i"))
    out.sort(key=lambda l: l[1])
    return out


def simulate(dests, lam_h, v=20.0, R=50.0, spread=0.0, split=False, wind=(0.0, 0.0), n_flights=60000, seed=0):
    rnd = random.Random(seed)
    dmax = max(math.hypot(x, y) for x, y in dests)
    W = math.hypot(*wind)
    gmin = (v * (1 - spread)) - W
    warm = 2 * dmax / gmin + HOVER + 60
    t_end = n_flights / lam_h * 3600.0
    fl = flights(dests, lam_h, t_end + 2 * warm, v, spread, rnd)
    lo, hi = warm, t_end + warm
    cnt = {k: [0, 0] for k in ("oo", "ii", "io")}
    active = {0: [], 1: []}
    R2 = R * R
    layer_time = 0.0
    for L in legs(fl, split, wind):
        lay, ta, tb, px, py, vx, vy, kind = L
        if lo <= ta < hi:
            layer_time += tb - ta
        act = [a for a in active[lay] if a[2] > ta]
        for a in act:
            _, sa, sb, qx, qy, wvx, wvy, k2 = a
            t1, t2 = ta, min(tb, sb)
            ax, ay = px + vx * (t1 - ta), py + vy * (t1 - ta)
            bx, by = qx + wvx * (t1 - sa), qy + wvy * (t1 - sa)
            rx, ry, ux, uy = ax - bx, ay - by, vx - wvx, vy - wvy
            uu = ux * ux + uy * uy
            s = 0.0 if uu == 0 else min(max(-(rx * ux + ry * uy) / uu, 0.0), t2 - t1)
            dx, dy = rx + ux * s, ry + uy * s
            if dx * dx + dy * dy < R2:
                tc = t1 + s
                if lo <= tc < hi:
                    rad = 0.5 * (math.hypot(ax + vx * s, ay + vy * s) + math.hypot(bx + wvx * s, by + wvy * s))
                    key = "oo" if kind == k2 == "o" else "ii" if kind == k2 == "i" else "io"
                    cnt[key][0 if rad < R_TERM else 1] += 1
        act.append(L)
        active[lay] = act
    T = hi - lo
    n_win = sum(1 for f in fl if lo <= f[0] < hi)
    return {"counts": cnt, "T": T, "flights": n_win, "layer_time_per_flight": layer_time / max(1, 2 * n_win) * 2}


def out_rate_h(res, kinds=("oo", "ii", "io")):
    return sum(res["counts"][k][1] for k in kinds) / res["T"] * 3600.0


def out_count(res, kinds=("oo", "ii", "io")):
    return sum(res["counts"][k][1] for k in kinds)


# ---------------- generalised closed form ----------------

def _io_measure(g1, e1, h2, e2, R):
    # rel(s) = g1 s e1 - h2 (1 - s) e2 = -h2 e2 + s (g1 e1 + h2 e2)
    px, py = -h2 * e2[0], -h2 * e2[1]
    qx, qy = g1 * e1[0] + h2 * e2[0], g1 * e1[1] + h2 * e2[1]
    qq = qx * qx + qy * qy
    s = 0.0 if qq == 0 else min(max(-(px * qx + py * qy) / qq, 0.0), 1.0)
    m = math.hypot(px + qx * s, py + qy * s)
    ra, rb = g1 * s, h2 * (1 - s)          # radii per unit tau at the closest approach
    return m, ra, rb


def _oo_measure(g1, e1, g2, e2):
    # rel(u) = g1 u e1 - g2 (u - 1) e2 = g2 e2 + u (g1 e1 - g2 e2), u >= 1
    px, py = g2 * e2[0], g2 * e2[1]
    qx, qy = g1 * e1[0] - g2 * e2[0], g1 * e1[1] - g2 * e2[1]
    qq = qx * qx + qy * qy
    u = 1.0 if qq == 0 else max(1.0, -(px * qx + py * qy) / qq)
    m = math.hypot(px + qx * u, py + qy * u)
    return m, g1 * u, g2 * (u - 1)


def _window(m, ra, rb, d1, d2, R):
    """(tau_upper_all, tau_term) for a pair: conflicts for tau in (0, upper), en route for tau in (term, upper)."""
    up = R / m if m > 0 else float("inf")
    if ra > 0:
        up = min(up, d1 / ra)
    if rb > 0:
        up = min(up, d2 / rb)
    rho = 0.5 * (ra + rb)
    term = R_TERM / rho if rho > 0 else float("inf")
    return up, term


def closed_form(dests, lam_h, v=20.0, R=50.0, wind=(0.0, 0.0), spread=0.0, split=False, pairs=200000, seed=3):
    lam = lam_h / 3600.0
    rnd = random.Random(seed)
    pol = []
    for x, y in dests:
        d = math.hypot(x, y)
        pol.append((d, (x / d, y / d)))
    wx, wy = wind
    acc = {k: [0.0, 0.0] for k in ("oo", "ii", "io")}   # [all, outside r_t] tau measure
    layer_t = 0.0
    for _ in range(pairs):
        (d1, e1), (d2, e2) = pol[rnd.randrange(len(pol))], pol[rnd.randrange(len(pol))]
        v1 = v * (1 + spread * rnd.uniform(-1, 1)) if spread else v
        v2 = v * (1 + spread * rnd.uniform(-1, 1)) if spread else v
        g1, h1 = ground_speed(e1[0], e1[1], v1, wx, wy), ground_speed(-e1[0], -e1[1], v1, wx, wy)
        g2, h2 = ground_speed(e2[0], e2[1], v2, wx, wy), ground_speed(-e2[0], -e2[1], v2, wx, wy)
        layer_t += d1 / g1 + d1 / h1
        cases = [("oo", _oo_measure(g1, e1, g2, e2)), ("ii", _oo_measure(h2, e2, h1, e1))]
        if not split:
            cases.append(("io", _io_measure(g1, e1, h2, e2, R)))
        for key, (m, ra, rb) in cases:
            # out-out: A's radius ra limited by d1, B's by d2; in-in reversed: first leg is B (d2), second A (d1)
            da, db = (d2, d1) if key == "ii" else (d1, d2)
            up, term = _window(m, ra, rb, da, db, R)
            acc[key][0] += up
            acc[key][1] += max(0.0, up - term)
    f = lam * lam / pairs
    rates = {k: (a[0] * f * 3600.0, a[1] * f * 3600.0) for k, a in acc.items()}   # per hour
    return {"rates": rates, "out": sum(r[1] for r in rates.values()), "layer_time": layer_t / pairs}


def cf_out(cf):
    return cf["out"]


# ---------------- helpers ----------------

def axis_bearing(dests):
    """Principal axis of the destinations (doubled-angle mean), as a compass-free math angle in radians."""
    c = s = 0.0
    for x, y in dests:
        a = math.atan2(y, x)
        c += math.cos(2 * a)
        s += math.sin(2 * a)
    return 0.5 * math.atan2(s, c), math.hypot(c, s) / len(dests)


def wind_vec(W, ang):
    return (W * math.cos(ang), W * math.sin(ang))


def mean_layer_time(dests, v, wind):
    tot = 0.0
    for x, y in dests:
        d = math.hypot(x, y)
        ex, ey = x / d, y / d
        tot += d / ground_speed(ex, ey, v, *wind) + d / ground_speed(-ex, -ey, v, *wind)
    return tot / len(dests)


def main():
    t0 = time.time()
    P = print
    nyc = load_nyc()
    shuf = shuffled(nyc)
    ax, conc = axis_bearing(nyc)
    P(f"# Milestone 11b: wind and hub airspace conflicts. {len(nyc)} NYC destinations within {DMAX/1000:.0f} km.")
    P(f"# NYC principal axis: math angle {math.degrees(ax):.1f} deg (compass {(90 - math.degrees(ax)) % 180:.1f} deg),"
      f" doubled-angle concentration {conc:.3f}. Rates: en-route (outside r_t = {R_TERM:.0f} m) conflicts per hour.")
    v, R, lam = 20.0, 50.0, 60

    P("\n## A. Still-air check: generalised closed form vs 11a (NYC, v 20, R 50, 60/h)")
    c0 = closed_form(nyc, lam)
    P(f"single layer en-route: cf {c0['out']:.2f}/h by type {{{', '.join(f'{k}: {r[1]:.3f}' for k, r in c0['rates'].items())}}}"
      f" (11a closed form 5.71/h, simulator 5.74/h)")
    c0s = closed_form(nyc, lam, spread=0.15, split=True)
    P(f"split layers, +-15% airspeed: cf {c0s['out']:.3f}/h (11a simulator: see 11a results section C)")

    P("\n## B. Base wind cases, NYC and shuffled, v 20: simulator vs closed form (en-route conflicts per hour)")
    P("set      w    dir    layout     spread | sim_out (count) | cf_out | sim/cf | factor vs still (sim, cf) | layer-time factor")
    base_sim = {}
    for name, ds in (("nyc", nyc), ("shuffled", shuf)):
        s0 = simulate(ds, lam, n_flights=120000, seed=11)
        base_sim[name] = s0
        lt0 = mean_layer_time(ds, v, (0.0, 0.0))
        for w in (0.3, 0.4):
            for dname, ang in (("along", ax), ("cross", ax + math.pi / 2)):
                for split, spread in ((False, 0.0), (True, 0.0), (True, 0.15)):
                    wind = wind_vec(w * v, ang)
                    s = simulate(ds, lam, wind=wind, split=split, spread=spread, n_flights=120000, seed=11)
                    c = closed_form(ds, lam, wind=wind, split=split, spread=spread)
                    so = out_rate_h(s)
                    fs = so / out_rate_h(s0) if not split else so / out_rate_h(s0)
                    fc = c["out"] / c0["out"] if name == "nyc" else c["out"] / closed_form(ds, lam)["out"]
                    lt = mean_layer_time(ds, v, wind) / lt0
                    lay = "split" if split else "single"
                    P(f"{name:8s} {w:.1f} {dname:6s} {lay:6s} {spread:+5.2f} | {so:7.3f} ({out_count(s):6d}) | {c['out']:6.3f} |"
                      f" {so / c['out'] if c['out'] else float('nan'):6.3f} | {fs:6.3f} {fc:6.3f} | {lt:6.4f}")

    P("\n## C. Grid, NYC, v 20: w x wind direction (relative to the axis), closed form; simulator at every other cell")
    P("w     rel_dir | cf single | sim single (n) ratio | single factor  layer-time factor  diff | cf split eq | sim split eq (n) ratio | split/single (cf)")
    grid = {}
    worst_single = worst_p2 = 0.0
    worst_split = []
    for w in (0.1, 0.2, 0.3, 0.4, 0.5):
        for k, rel in enumerate(range(0, 180, 15)):
            wind = wind_vec(w * v, ax + math.radians(rel))
            cs = closed_form(nyc, lam, wind=wind, pairs=120000)
            cp = closed_form(nyc, lam, wind=wind, split=True, pairs=120000)
            fac = cs["out"] / c0["out"]
            ltf = mean_layer_time(nyc, v, wind) / mean_layer_time(nyc, v, (0.0, 0.0))
            worst_p2 = max(worst_p2, abs(fac / ltf - 1))
            simtxt = " " * 22
            sptxt = " " * 24
            if k % 2 == 0:
                s = simulate(nyc, lam, wind=wind, n_flights=40000, seed=int(w * 100) + rel)
                sp = simulate(nyc, lam, wind=wind, split=True, n_flights=120000, seed=int(w * 100) + rel + 7)
                r = out_rate_h(s) / cs["out"]
                worst_single = max(worst_single, abs(r - 1))
                n_sp = out_count(sp)
                rsp = out_rate_h(sp) / cp["out"] if cp["out"] else float("nan")
                if n_sp >= 200:
                    worst_split.append(abs(rsp - 1))
                simtxt = f"{out_rate_h(s):7.3f} ({out_count(s):5d}) {r:5.3f}"
                sptxt = f"{out_rate_h(sp):7.3f} ({n_sp:5d}) {rsp:5.3f}"
            grid[(w, rel)] = (fac, cp["out"] / cs["out"])
            P(f"{w:.1f} {rel:6d}  | {cs['out']:9.3f} | {simtxt} | {fac:13.4f} {ltf:17.4f} {fac / ltf - 1:+.3f} | {cp['out']:11.4f} | {sptxt} | {cp['out'] / cs['out']:.4f}")
    P(f"worst |sim/cf - 1| single (simulated cells): {worst_single:.3f}; split cells with >= 200 counts: "
      f"{len(worst_split)}, worst {max(worst_split) if worst_split else float('nan'):.3f}")
    P(f"worst |single factor / layer-time factor - 1| over the grid: {worst_p2:.4f}")
    for w in (0.1, 0.2, 0.3, 0.4, 0.5):
        fs = [grid[(w, r)][0] for r in range(0, 180, 15)]
        ss = [grid[(w, r)][1] for r in range(0, 180, 15)]
        P(f"w {w:.1f}: single factor along {grid[(w, 0)][0]:.4f}, across {grid[(w, 90)][0]:.4f}, along/across {grid[(w, 0)][0] / grid[(w, 90)][0]:.4f};"
          f" range {min(fs):.4f}..{max(fs):.4f}; split/single {min(ss):.4f}..{max(ss):.4f} (mean {sum(ss) / len(ss):.4f})")
    cs_al = closed_form(shuf, lam, wind=wind_vec(0.4 * v, ax), pairs=200000)["out"]
    cs_cr = closed_form(shuf, lam, wind=wind_vec(0.4 * v, ax + math.pi / 2), pairs=200000)["out"]
    P(f"shuffled, w 0.4: along/across {cs_al / cs_cr:.4f}")

    P("\n## D. Measured hours: ERA5 100 m wind at the hub, Apr to Sep 2014")
    wd = json.load(open(os.path.join(HERE, "era5_wind_nyc_2014.json")))
    sp_, dr_ = wd["wind_speed_100m"], wd["wind_direction_100m"]
    hrs = [(s_, d_) for s_, d_ in zip(sp_, dr_) if s_ is not None and d_ is not None]
    Ws = sorted(s_ for s_, _ in hrs)
    n = len(Ws)
    P(f"{n} hours; 100 m wind mean {sum(Ws) / n:.2f} m/s, median {Ws[n // 2]:.2f}, p90 {Ws[int(0.9 * n)]:.2f},"
      f" p99 {Ws[int(0.99 * n)]:.2f}, max {Ws[-1]:.2f}; share above 12 m/s {sum(1 for x in Ws if x > 12) / n:.4f},"
      f" above 15 {sum(1 for x in Ws if x > 15) / n:.4f}")
    # per-hour closed form on a lookup table (w step 0.025, direction step 10 deg), linear in w, nearest direction
    for vv in (15.0, 20.0, 30.0):
        c_still = closed_form(nyc, lam, v=vv, pairs=100000)["out"]
        c_still_sp = closed_form(nyc, lam, v=vv, split=True, spread=0.15, pairs=100000)["out"]
        table = {}
        tot = tot_sp = tot_sp15 = 0.0
        flown = grounded = 0
        facs = []
        for s_, d_ in hrs:
            w = s_ / vv
            if w >= 0.6:
                grounded += 1
                continue
            wk = round(w / 0.025) * 0.025
            # meteorological direction FROM (deg clockwise from north) -> math angle the air moves TO
            to_math = math.radians((90 - (d_ + 180)) % 360)
            dk = round(math.degrees(to_math) / 10) % 36
            key = (round(wk, 3), dk)
            if key not in table:
                wind = wind_vec(wk * vv, math.radians(dk * 10))
                table[key] = (closed_form(nyc, lam, v=vv, wind=wind, pairs=20000, seed=5)["out"],
                              closed_form(nyc, lam, v=vv, wind=wind, split=True, pairs=20000, seed=5)["out"],
                              closed_form(nyc, lam, v=vv, wind=wind, split=True, spread=0.15, pairs=20000, seed=5)["out"])
            a, b, c = table[key]
            tot += a
            tot_sp += b
            tot_sp15 += c
            facs.append(a / c_still)
            flown += 1
        facs.sort()
        P(f"v {vv:.0f} m/s: {flown} hours flown, {grounded} with W >= 0.6 v left out ({grounded / len(hrs):.4f});"
          f" single-layer mean factor vs still {tot / flown / c_still:.4f} (median {facs[len(facs) // 2]:.4f}, p90 {facs[int(0.9 * len(facs))]:.4f},"
          f" max {facs[-1]:.4f}); split equal airspeed {tot_sp / tot:.4f} of single;"
          f" split +-15% {tot_sp15 / tot:.4f} of single (still-air split +-15% {c_still_sp / c_still:.4f}); table cells {len(table)}")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
