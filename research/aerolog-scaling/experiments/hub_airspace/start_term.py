"""Milestone 11t: the closed form's missing start term computed exactly from hub sites and destination lists, with no
flight-pair sampling.

Why. 11s showed 11d's closed form (graph_partition.closed_form_pairs) is the flux term of the exact conflict rate
and that adding the start chords of every same-layer cross-operator leg pair (the conflicts that begin because a
drone launches from its hub, or turns for home at a delivery point, already within R of another operator's drone)
brings it within 2% of the exact estimator in 24 of 24 layouts. But 11s estimated that start term by sampling flight
pairs, like everything else. Its "Next" asked for a fully analytic start term from the destination density.

Two identities (both tested in tests/test_start_term.py).
 (i) Layer blindness. Under the semicircular base rule a flight's outbound leg takes layer lo and its return leg
     1 - lo, and both legs trace the same segment hub -> destination at the same speed. So for any start point x
     in any layer, exactly one of another flight's two legs is in that layer, and the time it spends within R of x
     is the same for either leg. The same-layer start chord of a flight pair therefore does not depend on layers at
     all: start(a flies, b starts at x) = chord(x; segment of a) / v_a.
 (ii) Factorisation. With independent flight draws, the start term of the (unordered) operator pair {A, B} in 11s's
     units (conflicts per hour, the 0.5 over ordered pairs absorbed) is
        lam^2 3600 [ S(A <- B) + S(B <- A) ],
        S(A <- B) = sum_b w_b [ G_A(h_B) + G_A(x_b) ],   G_A(x) = sum_a w_a chord(x; h_A -> y_a) / v_A,
     where w are the mix weights (share / number of destinations), b runs over B's destinations x_b (each flight of
     B starts once at its hub h_B and once at x_b), and a over A's destinations y_a. G_A(x) is the expected time a
     random flight (of operator A, weighted by A's share) spends within R of x: half A's airborne-time density
     integrated over the R-disc about x. The hub part needs one G per operator pair; the delivery part one per
     destination of B. Both are finite sums over a destination list, so the result is deterministic.
The zone label (terminal or en-route) follows 11s: the mean of the two drones' hub radii at the chord's midpoint.
G_A(x) is evaluated by sorting A's destinations by bearing from h_A and visiting only those within asin(R / r) of
x's bearing (r = |x - h_A|; every destination when r <= R), so the cost is about (number of start points) x (number of
A's legs that pass within R) instead of n_A x n_B.

A further split of the delivery part: where B's delivery point coincides with one of A's destinations (both
operators serve the same pickup point of the 2014 list), A's legs ending there contribute a half-chord R / v_A each, a
term linear in R; everything else grows as pi R^2 (the smooth part of the density). This is a property of a shared
discrete destination list (two operators delivering to the same building), reported separately.

Model and layouts: 11g's 24 random layouts (random_layouts.py), semi base rule, R = 50 m, Lambda = 240 flights/h. 11s's
estimator (steiner_bias.estimate) re-run with its seeds (110000 + layout, 400,000 ordered pairs at R = 50 m) in 10
batches of 40,000 to give the sampled start term, cf and the exact estimator a batch standard error.

Experiments.
 E1 Agreement: the analytic cross-operator start term (en-route) against 11s's sampled one, per layout (z on the
    batch SE) and pooled.
 E2 Decomposition: hub-launch against delivery-turnaround start terms; the coincident-point share of the delivery
    part.
 E3 Correction: cf + analytic start (cf+) against the exact estimator, en-route totals per layout; the batch sd of cf+
    against that of 11s's cf* (sampled start), each as a ratio to the batch's exact total.
 E4 Scaling in R: the analytic start term at R = 25, 50 and 100 m, pooled ratios to R = 50 m.
 E5 Splits: cf+'s best two-layer split against cf*'s (sampled), both scored on the exact weights.
 E6 Cost: CPU seconds for the analytic start term per layout.

Predictions (written and committed before the experiment ran; before committing, only the unit tests in
tests/test_start_term.py had run, on synthetic operators; no layout was evaluated):
 (1) E1: pooled analytic/sampled en-route cross start within 1%, and per layout |z| <= 3 in >= 23 of 24 (prior 80%).
 (2) E2: delivery turnarounds carry >= 60% of the pooled cross start term (both zones) (prior 55%), and the
     coincident-point part is < 10% of the delivery part (prior 60%).
 (3) E3: cf+ within 2% of the exact en-route total in >= 22 of 24 layouts (prior 85%).
 (4) E3: the median over layouts of sd(cf+/exact) / sd(cf*/exact) over batches lies in [0.85, 1.0]: removing the
     start term's sampling noise helps a little, because cf's flux noise dominates (prior 50%).
 (5) E4: pooled start(100 m)/start(50 m) in [3.4, 4.2] and start(25 m)/start(50 m) in [0.22, 0.28] (pi R^2 law
     with a small linear part) (prior 65%).
 (6) E5: cf+'s best split equals cf*'s in >= 23 of 24 layouts (prior 80%).
Preliminary.

    python3 start_term_run.py > start_term_results.txt
"""
import bisect
import importlib.util
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


