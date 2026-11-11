"""Milestone 11a: how often do one delivery hub's own drones lose separation in a cruise layer, and does a closed form
predict it?

Track 22's airspace milestone, first step: one hub, its own traffic, no other operators. The textbook estimate of
conflict rate is the gas model (aircraft placed uniformly with random headings; conflicts per unit time
C = N^2 * 4 R v / (pi A) for N aircraft at speed v in area A with separation radius R). Hub-and-spoke delivery is not
like that: every flight leaves and returns along a bearing from one point, so traffic converges on the hub and
outbound and inbound aircraft on nearby bearings meet head-on.

Model. Departures are Poisson at rate lambda (an unlimited fleet; each flight is independent). A flight takes a
destination (east, north) from the destination set, cruises out along its bearing at speed v_i, leaves the layer
for h seconds at the destination (descent, winch or landing), and cruises back along the same bearing. Straight
legs, constant speed, a 2D horizontal layer; climb and descent at the hub and destination are out of the layer.
A conflict is a pair of in-layer legs whose closest point of approach is under R (exact CPA over the legs' common
time window). Each conflict is classed by leg types (out-out, in-in, in-out) and by the mean distance of the two
aircraft from the hub at the CPA: inside the terminal radius r_t = 250 m (the hub's own sequencing problem, pads
and approach) or outside it (en route). Counted over a window after a warm-up longer than the longest flight.

Closed form, derived here for equal speeds (no fitting). An outbound aircraft A that leaves at t0 and an inbound B
that reaches the hub at tB = t0 + tau, bearings phi apart, are both at radius rho = v tau / 2 at t0 + tau/2, where
their distance is minimal: v tau sin(phi/2). So they conflict iff v tau sin(phi/2) < R and rho <= min(d_A, d_B).
Pairs with tau in d tau occur at lambda^2 d tau per unit time, so
    C_io = (lambda^2 / v) E[ min(2 min(d1, d2), R / sin(|dphi| / 2)) ]      (all radii)
    C_io(outside r_t) = (lambda^2 / v) E[ max(0, min(2 min(d1, d2), R / sin(|dphi| / 2)) - 2 r_t) ]
over independent pairs of destinations. Two outbound aircraft on diverging bearings are closest when the second
enters the layer (distance v tau), so C_oo = lambda^2 R / v, all of it at the hub; C_ii likewise. The expectation
is a Monte Carlo over destination pairs. Edge effects (meeting radius past a destination) are ignored.

Destinations: measured Uber pickups, NYC, April 2014 (destinations_extract.py -> nyc_destinations.json; hub at the
centre of milestone 6l's busiest cell), within d_max = 5 km. Controls: "shuffled" (the same distances, bearings
uniform at random) and "disc" (uniform over the 5 km disc).

Parameters (swept, not sourced to one aircraft; there is no drone-to-drone separation standard to source R from):
cruise speed v 15, 20, 30 m/s (the measured M100 flights in milestone 2 cruised at 4 to 12 m/s; fixed-wing and
lift-plus-cruise delivery aircraft are faster); separation radius R 25, 50, 100 m; lambda 15 to 240 flights/h;
h = 60 s; d_max 5 km (10 km as a sensitivity). Base case: v = 20 m/s, R = 50 m, lambda = 60/h.

Predictions (written before the destinations were opened or any conflict counted; the order-of-magnitude for (5)
came from a back-of-envelope evaluation of the closed form with uniform bearings, done before any simulation):
 (1) The closed form is within 5% of the simulator for total and outside-r_t conflicts in the base case for NYC,
     shuffled and disc destinations, and within 10% across the lambda x v x R grid (NYC).
 (2) NYC bearings are concentrated (Manhattan's grid and shape): outside-r_t in-out conflicts for NYC are at least
     1.3x those for shuffled bearings at the same distances.
 (3) The gas model (same in-layer aircraft count, spread over the 5 km disc) is at least 3x below the simulated
     single-layer outside-r_t conflict rate (NYC base).
 (4) A direction split (outbound and inbound in separate layers) with a per-flight speed spread of +-15% (uniform)
     leaves at most 10% of the single-layer outside-r_t conflicts at the same lambda (NYC base). With equal speeds
     it leaves none outside r_t (a check, true by construction).
 (5) Single layer, NYC base: 0.1 outside-r_t conflicts per flight is reached below 100 flights/h.
Preliminary; a model of one hub's own traffic, not airspace with other operators, wind or avoidance manoeuvres.
"""
import json
import math
import os
import random
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
R_TERM = 250.0
HOVER = 60.0
DMAX = 5000.0


