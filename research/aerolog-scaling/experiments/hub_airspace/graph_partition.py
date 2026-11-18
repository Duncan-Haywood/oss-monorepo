"""Milestone 11f: with eight operators, which operators should share an altitude layer? A graph partition on
closed-form pairwise conflict weights, against the simulator's own best and the heuristics a planner would use.

11e found that once the semicircular rule (eastbound and westbound tracks in different layers) has removed most
same-operator head-on conflicts, the en-route residue is mostly cross-operator, and the best use of the next layer
bit is to put the operators whose service areas overlap most in different layers. With four operators there are
only three ways to pair them. With M operators the choice is a graph partition: give each operator pair (i, j) a
weight w_ij, the en-route conflict rate their flights would have if they shared a layer, and split the operators
into groups so that the weight inside groups is smallest (equivalently, the cut is largest: max-cut).

Observation used here (exact, tested): under any rule "base + operator group", a conflict between two legs is
counted iff it is counted under the base rule and the two operators share a group. The simulator checks pairs of
legs only inside a layer and drops a leg only when it ends, so one base-rule run with per-operator-pair counts
gives every partition's simulated count on the same flights (common random numbers). The closed form decomposes
the same way. So all 127 bipartitions and all 4-way partitions can be scored from one run per base rule.

Model: 11d/11e's (mixed_fleet.py, operator_layers.py): straight legs, no wind, no avoidance, R = 50 m, terminal
radius 250 m, 60 s hover, Lambda = 240 flights/h for the city. New: M = 8 operators at the 8 k-means sites of the
20,000 NYC destinations (multi_hub.kmeans, seed 7), each serving every destination within 5 km of its hub.
Scenarios (operators in k-means order; speeds and shares illustrative, not sourced):
  G0  equal shares, all 20 m/s;
  G1  equal shares, speeds 12, 14, 16, 18, 22, 24, 26, 28 m/s (mean 20);
  G2  shares proportional to 1/k (k = 1..8; 0.37 down to 0.05) with G1's speeds (the largest operator is slowest).
Base rules: semi (two layers), semi+inout (four). Per scenario and base rule: an in-sample run (seed 500/501,
300,000 flights) and a fresh run (seed 600/601, 300,000 flights) used only to score the partitions each method
picked, so that picking the simulator's best on the in-sample run (an oracle with a winner's curse) and the
other methods are compared out of sample. Closed form: 11d's, accumulated per operator pair, 1,000,000 pairs.

Methods that choose a bipartition (semi + group bit, four layers):
  cf      max-cut on closed-form en-route weights under semi;
  oracle  the in-sample simulator's best bipartition;
  dist    max-cut on s_i s_j / d_ij (d_ij the hub separation);
  overlap max-cut on s_i s_j n_ij / sqrt(n_i n_j) (n_ij destinations inside both service discs);
  speed   the four slowest against the four fastest (G1, G2);
  mean    the mean over all 35 balanced (4/4) bipartitions.

Predictions (written and committed before any 8-operator conflict was counted or closed-form value computed):
 (1) Decomposition: a direct simulation of semi + a partition equals the in-sample pairwise sum exactly
     (same seed), checked here for the cf and speed partitions.
 (2) Pairwise weights: over the 28 cross-operator pairs, the closed-form and simulated en-route weights under
     semi have Pearson r >= 0.9 in every scenario, and the closed-form total is within 25% of the simulator's.
 (3) Out of sample, the cf bipartition leaves at most 5% more en-route conflicts than the oracle's, in every
     scenario.
 (4) The cf bipartition beats the better of dist and overlap by at least 5% out of sample in G1 or G2 (prior
     40%), and is within 5% of both in G0 (prior 60%).
 (5) The speed band leaves at least 25% more en-route conflicts than the cf bipartition in G1 and G2.
 (6) semi + cf bipartition leaves between 30% and 60% of semi's en-route conflicts in every scenario.
 (7) The cf bipartition leaves at least 25% fewer en-route conflicts than the mean balanced bipartition.
 (8) Over all 127 non-trivial bipartitions, Kendall tau between closed-form and in-sample simulated en-route
     conflicts >= 0.8 in every scenario.
 (9) Eight layers: semi + the cf 4-way partition leaves fewer en-route conflicts than semi + inout + the cf
     bipartition, out of sample, in every scenario (prior 55%).
Preliminary.

    python3 graph_partition.py > graph_partition_results.txt
"""
import importlib.util
import itertools
import math
import os
import random
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hub_airspace_operator_layers_11e", os.path.join(HERE, "operator_layers.py"))
_ol = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ol)
HOVER, R_TERM, load_nyc, kmeans = _ol.HOVER, _ol.R_TERM, _ol.load_nyc, _ol.kmeans
Sampler, _cross, window, mix_operators, kendall = _ol.Sampler, _ol._cross, _ol.window, _ol.mix_operators, _ol.kendall
base_layer = _ol.layer