sb = _load("hub_airspace_steiner_bias_11t", "steiner_bias.py")
gp, et = sb.gp, sb.et
R_TERM = gp.R_TERM
TWO_PI = 2.0 * math.pi


class Operator:
    """One operator's legs: destinations sorted by bearing from its hub, with weights, lengths and speed."""

    def __init__(self, hub, speed, dests):
        """dests: list of (weight, x, y)."""
        self.hub, self.v = hub, speed
        rows = []
        for w, x, y in dests:
            dx, dy = x - hub[0], y - hub[1]
            d = math.hypot(dx, dy)
            if d > 0:
                rows.append((math.atan2(dy, dx) % TWO_PI, d, w, dx / d, dy / d, (x, y)))
        rows.sort()
        self.th = [r[0] for r in rows]
        self.rows = rows
        self.dmax = max((r[1] for r in rows), default=0.0)
        self.W = sum(r[2] for r in rows)
        self.pts = {}
        for r in rows:
            self.pts.setdefault(r[5], []).append(r)

    def _window(self, x, R):
        rx, ry = x[0] - self.hub[0], x[1] - self.hub[1]
        r = math.hypot(rx, ry)
        if r > self.dmax + R:
            return r, None
        if r <= R:
            return r, self.rows
        phi = math.atan2(ry, rx) % TWO_PI
        half = math.asin(R / r)
        lo, hi = phi - half, phi + half
        n = len(self.th)
        out = []
        if lo < 0:
            out += self.rows[bisect.bisect_left(self.th, lo + TWO_PI):]
            lo = 0.0
        if hi > TWO_PI:
            out += self.rows[:bisect.bisect_right(self.th, hi - TWO_PI)]
            hi = TWO_PI
        out += self.rows[bisect.bisect_left(self.th, lo):bisect.bisect_right(self.th, hi)]
        return r, out

    def G(self, x, R, rb, coincident=False):
        """Expected seconds a random flight of this operator (weighted) spends within R of x, split by zone.

        rb: the starting drone's hub radius at x (0 at its hub). Returns (terminal, en-route, coincident part).
        """
        r, rows = self._window(x, R)
        if rows is None:
            return 0.0, 0.0, 0.0
        rx, ry = x[0] - self.hub[0], x[1] - self.hub[1]
        R2 = R * R
        term = enr = co = 0.0
        for _, d, w, ux, uy, y in rows:
            s = rx * ux + ry * uy                 # along-leg coordinate of x
            p2 = r * r - s * s                    # squared perpendicular distance
            if p2 >= R2:
                continue
            c = math.sqrt(R2 - p2)
            lo, hi = max(s - c, 0.0), min(s + c, d)
            if hi <= lo:
                continue
            L = (hi - lo) / self.v * w
            if 0.5 * (0.5 * (lo + hi) + rb) < R_TERM:
                term += L
            else:
                enr += L
            if coincident and y == x:
                co += L
        return term, enr, co


def operators(mix, speeds):
    by = {}
    for w, j, hx, hy, x, y in mix:
        by.setdefault(j, ((hx, hy), []))[1].append((w, x, y))
    return {j: Operator(h, speeds[j], d) for j, (h, d) in by.items()}


def start_terms(mix, speeds, lam_h, R=50.0):
    """Analytic cross-operator start term, conflicts per hour, in steiner_bias.estimate's 'start' units.

    Returns dict with 'start' {(i, j, zone): x}, and pooled parts 'hub', 'deliv', 'coinc' (both zones, per hour).
    """
    lam = lam_h / 3600.0
    sc = lam * lam * 3600.0
    ops = operators(mix, speeds)
    start = {}
    parts = {"hub": 0.0, "deliv": 0.0, "coinc": 0.0}

    def add(k, x):
        if x:
            start[k] = start.get(k, 0.0) + x
    for B, ob in ops.items():
        for A, oa in ops.items():
            if A == B:
                continue
            key = gp.key(A, B)
            t, e, _ = oa.G(ob.hub, R, 0.0)
            add(key + ("term",), sc * ob.W * t)
            add(key + ("enr",), sc * ob.W * e)
            parts["hub"] += sc * ob.W * (t + e)
            for _, d, w, _, _, y in ob.rows:
                t, e, co = oa.G(y, R, d, coincident=True)
                add(key + ("term",), sc * w * t)
                add(key + ("enr",), sc * w * e)
                parts["deliv"] += sc * w * (t + e)
                parts["coinc"] += sc * w * co
    return {"start": start, **parts}
