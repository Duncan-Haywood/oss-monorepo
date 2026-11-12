"""Milestone 11b: several hubs and several operators in one cruise layer. Where do crossing flows come from, does
a closed form still predict the conflict rate, and which altitude-layer rule removes the most conflicts?

Milestone 11a counted one hub's own traffic: a head-on problem, predicted to about 1% by a closed form. A city has
more than one hub, and the next question is whether flights from different hubs cross and add a gas-like term.

An observation made before any code ran, which shapes the design. If one operator assigns each destination to its
nearest hub, each hub's destinations lie in its Voronoi cell, which is convex and contains the hub, so every
straight leg from that hub stays inside the cell. Legs from different hubs then never cross; they can only come
within R of each other along a shared cell boundary. So one operator's hubs (case A) should decompose into
independent 11a problems, and crossing flows come from overlapping service areas: several operators, each with its
own hub, serving the same addresses (case B).

Model (as 11a, generalised). Flights depart Poisson; each flight has a hub (hx, hy) and a destination; it cruises
out at v, leaves the layer for h = 60 s at the destination, and cruises back along the same line. Straight legs,
equal speeds, 2D layers, instant climb and descent out of the layer. A leg's layer is set by a rule:
  single     one layer;
  inout      outbound in layer 0, inbound in layer 1 (11a's direction split);
  semi       the semicircular rule of crewed aviation: eastbound tracks (east component > 0) in layer 0, westbound
             in layer 1;
  semi_inout four layers, the product of the two.
A conflict is a pair of legs in the same layer whose exact closest point of approach is under R. It is "terminal"
if the mean distance of the two aircraft from their own hubs at the CPA is under r_t = 250 m, else "en route", and
"cross" if the two flights belong to different hubs.

Closed form, derived here (no fitting). Let a, b be two flights drawn independently from the city's flight mix and
Lambda the total departure rate. Then C = Lambda^2 E[ W_oo / 2 + W_ii / 2 + W_oi ], where W_xy is the length of the
set of departure-time differences for which leg x of a and leg y of b conflict, times the indicator that the two
legs share a layer. Same hub: W_oo = W_ii = 2R/v (11a's oo and ii terms) and W_oi = min(2 min(d_a, d_b), R / s)/v
with s = |sin(dphi/2)| (11a's head-on term). Different hubs, legs crossing at X with angle theta between the two
outbound directions: two aircraft that pass X a time Delta apart miss by v |Delta| cos(alpha/2), alpha the angle
between their velocities, so W = 2R / (v cos(alpha/2)), with alpha = theta for oo and ii pairs and pi - theta for
oi pairs; each capped at (L_a + L_b) / v (the legs must share a time window); W = 0 if the segments do not
intersect. The expectation is a Monte Carlo over flight pairs. Edge effects (near-misses of non-crossing segments,
crossings within R of an endpoint) are ignored. Gas model for comparison: N aircraft in the layer (N = Lambda *
2 E[d] / v), C = 4 N^2 R v / (pi A), A the union of the service areas; its cross-operator part is (1 - 1/M) of it.

Data: 11a's NYC destinations (measured Uber pickups, April 2014; nyc_destinations.json), all points within 10 km of
11a's hub (the origin). Hub sites: k-means (k-means++ seeding, seed 7, 100 Lloyd iterations) on those points.
  Case A, one operator: K = 1 (11a's hub at the origin), 2, 4, 8 hubs; each destination served by its nearest hub.
  Case B, M operators (M = 2, 4) with hubs at the k-means sites for k = M; operator m serves every destination
         within 5 km of its own hub (service areas overlap); each operator gets Lambda / M.
Base case: Lambda = 240 flights/h for the city, v = 20 m/s, R = 50 m (swept in 11a, not sourced; there is no
drone-to-drone separation standard), 60,000 flights per simulated case.

Predictions (written before the hub sites were computed or any conflict counted):
 (1) Single layer, every A and B case: the closed form is within 10% of the simulator for total and for en-route
     conflicts.
 (2) Case A: cross-hub conflicts are under 2% of en-route conflicts for every K (the Voronoi argument above).
 (3) Case A: en-route conflicts per flight at K = 8 are at most 1/8 of those at K = 1 (each hub carries Lambda/K
     on legs about 1/sqrt(K) as long; for uniform demand the ratio would be K^-1.5 = 1/22).
 (4) Case B, M = 4, single layer: cross-operator conflicts are at least 25% of en-route conflicts.
 (5) Case B, M = 4: the gas model is within a factor 2 of the simulated cross-operator en-route conflicts (crossing
     flows are gas-like), while it stays at least 3x below the simulated total en-route rate.
 (6) Two layers, case B, M = 4: the semicircular rule leaves at least 20% fewer en-route conflicts than the
     inbound/outbound split (the split keeps head-on-ish crossings between operators; semicircular removes pairs
     whose headings differ by more than 90 degrees on average). Case A, K = 8: the inbound/outbound split leaves
     fewer en-route conflicts than the semicircular rule (one operator's traffic is head-on, which the split
     removes entirely with equal speeds).
 (7) Four layers (semi_inout), case B, M = 4: at most 50% of the better two-layer rule's en-route conflicts.
Preliminary; straight legs, no wind, no avoidance, equal speeds.

    python3 multi_hub.py > multi_hub_results.txt
"""
import math
import os
import random
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from run import HOVER, R_TERM, load_nyc  # noqa: E402