M = 8
SPEEDS8 = (12.0, 14.0, 16.0, 18.0, 22.0, 24.0, 26.0, 28.0)
_z = [1.0 / k for k in range(1, M + 1)]
ZIPF = tuple(x / sum(_z) for x in _z)
SCENARIOS = {
    "G0": ((1.0 / M,) * M, (20.0,) * M),
    "G1": ((1.0 / M,) * M, SPEEDS8),
    "G2": (ZIPF, SPEEDS8),
}
SEEDS = {("semi", "in"): 500, ("semi+inout", "in"): 501, ("semi", "fresh"): 600, ("semi+inout", "fresh"): 601}


def key(a, b):
    return (a, b) if a <= b else (b, a)


def simulate_pairs(mix, speeds, lam_h, layer_fn, R=50.0, n_flights=300000, seed=0):
    """11e's simulator; en-route and terminal conflict counts per operator pair (i <= j). layer_fn(kind, vx, vy, hub)."""
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
    cnt = {}
    active = {}
    R2 = R * R
    for L in legs:
        ta, tb, px, py, vx, vy, kind, hub, hx, hy = L
        lay = layer_fn(kind, vx, vy, hub)
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
                k = key(hub, hub2) + ("term" if rad < R_TERM else "enr",)
                cnt[k] = cnt.get(k, 0) + 1
        act.append(L)
        active[lay] = act
    return cnt, (hi - lo) / 3600.0


def closed_form_pairs(mix, speeds, lam_h, base, R=50.0, pairs=1000000, seed=3):
    """11d's closed form under a base rule, accumulated per operator pair: conflicts per hour by (i, j, zone)."""
    lam = lam_h / 3600.0
    rnd = random.Random(seed)
    smp = Sampler(mix)
    acc = {}
    lay = lambda kind, vx, vy, h: base_layer(base, kind, vx, vy, h)
    for _ in range(pairs):
        _, ha, ax, ay, xa, ya = smp.draw(rnd)
        _, hb, bx, by, xb, yb = smp.draw(rnd)
        ra, rb = (xa - ax, ya - ay), (xb - bx, yb - by)
        da, db = math.hypot(*ra), math.hypot(*rb)
        lo_a, li_a = lay("o", ra[0], ra[1], ha), lay("i", -ra[0], -ra[1], ha)
        lo_b, li_b = lay("o", rb[0], rb[1], hb), lay("i", -rb[0], -rb[1], hb)
        if ha == hb:
            v = speeds[ha]
            term = (R / v) * ((lo_a == lo_b) + (li_a == li_b))
            enr_ = 0.0
            if lo_a == li_b:
                s = abs(math.sin((math.atan2(ra[1], ra[0]) - math.atan2(rb[1], rb[0])) / 2))
                L = 2 * min(da, db)
                if s > 0:
                    L = min(L, R / s)
                out = max(0.0, L - 2 * R_TERM)
                enr_ = out / v
                term += (L - out) / v
            for z, x in (("term", term), ("enr", enr_)):
                acc[(ha, ha, z)] = acc.get((ha, ha, z), 0.0) + x
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
        x = 0.5 * w_same * ((lo_a == lo_b) + (li_a == li_b)) + 0.5 * w_opp * ((lo_a == li_b) + (li_a == lo_b))
        k = key(ha, hb) + (zone,)
        acc[k] = acc.get(k, 0.0) + x
    return {k: lam * lam * a / pairs * 3600.0 for k, a in acc.items()}


