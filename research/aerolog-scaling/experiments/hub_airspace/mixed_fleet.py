"""Milestone 11d: operators that fly at different speeds and hold unequal market shares. Does the semicircular rule
still beat the outbound/inbound split, and does the closed form carry unequal speeds?

11c found that with four operators sharing one city the semicircular rule (eastbound and westbound tracks in
different layers) leaves 68% fewer en-route conflicts than the outbound/inbound split, at equal speeds and equal
shares. Real operators differ: multirotors cruise slower than fixed-wing or tilt-rotor delivery aircraft, and one
operator usually carries most of the volume. Unequal speeds bring back overtaking: under the semicircular rule two
aircraft on nearly the same track share a layer, and at equal speeds they hardly close on each other; at unequal
speeds the faster one runs the slower one down.

Model: 11c's (multi_hub.py), case B with M = 4 operators at the k-means sites, each serving every destination within
5 km of its hub, Lambda = 240 flights/h for the city, R = 50 m, straight legs, no wind, no avoidance. New: each
operator m flies at its own speed v_m and gets a share s_m of the flights.

Closed form, generalised here (no fitting). Same-operator terms are 11c's (all same-hub) with v = v_m. For legs of
different operators crossing at X with velocities va and vb (vectors), two aircraft that pass X a time Delta apart
have relative position (va - vb) t + vb Delta, so their miss distance is |Delta| |va x vb| / |va - vb|, and the
window is W = 2R |va - vb| / |va x vb|, capped at d_a / v_a + d_b / v_b. At equal speeds it reduces to 11c's
2R / (v cos(alpha/2)). Edge effects (near-misses of non-crossing legs, crossings near an endpoint) are still ignored.

Scenarios (operators in 11c's k-means order: hub 0 at (-1056, -2524), 1 at (469, 598), 2 at (1834, -6068),
3 at (2519, 3278) m):
  S0  equal shares, all 20 m/s (11c's B M=4, same seeds: a reproduction check);
  S1  equal shares, speeds 12, 16, 24, 28 m/s (arithmetic mean 20; swept, not sourced; the range is meant to span a
      slow multirotor to a fast fixed-wing delivery aircraft);
  S2  shares 0.55, 0.25, 0.15, 0.05, all 20 m/s (a concentrated market; shares illustrative, not sourced);
  S3  S2's shares with S1's speeds.
Every scenario under the four layer rules of 11c (single, inout, semi, semi_inout).

Predictions (written before any S1 to S3 conflict was counted or closed-form value computed):
 (1) Single layer, every scenario: the closed form is within 10% of the simulator for en-route conflicts. Under the
     two- and four-layer rules, within 25% (11c found it 11% to 24% low with four operators).
 (2) S1: the semicircular rule still leaves at least 20% fewer en-route conflicts than the outbound/inbound split
     (prior 65%).
 (3) S1 against S0 under the semicircular rule: en-route conflicts per flight rise by at least 25% (overtaking
     between operators on near-parallel tracks; prior 60%).
 (4) S1 against S0 in a single layer: en-route conflicts per flight rise by 5% to 20% (same-operator head-on
     conflicts scale as 1/v_m, and E[1/v] over 12, 16, 24, 28 is 12% above 1/20).
 (5) S2 against S0, single layer: the cross-operator share of en-route conflicts falls from 31.5% to between 15%
     and 28% (the chance that two flights belong to different operators falls from 0.75 to 1 - sum s^2 = 0.61, and
     the busiest operator's own traffic grows as s^2), and en-route conflicts per flight rise by at least 10%.
 (6) S3: four layers (semi_inout) leave at most 50% of the semicircular rule's en-route conflicts.
Preliminary.

    python3 mixed_fleet.py > mixed_fleet_results.txt
"""
import importlib.util
import math
import os
import random
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hub_airspace_multi_11c", os.path.join(HERE, "multi_hub.py"))
_mh = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mh)
HOVER, R_TERM, load_nyc = _mh.HOVER, _mh.R_TERM, _mh.load_nyc
RULES, layer, kmeans, Sampler, _cross = _mh.RULES, _mh.layer, _mh.kmeans, _mh.Sampler, _mh._cross
enr, tot = _mh.enr, _mh.tot

SCENARIOS = {
    "S0": ((0.25, 0.25, 0.25, 0.25), (20.0, 20.0, 20.0, 20.0)),
    "S1": ((0.25, 0.25, 0.25, 0.25), (12.0, 16.0, 24.0, 28.0)),
    "S2": ((0.55, 0.25, 0.15, 0.05), (20.0, 20.0, 20.0, 20.0)),
    "S3": ((0.55, 0.25, 0.15, 0.05), (12.0, 16.0, 24.0, 28.0)),
}