def load_nyc(dmax=DMAX):
    pts = json.load(open(os.path.join(HERE, "nyc_destinations.json")))["points_m"]
    return [(x, y) for x, y in pts if 0 < x * x + y * y <= dmax * dmax]


def shuffled(pts, seed=1):
    rnd = random.Random(seed)
    out = []
    for x, y in pts:
        d, a = math.hypot(x, y), rnd.uniform(0, 2 * math.pi)
        out.append((d * math.cos(a), d * math.sin(a)))
    return out


def disc(n, dmax=DMAX, seed=2):
    rnd = random.Random(seed)
    out = []
    while len(out) < n:
        x, y = rnd.uniform(-dmax, dmax), rnd.uniform(-dmax, dmax)
        if 0 < x * x + y * y <= dmax * dmax:
            out.append((x, y))
    return out


# ---------------- simulator ----------------

def flights(dests, lam_h, t_end, v, spread, rnd):
    lam = lam_h / 3600.0
    t, out = 0.0, []
    while True:
        t += rnd.expovariate(lam)
        if t > t_end:
            return out
        x, y = dests[rnd.randrange(len(dests))]
        vi = v * (1 + spread * rnd.uniform(-1, 1))
        out.append((t, x, y, vi))


def legs(fl, split):
    """(layer, ta, tb, px, py, vx, vy, kind): position at ta and velocity."""
    out = []
    for t0, x, y, vi in fl:
        d = math.hypot(x, y)
        ux, uy = x / d, y / d
        dur = d / vi
        out.append((0, t0, t0 + dur, 0.0, 0.0, vi * ux, vi * uy, "o"))
        ti = t0 + dur + HOVER
        out.append((1 if split else 0, ti, ti + dur, x, y, -vi * ux, -vi * uy, "i"))
    out.sort(key=lambda l: l[1])
    return out


def simulate(dests, lam_h, v=20.0, R=50.0, spread=0.0, split=False, n_flights=60000, seed=0):
    rnd = random.Random(seed)
    dmax = max(math.hypot(x, y) for x, y in dests)
    warm = 2 * dmax / (v * (1 - spread)) + HOVER + 60
    t_end = n_flights / lam_h * 3600.0
    fl = flights(dests, lam_h, t_end + 2 * warm, v, spread, rnd)
    lo, hi = warm, t_end + warm
    cnt = {k: [0, 0] for k in ("oo", "ii", "io")}   # [inside r_t, outside]
    active = {0: [], 1: []}
    R2 = R * R
    for L in legs(fl, split):
        lay, ta, tb, px, py, vx, vy, kind = L
        act = [a for a in active[lay] if a[2] > ta]
        for a in act:
            _, sa, sb, qx, qy, wx, wy, k2 = a
            t1, t2 = ta, min(tb, sb)
            # positions at t1
            ax, ay = px + vx * (t1 - ta), py + vy * (t1 - ta)
            bx, by = qx + wx * (t1 - sa), qy + wy * (t1 - sa)
            rx, ry, ux, uy = ax - bx, ay - by, vx - wx, vy - wy
            uu = ux * ux + uy * uy
            s = 0.0 if uu == 0 else min(max(-(rx * ux + ry * uy) / uu, 0.0), t2 - t1)
            dx, dy = rx + ux * s, ry + uy * s
            if dx * dx + dy * dy < R2:
                tc = t1 + s
                if lo <= tc < hi:
                    rad = 0.5 * (math.hypot(ax + vx * s, ay + vy * s) + math.hypot(bx + wx * s, by + wy * s))
                    key = "oo" if kind == k2 == "o" else "ii" if kind == k2 == "i" else "io"
                    cnt[key][0 if rad < R_TERM else 1] += 1
        act.append(L)
        active[lay] = act
    T = hi - lo
    n_win = sum(1 for f in fl if lo <= f[0] < hi)
    rates = {k: (c[0] / T, c[1] / T) for k, c in cnt.items()}   # per second
    return {"rates": rates, "counts": cnt, "T": T, "flights": n_win}