RULES = ("single", "inout", "semi", "semi_inout")


def layer(rule, kind, vx, vy):
    io = 0 if kind == "o" else 1
    east = 0 if (vx > 0 or (vx == 0 and vy > 0)) else 1
    return {"single": 0, "inout": io, "semi": east, "semi_inout": 2 * east + io}[rule]


# ---------------- hub siting ----------------

def kmeans(pts, k, seed=7, iters=100):
    rnd = random.Random(seed)
    cent = [pts[rnd.randrange(len(pts))]]
    while len(cent) < k:   # k-means++ seeding
        d2 = [min((x - cx) ** 2 + (y - cy) ** 2 for cx, cy in cent) for x, y in pts]
        r, acc = rnd.uniform(0, sum(d2)), 0.0
        for p, w in zip(pts, d2):
            acc += w
            if acc >= r:
                cent.append(p)
                break
    for _ in range(iters):
        sx, sy, n = [0.0] * k, [0.0] * k, [0] * k
        for x, y in pts:
            j = min(range(k), key=lambda i: (x - cent[i][0]) ** 2 + (y - cent[i][1]) ** 2)
            sx[j] += x
            sy[j] += y
            n[j] += 1
        cent = [(sx[j] / n[j], sy[j] / n[j]) if n[j] else cent[j] for j in range(k)]
    return cent


def mix_one_operator(pts, hubs):
    """Flight mix: (weight, hub id, hx, hy, dx, dy); each destination to its nearest hub, equal weights."""
    out = []
    for x, y in pts:
        j = min(range(len(hubs)), key=lambda i: (x - hubs[i][0]) ** 2 + (y - hubs[i][1]) ** 2)
        out.append((1.0, j, hubs[j][0], hubs[j][1], x, y))
    return out


def mix_operators(pts, hubs, radius=5000.0):
    """Each operator serves every point within radius of its hub; operators get equal shares of the flights."""
    out = []
    for j, (hx, hy) in enumerate(hubs):
        mine = [(x, y) for x, y in pts if 0 < (x - hx) ** 2 + (y - hy) ** 2 <= radius * radius]
        out += [(1.0 / len(mine), j, hx, hy, x, y) for x, y in mine]
    return out


class Sampler:
    def __init__(self, mix):
        self.mix = mix
        self.cum, acc = [], 0.0
        for m in mix:
            acc += m[0]
            self.cum.append(acc)
        self.tot = acc

    def draw(self, rnd):
        import bisect
        return self.mix[min(bisect.bisect_left(self.cum, rnd.uniform(0, self.tot)), len(self.mix) - 1)]


# ---------------- simulator ----------------

def simulate(mix, lam_h, rule="single", v=20.0, R=50.0, n_flights=60000, seed=0):
    rnd = random.Random(seed)
    smp = Sampler(mix)
    dmax = max(math.hypot(m[4] - m[2], m[5] - m[3]) for m in mix)
    warm = 2 * dmax / v + HOVER + 60
    lo, hi = warm, warm + n_flights / lam_h * 3600.0
    lam = lam_h / 3600.0
    t, legs = 0.0, []
    while t < hi + warm:
        t += rnd.expovariate(lam)
        _, hub, hx, hy, x, y = smp.draw(rnd)
        d = math.hypot(x - hx, y - hy)
        ux, uy = (x - hx) / d, (y - hy) / d
        dur = d / v
        legs.append((t, t + dur, hx, hy, v * ux, v * uy, "o", hub, hx, hy))
        ti = t + dur + HOVER
        legs.append((ti, ti + dur, x, y, -v * ux, -v * uy, "i", hub, hx, hy))
    legs.sort(key=lambda l: l[0])
    keys = [(c, z) for c in ("same", "cross") for z in ("term", "enr")]
    cnt = {k: 0 for k in keys}
    active = {}
    R2 = R * R
    for L in legs:
        ta, tb, px, py, vx, vy, kind, hub, hx, hy = L
        lay = layer(rule, kind, vx, vy)
        act = [a for a in active.get(lay, ()) if a[1] > ta]
        for a in act:
            sa, sb, qx, qy, wx, wy, _k2, hub2, gx, gy = a
            t2 = min(tb, sb)
            bx, by = qx + wx * (ta - sa), qy + wy * (ta - sa)
            rx, ry, ux, uy = px - bx, py - by, vx - wx, vy - wy
            uu = ux * ux + uy * uy
            s = 0.0 if uu == 0 else min(max(-(rx * ux + ry * uy) / uu, 0.0), t2 - ta)
            dx, dy = rx + ux * s, ry + uy * s
            if dx * dx + dy * dy < R2 and lo <= ta + s < hi:
                rad = 0.5 * (math.hypot(px + vx * s - hx, py + vy * s - hy) + math.hypot(bx + wx * s - gx, by + wy * s - gy))
                cnt[("same" if hub == hub2 else "cross", "term" if rad < R_TERM else "enr")] += 1
        act.append(L)
        active[lay] = act
    T = hi - lo
    return {k: c / T * 3600.0 for k, c in cnt.items()}, cnt, T