def mix_operators(pts, hubs, shares, radius=5000.0):
    """Operator m serves every point within radius of its hub and gets share s_m of the flights."""
    out = []
    for j, (hx, hy) in enumerate(hubs):
        mine = [(x, y) for x, y in pts if 0 < (x - hx) ** 2 + (y - hy) ** 2 <= radius * radius]
        out += [(shares[j] / len(mine), j, hx, hy, x, y) for x, y in mine]
    return out


def simulate(mix, speeds, lam_h, rule="single", R=50.0, n_flights=60000, seed=0):
    """11c's simulator with a speed per operator (hub id)."""
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
    return {k: c / T * 3600.0 for k, c in cnt.items()}, cnt


def window(va, vb, R, cap):
    """Departure-offset window for two straight legs crossing with velocity vectors va, vb."""
    cr = abs(va[0] * vb[1] - va[1] * vb[0])
    rel = math.hypot(va[0] - vb[0], va[1] - vb[1])
    if cr == 0:
        return cap
    return min(2 * R * rel / cr, cap)


def closed_form(mix, speeds, lam_h, rule="single", R=50.0, pairs=400000, seed=3):
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
        if ha == hb:   # 11a / 11c same-hub terms at the operator's speed
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
        oa = (va_ * ra[0] / da, va_ * ra[1] / da)   # outbound velocity of a
        ob = (vb_ * rb[0] / db, vb_ * rb[1] / db)
        cap = da / va_ + db / vb_
        w_same = window(oa, ob, R, cap)                 # oo and ii pairs (ii: both reversed, same window)
        w_opp = window(oa, (-ob[0], -ob[1]), R, cap)    # oi and io pairs
        acc[("cross", zone)] += 0.5 * w_same * ((lo_a == lo_b) + (li_a == li_b)) + 0.5 * w_opp * ((lo_a == li_b) + (li_a == lo_b))
    return {k: lam * lam * a / pairs * 3600.0 for k, a in acc.items()}


def main():
    t0 = time.time()
    lam = 240
    pts = load_nyc(10000.0)
    hubs = kmeans(pts, 4)
    P = print
    P(f"# Milestone 11d: four operators with unequal speeds and shares. {len(pts)} NYC destinations within 10 km of 11a's hub.")
    P(f"# Lambda {lam}/h for the city, R 50 m, r_t {R_TERM:.0f} m, h {HOVER:.0f} s. Hubs: "
      + "; ".join(f"({h[0]:.0f}, {h[1]:.0f})" for h in hubs))
    res = {}
    P("\n## En-route and terminal conflicts per flight, simulator (closed form)")
    P("scen | shares                 | speeds m/s       | rule       | enr/flight (cf)     sim/cf | term/flight (cf)    | cross share of enr | enr vs single")
    for name, (shares, speeds) in SCENARIOS.items():
        mix = mix_operators(pts, hubs, shares)
        for j, rule in enumerate(RULES):
            seed = 104 if rule == "single" else 300 + j   # 11c's seeds for B M=4
            s, cnt = simulate(mix, speeds, lam, rule=rule, seed=seed)
            c = closed_form(mix, speeds, lam, rule=rule)
            res[(name, rule)] = (s, c, cnt)
            tm = s[("same", "term")] + s[("cross", "term")]
            tmc = c[("same", "term")] + c[("cross", "term")]
            cs = s[("cross", "enr")] / enr(s) if enr(s) else 0.0
            base = enr(res[(name, "single")][0])
            P(f"{name}   | {' '.join(f'{x:.2f}' for x in shares)} | {' '.join(f'{x:4.0f}' for x in speeds)} | {rule:10s} | "
              f"{enr(s) / lam:.4f} ({enr(c) / lam:.4f}) {enr(s) / enr(c) if enr(c) else float('nan'):5.3f} | "
              f"{tm / lam:.4f} ({tmc / lam:.4f}) | {cs:6.3f} | {enr(s) / base:.3f}")
            P(f"       counts {cnt}")
    P("\n## Prediction checks")
    e = lambda n, r: enr(res[(n, r)][0]) / lam
    for n in SCENARIOS:
        P(f"{n}: semi / inout en route {e(n, 'semi') / e(n, 'inout'):.3f}; semi_inout / semi {e(n, 'semi_inout') / e(n, 'semi'):.3f}")
    P(f"S1 / S0 en route, semi {e('S1', 'semi') / e('S0', 'semi'):.3f}; single {e('S1', 'single') / e('S0', 'single'):.3f}; inout {e('S1', 'inout') / e('S0', 'inout'):.3f}")
    s0, s2 = res[("S0", "single")][0], res[("S2", "single")][0]
    P(f"S2 vs S0 single: cross share {s2[('cross', 'enr')] / enr(s2):.3f} vs {s0[('cross', 'enr')] / enr(s0):.3f}; enr per flight ratio {enr(s2) / enr(s0):.3f}")
    P(f"S3 / S2 en route, semi {e('S3', 'semi') / e('S2', 'semi'):.3f}; single {e('S3', 'single') / e('S2', 'single'):.3f}")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