# ---------------- closed form and gas model ----------------

def closed_form(dests, lam_h, v=20.0, R=50.0, pairs=400000, seed=3):
    lam = lam_h / 3600.0
    rnd = random.Random(seed)
    pol = [(math.hypot(x, y), math.atan2(y, x)) for x, y in dests]
    tot = out = 0.0
    for _ in range(pairs):
        (d1, a1), (d2, a2) = pol[rnd.randrange(len(pol))], pol[rnd.randrange(len(pol))]
        s = abs(math.sin((a1 - a2) / 2))
        L = 2 * min(d1, d2)
        if s > 0:
            L = min(L, R / s)
        tot += L
        out += max(0.0, L - 2 * R_TERM)
    io_all, io_out = lam * lam / v * tot / pairs, lam * lam / v * out / pairs
    oo = lam * lam * R / v
    return {"io_all": io_all, "io_out": io_out, "oo": oo, "ii": oo, "all": io_all + 2 * oo}


def gas_model(dests, lam_h, v=20.0, R=50.0, dmax=DMAX):
    lam = lam_h / 3600.0
    md = sum(math.hypot(x, y) for x, y in dests) / len(dests)
    N = lam * 2 * md / v
    return 4 * N * N * R * v / (math.pi * math.pi * dmax * dmax), N


def per_h(x):
    return x * 3600.0


def total(res, outside_only=False):
    return sum(r[1] if outside_only else r[0] + r[1] for r in res["rates"].values())