# ---------------- closed form ----------------

def _cross(p, r, q, s):
    """Intersection of segments p->p+r and q->q+s: (t, u) or None."""
    den = r[0] * s[1] - r[1] * s[0]
    if den == 0:
        return None
    qp = (q[0] - p[0], q[1] - p[1])
    t = (qp[0] * s[1] - qp[1] * s[0]) / den
    u = (qp[0] * r[1] - qp[1] * r[0]) / den
    return (t, u) if 0 <= t <= 1 and 0 <= u <= 1 else None


def closed_form(mix, lam_h, rule="single", v=20.0, R=50.0, pairs=400000, seed=3):
    lam = lam_h / 3600.0
    rnd = random.Random(seed)
    smp = Sampler(mix)
    acc = {(c, z): 0.0 for c in ("same", "cross") for z in ("term", "enr")}
    for _ in range(pairs):
        _, ha, ax, ay, xa, ya = smp.draw(rnd)
        _, hb, bx, by, xb, yb = smp.draw(rnd)
        ra, rb = (xa - ax, ya - ay), (xb - bx, yb - by)
        da, db = math.hypot(*ra), math.hypot(*rb)
        lo_a, li_a = layer(rule, "o", ra[0], ra[1]), layer(rule, "i", -ra[0], -ra[1])
        lo_b, li_b = layer(rule, "o", rb[0], rb[1]), layer(rule, "i", -rb[0], -rb[1])
        if ha == hb:
            # oo and ii at the hub: (1/2) * 2R/v each, all terminal (11a)
            acc[("same", "term")] += (R / v) * ((lo_a == lo_b) + (li_a == li_b))
            if lo_a == li_b:
                s = abs(math.sin((math.atan2(ra[1], ra[0]) - math.atan2(rb[1], rb[0])) / 2))
                L = 2 * min(da, db)
                if s > 0:
                    L = min(L, R / s)
                out = max(0.0, L - 2 * R_TERM)
                acc[("same", "enr")] += out / v
                acc[("same", "term")] += (L - out) / v
            continue
        hit = _cross((ax, ay), ra, (bx, by), rb)
        if hit is None:
            continue
        X = (ax + hit[0] * ra[0], ay + hit[0] * ra[1])
        zone = "term" if 0.5 * (math.hypot(X[0] - ax, X[1] - ay) + math.hypot(X[0] - bx, X[1] - by)) < R_TERM else "enr"
        cth = (ra[0] * rb[0] + ra[1] * rb[1]) / (da * db)
        th = math.acos(max(-1.0, min(1.0, cth)))
        cap = (da + db) / v
        w_same_dir = min(2 * R / (v * max(math.cos(th / 2), 1e-12)), cap)   # oo, ii: alpha = theta
        w_opp_dir = min(2 * R / (v * max(math.sin(th / 2), 1e-12)), cap)    # oi: alpha = pi - theta
        acc[("cross", zone)] += 0.5 * w_same_dir * ((lo_a == lo_b) + (li_a == li_b)) + w_opp_dir * (lo_a == li_b)
    return {k: lam * lam * a / pairs * 3600.0 for k, a in acc.items()}


def gas(mix, lam_h, n_ops, area, v=20.0, R=50.0):
    smp = Sampler(mix)
    md = sum(m[0] * math.hypot(m[4] - m[2], m[5] - m[3]) for m in mix) / smp.tot
    N = lam_h / 3600.0 * 2 * md / v
    tot = 4 * N * N * R * v / (math.pi * area) * 3600.0
    return tot, tot * (1 - 1 / n_ops), N


