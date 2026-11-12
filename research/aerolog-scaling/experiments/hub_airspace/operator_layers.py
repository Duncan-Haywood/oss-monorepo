"""Milestone 11e: with layers to spare, what should the second bit be? Leg direction, a speed band, or a pairing of
operators, and can the closed form pick the best assignment without the simulator?

11d found that with four operators flying at 12, 16, 24 and 28 m/s the semicircular rule (eastbound and westbound
tracks in different layers) still beats the outbound/inbound split, but its residue rises 76% over equal speeds:
aircraft of different operators on near-parallel tracks share a layer and the faster runs the slower down. 11d's
"Next" proposed a speed band as the extra bit. A speed band is one particular way of splitting four operators into
two groups of two (slow {0, 1}, fast {2, 3}); there are three such pairings, and the operators' service discs
overlap by very different amounts (hub separations 0-1 3.5 km, 1-3 3.4 km, 0-2 4.6 km, 0-3 and 1-2 6.8 km,
2-3 9.4 km, against 5 km service radii). So the question is wider than speed: when a UTM service hands out
altitude layers, does it pay more to separate leg directions, speeds, or operators, and which operators to group?

Rules (each a set of bits; the layer is the tuple of bits):
  single; inout (leg direction); semi (eastbound or westbound track);
  pA, pB, pC: the operator pairings {0,1}{2,3}, {0,2}{1,3}, {0,3}{1,2} (pA is the speed band in S1 and S3);
  semi+inout (11c's four layers); semi+pA, semi+pB, semi+pC; inout+pC (four layers);
  semi+inout+pC (eight layers).
Model, scenarios and hub sites: 11d's (mixed_fleet.py): 11c's case B, four operators at the k-means sites, each
serving every destination within 5 km of its hub, Lambda = 240 flights/h for the city, R = 50 m, straight legs, no
wind, no avoidance, 60,000 flights per case. Scenarios S0 (equal shares, all 20 m/s), S1 (equal shares, 12, 16,
24, 28 m/s) and S3 (shares 0.55, 0.25, 0.15, 0.05 with S1's speeds). Seeds: the rules 11d ran keep 11d's seeds (so
those rows reproduce 11d exactly); new rules use 400 + index. Closed form: 11d's, with the layer function given
the operator (no other change).

Predictions (written and committed before any new rule's conflict was counted or closed-form value computed):
 (1) The closed form is within 25% of the simulator for en-route conflicts under every rule and scenario with at
     least 200 counted en-route conflicts (11c and 11d: 4% to 25% low under the layer rules).
 (2) Two layers: among the operator pairings, pC (pairing the hubs 6.8 km apart) leaves the fewest en-route
     conflicts in every scenario, and pA (the speed band, which keeps the 3.5 km pair 0-1 together) the most
     of the three in S0. Geography beats speed.
 (3) Two layers: semi still beats every operator pairing in S0 and S1 (the pairings leave every same-operator
     head-on conflict in place, which is about two thirds of the single layer's en-route conflicts).
 (4) Four layers, S1: semi+pA (semicircular x speed band) leaves fewer en-route conflicts than semi+inout
     (prior 45%: about a third of the cross-operator pairs stay together but the speed gap inside a band is
     4 m/s rather than about 9; semi+inout removes every out-in pair instead).
 (5) Four layers, every scenario: semi+pC leaves fewer en-route conflicts than semi+inout (prior 55%).
 (6) Four layers: inout+pC leaves fewer en-route conflicts than semi+inout in at least two of the three
     scenarios (prior 40%).
 (7) The closed form ranks the four-layer rules in the same order as the simulator in every scenario, and
     picks the simulator's best four-layer rule in every scenario.
 (8) Eight layers (semi+inout+pC) leave at most 40% of the best four-layer rule's en-route conflicts.
Preliminary.

    python3 operator_layers.py > operator_layers_results.txt
"""
import importlib.util
import math
import os
import random
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hub_airspace_mixed_11d", os.path.join(HERE, "mixed_fleet.py"))
_mf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mf)
HOVER, R_TERM, load_nyc, kmeans = _mf.HOVER, _mf.R_TERM, _mf.load_nyc, _mf.kmeans
Sampler, _cross, enr, window, mix_operators = _mf.Sampler, _mf._cross, _mf.enr, _mf.window, _mf.mix_operators