def score(w, part, zone="enr"):
    """Conflicts (per hour, or counts) kept under base + partition: same-operator plus same-group cross pairs."""
    return sum(x for (i, j, z), x in w.items() if z == zone and part[i] == part[j])


def bipartitions(m=M):
    """All 2^(m-1) labellings with operator 0 in group 0 (index 0 is the trivial one-group partition)."""
    return [(0,) + bits for bits in itertools.product((0, 1), repeat=m - 1)]


def kway(m=M, k=4):
    """Set partitions of m operators into at most k blocks, in canonical (first-occurrence) labelling."""
    out = []

    def rec(prefix, used):
        if len(prefix) == m:
            out.append(tuple(prefix))
            return
        for g in range(min(used + 1, k)):
            rec(prefix + [g], max(used, g + 1))
    rec([], 0)
    return out


def best(parts, w, zone="enr"):
    return min(parts, key=lambda p: (score(w, p, zone), p))


def heuristic_weights(hubs, shares, pts, radius=5000.0):
    """Pair weights a planner could compute from sites and shares alone: s_i s_j / d_ij and demand overlap."""
    r2 = radius * radius
    inside = [[(x - hx) ** 2 + (y - hy) ** 2 <= r2 for x, y in pts] for hx, hy in hubs]
    n = [sum(c) for c in inside]
    dist, over = {}, {}
    for i in range(len(hubs)):
        for j in range(i + 1, len(hubs)):
            dist[(i, j, "enr")] = shares[i] * shares[j] / math.dist(hubs[i], hubs[j])
            nij = sum(a and b for a, b in zip(inside[i], inside[j]))
            over[(i, j, "enr")] = shares[i] * shares[j] * nij / math.sqrt(n[i] * n[j])
    return dist, over


def pearson(a, b):
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    sa = math.sqrt(sum((x - ma) ** 2 for x in a))
    sb = math.sqrt(sum((y - mb) ** 2 for y in b))
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (sa * sb)