def union_area(hubs, radius, seed=5, n=400000):
    rnd = random.Random(seed)
    xs = [h[0] for h in hubs]
    ys = [h[1] for h in hubs]
    x0, x1, y0, y1 = min(xs) - radius, max(xs) + radius, min(ys) - radius, max(ys) + radius
    hit = sum(1 for _ in range(n) if any((u - hx) ** 2 + (w - hy) ** 2 <= radius * radius for hx, hy in hubs)
              for u, w in [(rnd.uniform(x0, x1), rnd.uniform(y0, y1))])
    return hit / n * (x1 - x0) * (y1 - y0)


# ---------------- main ----------------

def fmt(d):
    return " ".join(f"{d[(c, z)]:7.2f}" for c in ("same", "cross") for z in ("term", "enr"))


def enr(d):
    return d[("same", "enr")] + d[("cross", "enr")]


def tot(d):
    return sum(d.values())


def main():
    t0 = time.time()
    lam = 240
    pts = load_nyc(10000.0)
    P = print
    P(f"# Milestone 11b: several hubs and operators. {len(pts)} NYC destinations within 10 km of 11a's hub.")
    P(f"# Lambda {lam}/h for the city, v 20 m/s, R 50 m, r_t {R_TERM:.0f} m, h {HOVER:.0f} s. Rates in conflicts per hour.")
    P("# columns: same-hub terminal, same-hub en route, cross-hub terminal, cross-hub en route")
    cases = {}
    for K in (1, 2, 4, 8):
        hubs = [(0.0, 0.0)] if K == 1 else kmeans(pts, K)
        cases[f"A K={K}"] = (mix_one_operator(pts, hubs), hubs, 1, math.pi * 1e8)
    for M in (2, 4):
        hubs = kmeans(pts, M)
        cases[f"B M={M}"] = (mix_operators(pts, hubs), hubs, M, union_area(hubs, 5000.0))
    P("\n## Hub sites (m east, m north of 11a's hub) and flight shares")
    for name, (mix, hubs, M, area) in cases.items():
        sh = [sum(m[0] for m in mix if m[1] == j) for j in range(len(hubs))]
        s = sum(sh)
        P(f"{name}: " + "; ".join(f"({h[0]:.0f}, {h[1]:.0f}) {w / s:.2f}" for h, w in zip(hubs, sh))
          + f"; service area {area / 1e6:.1f} km2")

    P("\n## 1. Single layer: simulator vs closed form vs gas")
    P("case    | sim: s_term s_enr  c_term c_enr | cf: s_term s_enr  c_term c_enr | sim/cf tot enr | enr/flight cross share | gas tot (cross) N | sim_enr/gas sim_cross_enr/gas_cross")
    single = {}
    for i, (name, (mix, hubs, M, area)) in enumerate(cases.items()):
        s, cnt, _ = simulate(mix, lam, seed=100 + i)
        c = closed_form(mix, lam)
        g, gc, N = gas(mix, lam, M, area)
        single[name] = (s, c)
        cs = s[("cross", "enr")] / enr(s) if enr(s) else 0.0
        gcx = f"{s[('cross', 'enr')] / gc:6.2f}" if gc else "   n/a"
        P(f"{name:7s} | {fmt(s)} | {fmt(c)} | {tot(s) / tot(c):5.3f} {enr(s) / enr(c):5.3f} | {enr(s) / lam:7.4f} {cs:6.3f}"
          f" | {g:6.2f} ({gc:6.2f}) {N:5.2f} | {enr(s) / g:6.2f} {gcx}")
        P(f"          counts {cnt}")
    r = enr(single["A K=8"][0]) / enr(single["A K=1"][0])
    P(f"A: en-route per flight, K=8 / K=1 (sim): {r:.3f} (closed form {enr(single['A K=8'][1]) / enr(single['A K=1'][1]):.3f})")

    P("\n## 2. Layer rules: en-route and terminal conflicts per flight, simulator (closed form)")
    P("case    | rule       | enr/flight (cf)       | term/flight (cf)      | cross share of enr | enr vs single")
    for name in ("A K=8", "B M=2", "B M=4"):
        mix, hubs, M, area = cases[name]
        for j, rule in enumerate(RULES):
            s = single[name][0] if rule == "single" else simulate(mix, lam, rule=rule, seed=300 + j)[0]
            c = single[name][1] if rule == "single" else closed_form(mix, lam, rule=rule)
            tm = s[("same", "term")] + s[("cross", "term")]
            tmc = c[("same", "term")] + c[("cross", "term")]
            cs = s[("cross", "enr")] / enr(s) if enr(s) else 0.0
            P(f"{name:7s} | {rule:10s} | {enr(s) / lam:.4f} ({enr(c) / lam:.4f}) | {tm / lam:.4f} ({tmc / lam:.4f})"
              f" | {cs:6.3f} | {enr(s) / enr(single[name][0]):.3f}")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