def main():
    t_start = time.time()
    nyc = load_nyc()
    sets = {"nyc": nyc, "shuffled": shuffled(nyc), "disc": disc(len(nyc))}
    P = print
    P(f"# Milestone 11a: hub airspace conflicts. {len(nyc)} NYC destinations within {DMAX/1000:.0f} km of the hub.")
    md = sum(math.hypot(x, y) for x, y in nyc) / len(nyc)
    P(f"# NYC mean distance {md:.0f} m; r_t = {R_TERM:.0f} m; h = {HOVER:.0f} s. Rates in conflicts per hour.")

    P("\n## A. Base case (v 20 m/s, R 50 m, 60 flights/h, single layer, equal speeds): simulator vs closed form vs gas")
    P("set      | sim oo  ii   io(all) io(out) total  out | cf io(all) io(out) oo   total  out | ratio sim/cf total out | gas(out-eq) N  sim_out/gas")
    base = {}
    for name, ds in sets.items():
        s = simulate(ds, 60, n_flights=120000, seed=11)
        c = closed_form(ds, 60)
        g, N = gas_model(ds, 60)
        r = s["rates"]
        st, so = per_h(total(s)), per_h(total(s, True))
        cf_tot, cf_out = per_h(c["all"]), per_h(c["io_out"])
        base[name] = (s, c, g)
        P(f"{name:8s} | {per_h(sum(r['oo'])):5.2f} {per_h(sum(r['ii'])):5.2f} {per_h(sum(r['io'])):7.2f} {per_h(r['io'][1]):7.2f}"
          f" {st:6.2f} {so:6.2f} | {per_h(c['io_all']):7.2f} {cf_out:7.2f} {per_h(c['oo']):5.2f} {cf_tot:6.2f} {cf_out:6.2f}"
          f" | {st/cf_tot:6.3f} {so/cf_out:6.3f} | {per_h(g):8.3f} {N:5.2f} {so/per_h(g):7.2f}")
        P(f"           counts {s['counts']}, window {s['T']/3600:.0f} h, {s['flights']} flights")
    P(f"NYC / shuffled outside-r_t in-out (sim): {base['nyc'][0]['rates']['io'][1] / base['shuffled'][0]['rates']['io'][1]:.3f};"
      f" closed form: {base['nyc'][1]['io_out'] / base['shuffled'][1]['io_out']:.3f}")

    P("\n## B. Grid, NYC, single layer, equal speeds: outside-r_t and total conflicts per hour, sim vs closed form")
    P("lam/h  v   R   | sim_out cf_out ratio | sim_tot cf_tot ratio | out per flight")
    worst = 0.0
    for lam in (15, 30, 60, 120, 240):
        for v in (15.0, 20.0, 30.0):
            for R in (25.0, 50.0, 100.0):
                s = simulate(nyc, lam, v=v, R=R, n_flights=30000, seed=int(lam * 7 + v * 3 + R))
                c = closed_form(nyc, lam, v=v, R=R, pairs=150000)
                so, st = per_h(total(s, True)), per_h(total(s))
                ro, rt = so / per_h(c["io_out"]), st / per_h(c["all"])
                worst = max(worst, abs(ro - 1), abs(rt - 1))
                P(f"{lam:5d} {v:4.0f} {R:4.0f} | {so:7.2f} {per_h(c['io_out']):6.2f} {ro:5.3f} | {st:7.2f} {per_h(c['all']):6.2f} {rt:5.3f} | {so/lam:7.4f}")
    P(f"worst |sim/cf - 1| over the grid: {worst:.3f}")

    P("\n## C. Direction split and speed spread, NYC, v 20, R 50: outside-r_t conflicts per flight (and inside-r_t per flight)")
    P("lam/h | single eq   | single +-15% | split eq    | split +-15% | split15/single15 (out)")
    rows = {}
    for lam in (15, 30, 60, 120, 240):
        row = []
        for split in (False, True):
            for spread in (0.0, 0.15):
                s = simulate(nyc, lam, spread=spread, split=split, n_flights=60000, seed=lam + int(split) * 1000 + int(spread * 100))
                row.append((per_h(total(s, True)) / lam, (per_h(total(s)) - per_h(total(s, True))) / lam))
        rows[lam] = row
        P(f"{lam:5d} | " + " | ".join(f"{a:.4f} ({b:.3f})" for a, b in row) + f" | {row[3][0] / row[1][0]:.3f}")
    # flights/h for 0.1 outside conflicts per flight (linear in lambda: interpolate on the per-flight column)
    for idx, lab in ((0, "single eq"), (1, "single +-15%"), (3, "split +-15%")):
        lams = sorted(rows)
        hit = None
        for a, b in zip(lams, lams[1:]):
            ya, yb = rows[a][idx][0], rows[b][idx][0]
            if ya < 0.1 <= yb:
                hit = a + (0.1 - ya) * (b - a) / (yb - ya)
        P(f"0.1 outside-r_t conflicts per flight reached at: {lab}: " + (f"{hit:.0f} flights/h" if hit else "not in 15 to 240/h"))

    P("\n## D. Sensitivity: d_max 10 km, NYC, base case, single layer equal speeds")
    nyc10 = load_nyc(10000.0)
    s = simulate(nyc10, 60, n_flights=60000, seed=99)
    c = closed_form(nyc10, 60)
    g, N = gas_model(nyc10, 60, dmax=10000.0)
    so = per_h(total(s, True))
    P(f"{len(nyc10)} destinations; sim out {so:.2f}/h, closed form {per_h(c['io_out']):.2f}/h (ratio {so/per_h(c['io_out']):.3f});"
      f" gas {per_h(g):.3f}/h (N {N:.2f}); sim/gas {so/per_h(g):.2f}; per flight {so/60:.4f}")
    P(f"\n# runtime {time.time() - t_start:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