def main():
    t0 = time.time()
    lam = 240
    pts = load_nyc(10000.0)
    hubs = kmeans(pts, M)
    P = print
    P(f"# Milestone 11f: graph-partition layer assignment for {M} operators. {len(pts)} NYC destinations within 10 km of 11a's hub.")
    P(f"# Lambda {lam}/h for the city, R 50 m, r_t {R_TERM:.0f} m, h {HOVER:.0f} s, 5 km service discs. Hubs: "
      + "; ".join(f"{i} ({h[0]:.0f}, {h[1]:.0f})" for i, h in enumerate(hubs)))
    P("# Hub separations km: " + ", ".join(f"{i}-{j} {math.dist(hubs[i], hubs[j]) / 1000:.1f}"
                                          for i in range(M) for j in range(i + 1, M)))
    bip = bipartitions()
    nontriv = bip[1:]
    balanced = [p for p in bip if sum(p) == M // 2]
    k4 = kway()
    P(f"# {len(nontriv)} non-trivial bipartitions ({len(balanced)} balanced), {len(k4)} partitions into <= 4 groups")
    summary = {}
    for name, (shares, speeds) in SCENARIOS.items():
        mix = mix_operators(pts, hubs, shares)
        P(f"\n## {name}: shares {' '.join(f'{x:.3f}' for x in shares)}; speeds {' '.join(f'{x:.0f}' for x in speeds)} m/s")
        sim, hours, cf = {}, {}, {}
        for base in ("semi", "semi+inout"):
            fn = lambda kind, vx, vy, h, b=base: base_layer(b, kind, vx, vy, h)
            for tag in ("in", "fresh"):
                sim[(base, tag)], hours[(base, tag)] = simulate_pairs(mix, speeds, lam, fn, seed=SEEDS[(base, tag)])
            cf[base] = closed_form_pairs(mix, speeds, lam, base)
        fl = lambda base, tag: hours[(base, tag)] * lam   # flights in the counted window
        per = lambda base, tag, part, zone="enr": score(sim[(base, tag)], part, zone) / fl(base, tag)
        perc = lambda base, part, zone="enr": score(cf[base], part, zone) / lam
        one = (0,) * M
        P(f"semi alone, en route per flight: in-sample {per('semi', 'in', one):.4f}, fresh {per('semi', 'fresh', one):.4f}, "
          f"closed form {perc('semi', one):.4f}; counts in-sample {score(sim[('semi', 'in')], one)}")
        same_s = sum(x for (i, j, z), x in sim[("semi", "in")].items() if z == "enr" and i == j)
        P(f"  cross-operator share of semi's en-route conflicts (in-sample): {1 - same_s / score(sim[('semi', 'in')], one):.3f}")
        P(f"semi+inout alone, en route per flight: in-sample {per('semi+inout', 'in', one):.4f}, fresh "
          f"{per('semi+inout', 'fresh', one):.4f}, closed form {perc('semi+inout', one):.4f}")
        # (2) pairwise weights
        cross_pairs = [(i, j) for i in range(M) for j in range(i + 1, M)]
        ws = [sim[("semi", "in")].get((i, j, "enr"), 0) / fl("semi", "in") for i, j in cross_pairs]
        wc = [cf["semi"].get((i, j, "enr"), 0.0) / lam for i, j in cross_pairs]
        P("pair weights under semi, en-route conflicts per city flight x1000, sim (cf):")
        P("  " + "; ".join(f"{i}-{j} {a * 1000:.2f} ({b * 1000:.2f})" for (i, j), a, b in zip(cross_pairs, ws, wc)))
        r = pearson(ws, wc)
        tot_ratio = sum(ws) / sum(wc)
        P(f"(2) Pearson r {r:.3f}; cross total sim/cf {tot_ratio:.3f}")
        # choose bipartitions
        dist_w, over_w = heuristic_weights(hubs, shares, pts)
        picks = {
            "cf": best(nontriv, cf["semi"]),
            "oracle": best(nontriv, sim[("semi", "in")]),
            "dist": best(nontriv, dist_w),
            "overlap": best(nontriv, over_w),
        }
        if len(set(speeds)) > 1:
            order = sorted(range(M), key=lambda i: speeds[i])
            sp = [0] * M
            for i in order[M // 2:]:
                sp[i] = 1
            picks["speed"] = tuple(sp) if sp[0] == 0 else tuple(1 - x for x in sp)
        P("bipartitions (semi + group bit, 4 layers), en-route conflicts per flight: in-sample, fresh, closed form; terminal fresh")
        out = {}
        for m_, p in picks.items():
            out[m_] = per("semi", "fresh", p)
            P(f"  {m_:8s} {''.join(map(str, p))}  {per('semi', 'in', p):.4f}  {out[m_]:.4f}  {perc('semi', p):.4f}  "
              f"term {per('semi', 'fresh', p, 'term'):.4f}  vs semi {out[m_] / per('semi', 'fresh', one):.3f}")
        mean_bal = sum(per("semi", "fresh", p) for p in balanced) / len(balanced)
        mean_all = sum(per("semi", "fresh", p) for p in nontriv) / len(nontriv)
        worst = max(per("semi", "fresh", p) for p in nontriv)
        best_fresh = min(per("semi", "fresh", p) for p in nontriv)
        P(f"  mean balanced {mean_bal:.4f}; mean all {mean_all:.4f}; best fresh {best_fresh:.4f}; worst fresh {worst:.4f}")
        # (1) decomposition check: direct simulation with the group bit
        for m_ in ("cf", "speed"):
            if m_ not in picks:
                continue
            p = picks[m_]
            fn = lambda kind, vx, vy, h, p=p: base_layer("semi", kind, vx, vy, h) + (p[h],)
            d, _ = simulate_pairs(mix, speeds, lam, fn, seed=SEEDS[("semi", "in")])
            direct = sum(x for (i, j, z), x in d.items() if z == "enr")
            P(f"(1) direct semi+{m_} en-route count {direct} against pairwise sum {score(sim[('semi', 'in')], p)}: "
              f"{'equal' if direct == score(sim[('semi', 'in')], p) else 'DIFFERENT'}")
        # (8) rank agreement
        tau = kendall([per("semi", "in", p) for p in nontriv], [perc("semi", p) for p in nontriv])
        P(f"(8) Kendall tau over {len(nontriv)} bipartitions, cf vs in-sample sim: {tau:.3f}")
        # (9) eight layers
        p4 = best(k4, cf["semi"])
        e4 = per("semi", "fresh", p4)
        eio = per("semi+inout", "fresh", picks["cf"])
        o4 = best(k4, sim[("semi", "in")])
        P(f"(9) eight layers, fresh: semi + cf 4-way {''.join(map(str, p4))} {e4:.4f} (cf {perc('semi', p4):.4f}; "
          f"oracle 4-way {''.join(map(str, o4))} {per('semi', 'fresh', o4):.4f}); semi+inout + cf bipartition {eio:.4f} "
          f"(cf {perc('semi+inout', picks['cf']):.4f})")
        P(f"    all conflicts per flight, fresh: semi + cf 4-way {per('semi', 'fresh', p4) + per('semi', 'fresh', p4, 'term'):.4f}; "
          f"semi+inout + cf bipartition {eio + per('semi+inout', 'fresh', picks['cf'], 'term'):.4f}")
        summary[name] = dict(out=out, mean_bal=mean_bal, r=r, tot=tot_ratio, tau=tau, e4=e4, eio=eio,
                             semi=per("semi", "fresh", one))
        sys.stdout.flush()
    P("\n## Prediction checks")
    for n, s in summary.items():
        o = s["out"]
        P(f"{n}: (2) r {s['r']:.3f} >= 0.9 {s['r'] >= 0.9}; total sim/cf {s['tot']:.3f} within 25% {abs(s['tot'] - 1) <= 0.25}")
        P(f"    (3) cf / oracle {o['cf'] / o['oracle']:.3f} <= 1.05 {o['cf'] <= 1.05 * o['oracle']}")
        hb = min(o["dist"], o["overlap"])
        P(f"    (4) better heuristic / cf {hb / o['cf']:.3f}; dist/cf {o['dist'] / o['cf']:.3f}, overlap/cf {o['overlap'] / o['cf']:.3f}")
        if "speed" in o:
            P(f"    (5) speed / cf {o['speed'] / o['cf']:.3f} >= 1.25 {o['speed'] >= 1.25 * o['cf']}")
        P(f"    (6) cf / semi {o['cf'] / s['semi']:.3f} in [0.30, 0.60] {0.30 <= o['cf'] / s['semi'] <= 0.60}")
        P(f"    (7) cf / mean balanced {o['cf'] / s['mean_bal']:.3f} <= 0.75 {o['cf'] <= 0.75 * s['mean_bal']}")
        P(f"    (8) tau {s['tau']:.3f} >= 0.8 {s['tau'] >= 0.8}")
        P(f"    (9) semi+cf 4-way / semi+inout+cf {s['e4'] / s['eio']:.3f} < 1 {s['e4'] < s['eio']}")
    P(f"\n# runtime {time.time() - t0:.0f} s")


if __name__ == "__main__":
    sys.exit(main())