PAIRINGS = {"pA": (0, 0, 1, 1), "pB": (0, 1, 0, 1), "pC": (0, 1, 1, 0)}   # group of operator 0, 1, 2, 3
RULES = ("single", "inout", "semi", "pA", "pB", "pC", "semi+inout", "semi+pA", "semi+pB", "semi+pC",
         "inout+pC", "semi+inout+pC")
OLD_SEEDS = {"single": 104, "inout": 301, "semi": 302, "semi+inout": 303}   # 11d's seeds for these rules
SCENARIOS = {k: _mf.SCENARIOS[k] for k in ("S0", "S1", "S3")}
FOUR = ("semi+inout", "semi+pA", "semi+pB", "semi+pC", "inout+pC")


def layer(rule, kind, vx, vy, hub):
    """Layer index for a leg: one bit per component of the rule."""
    out = []
    for part in rule.split("+"):
        if part == "single":
            out.append(0)
        elif part == "inout":
            out.append(0 if kind == "o" else 1)
        elif part == "semi":
            out.append(0 if (vx > 0 or (vx == 0 and vy > 0)) else 1)
        else:
            out.append(PAIRINGS[part][hub])
    return tuple(out)


def simulate(mix, speeds, lam_h, rule="single", R=50.0, n_flights=60000, seed=0):
    """11d's simulator (mixed_fleet.simulate) with the operator passed to the layer function."""
    rnd = random.Random(seed)
    smp = Sampler(mix)
    dmax = max(math.hypot(m[4] - m[2], m[5] - m[3]) for m in mix)
    warm = 2 * dmax / min(speeds) + HOVER + 60
    lo, hi = warm, warm + n_flights / lam_h * 3600.0
    lam = lam_h / 3600.0
    t, legs = 0.0, []
    while t < hi + warm:
        t += rnd.expovariate(lam)
        _, hub, hx, hy, x, y = smp.draw(rnd)
        v = speeds[hub]
        d = math.hypot(x - hx, y - hy)
        ux, uy = (x - hx) / d, (y - hy) / d
        dur = d / v
        legs.append((t, t + dur, hx, hy, v * ux, v * uy, "o", hub, hx, hy))
        ti = t + dur + HOVER
        legs.append((ti, ti + dur, x, y, -v * ux, -v * uy, "i", hub, hx, hy))
    legs.sort(key=lambda l: l[0])
    cnt = {(c, z): 0 for c in ("same", "cross") for z in ("term", "enr")}
    active = {}
    R2 = R * R
    for L in legs:
        ta, tb, px, py, vx, vy, kind, hub, hx, hy = L
        lay = layer(rule, kind, vx, vy, hub)
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
    return {k: c / T * 3600.0 for k, c in cnt.items()}, cnt


def closed_form(mix, speeds, lam_h, rule="single", R=50.0, pairs=400000, seed=3):
    """11d's closed form (mixed_fleet.closed_form) with the operator passed to the layer function."""
    lam = lam_h / 3600.0
    rnd = random.Random(seed)
    smp = Sampler(mix)
    acc = {(c, z): 0.0 for c in ("same", "cross") for z in ("term", "enr")}
    for _ in range(pairs):
        _, ha, ax, ay, xa, ya = smp.draw(rnd)
        _, hb, bx, by, xb, yb = smp.draw(rnd)
        ra, rb = (xa - ax, ya - ay), (xb - bx, yb - by)
        da, db = math.hypot(*ra), math.hypot(*rb)
        lo_a, li_a = layer(rule, "o", ra[0], ra[1], ha), layer(rule, "i", -ra[0], -ra[1], ha)
        lo_b, li_b = layer(rule, "o", rb[0], rb[1], hb), layer(rule, "i", -rb[0], -rb[1], hb)
        if ha == hb:
            v = speeds[ha]
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
        va_, vb_ = speeds[ha], speeds[hb]
        oa = (va_ * ra[0] / da, va_ * ra[1] / da)
        ob = (vb_ * rb[0] / db, vb_ * rb[1] / db)
        cap = da / va_ + db / vb_
        w_same = window(oa, ob, R, cap)
        w_opp = window(oa, (-ob[0], -ob[1]), R, cap)
        acc[("cross", zone)] += 0.5 * w_same * ((lo_a == lo_b) + (li_a == li_b)) + 0.5 * w_opp * ((lo_a == li_b) + (li_a == lo_b))
    return {k: lam * lam * a / pairs * 3600.0 for k, a in acc.items()}


def kendall(a, b):
    n, s = len(a), 0
    for i in range(n):
        for j in range(i + 1, n):
            s += (1 if (a[i] - a[j]) * (b[i] - b[j]) > 0 else -1)
    return s / (n * (n - 1) / 2)


def main():
    t0 = time.time()
    lam = 240
    pts = load_nyc(10000.0)
    hubs = kmeans(pts, 4)
    P = print
    P(f"# Milestone 11e: which bits to spend layers on. {len(pts)} NYC destinations within 10 km of 11a's hub.")
    P(f"# Lambda {lam}/h for the city, R 50 m, r_t {R_TERM:.0f} m, h {HOVER:.0f} s. Hubs: "
      + "; ".join(f"({h[0]:.0f}, {h[1]:.0f})" for h in hubs))
    P("# Hub separations km: " + ", ".join(f"{i}-{j} {math.dist(hubs[i], hubs[j]) / 1000:.2f}"
                                          for i in range(4) for j in range(i + 1, 4)))
    P("# Pairings (group of operator 0..3): " + "; ".join(f"{k} {v}" for k, v in PAIRINGS.items()))
    res = {}
    P("\n## En-route conflicts per flight, simulator (closed form), and terminal conflicts")
    P("scen | rule           | layers | enr/flight (cf)       sim/cf | enr count | term/flight (cf)    | cross share | vs single")
    for name, (shares, speeds) in SCENARIOS.items():
        mix = mix_operators(pts, hubs, shares)
        for j, rule in enumerate(RULES):
            seed = OLD_SEEDS.get(rule, 400 + j)
            s, cnt = simulate(mix, speeds, lam, rule=rule, seed=seed)
            c = closed_form(mix, speeds, lam, rule=rule)
            res[(name, rule)] = (s, c, cnt)
            tm = s[("same", "term")] + s[("cross", "term")]
            tmc = c[("same", "term")] + c[("cross", "term")]
            ne = cnt[("same", "enr")] + cnt[("cross", "enr")]
            cs = s[("cross", "enr")] / enr(s) if enr(s) else 0.0
            base = enr(res[(name, "single")][0])
            nl = 2 ** (0 if rule == "single" else len(rule.split("+")))
            P(f"{name}   | {rule:14s} | {nl:6d} | {enr(s) / lam:.4f} ({enr(c) / lam:.4f}) {enr(s) / enr(c) if enr(c) else float('nan'):6.3f} | "
              f"{ne:9d} | {tm / lam:.4f} ({tmc / lam:.4f}) | {cs:11.3f} | {enr(s) / base:.3f}")
        sys.stdout.flush()
    e = lambda n, r: enr(res[(n, r)][0]) / lam
    ec = lambda n, r: enr(res[(n, r)][1]) / lam
    P("\n## Prediction checks")
    P("(1) sim/cf for en route, rules with >= 200 counts:")
    for n in SCENARIOS:
        rs = [(r, e(n, r) / ec(n, r)) for r in RULES
              if res[(n, r)][2][("same", "enr")] + res[(n, r)][2][("cross", "enr")] >= 200]
        P(f"  {n}: worst {max(rs, key=lambda x: abs(x[1] - 1))[0]} {max(rs, key=lambda x: abs(x[1] - 1))[1]:.3f}; "
          f"all within 25%: {all(abs(x - 1) <= 0.25 for _, x in rs)}")
    for n in SCENARIOS:
        two = {r: e(n, r) for r in ("semi", "inout", "pA", "pB", "pC")}
        P(f"(2,3) {n} two layers: " + ", ".join(f"{r} {v:.4f}" for r, v in sorted(two.items(), key=lambda x: x[1])))
    for n in SCENARIOS:
        sim = [e(n, r) for r in FOUR]
        cf = [ec(n, r) for r in FOUR]
        order_s = [r for _, r in sorted(zip(sim, FOUR))]
        order_c = [r for _, r in sorted(zip(cf, FOUR))]
        P(f"(4-7) {n} four layers, simulator: " + ", ".join(f"{r} {e(n, r):.4f}" for r in order_s))
        P(f"      {n} four layers, closed form: " + ", ".join(f"{r} {ec(n, r):.4f}" for r in order_c))
        P(f"      same order {order_s == order_c}; same best {order_s[0] == order_c[0]}; Kendall tau {kendall(sim, cf):.2f}")
        P(f"(8) {n} eight layers / best four: {e(n, 'semi+inout+pC') / min(sim):.3f}")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
