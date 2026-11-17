"""Milestone 11af: charge altitude bands for the climbs and descents through them, so the number of layer groups is
chosen rather than assumed (12 and 16 operators).

Why. 11ad's and 11ae's "Next". 11ad found the best four-group partition leaves under a tenth of the en-route conflict
weight and eight groups leave little more than the operators' self-conflicts, but its score charged nothing for a
band: an aircraft cruising in the k-th band climbs through the k - 1 bands below it at its hub and descends through
them at its destination (and back), and every one of those transits can meet traffic cruising there. 11ad called its
numbers an upper bound on what extra layers buy. This step prices the transits from the same destination lists and
asks how many bands the optimum then uses, how much band order matters, and whether planning on en-route weight
alone and ordering afterwards still lands near the optimum.

Model. As 11ac/11ad (straight legs hub -> destination -> hub, Poisson launches at Lambda = 240 flights/h for the city,
60 s hover off-layer at the destination, no avoidance or wind, R = 50 m, semicircular rule inside a band). New: the
groups are stacked as bands at positions 0 (lowest) .. k - 1, each band two layers (eastbound and westbound) of
thickness h; aircraft climb and descend vertically at w, so a transit spends tau = h / w in each layer it crosses. A
flight of operator i whose band sits at position p makes four transits through each band below p: climb at its hub,
descent and climb at its destination, descent at its hub. During a transit through band c at point x it is in
conflict with every cruising leg of band c that comes within R of x while it is there. For one family of legs with
Poisson start times (rate lam per leg) the expected number is lam * (tau + l(x) / v), l(x) the length of the leg
inside the disc of radius R about x (the leg is within R for l / v seconds; the windows overlap with that
probability). Summed over both layers of the band (each transit is tau in each), per transit through operator j's
traffic:

  c_j(x) = 2 * Lambda s_j / 3600 * E_{y ~ dest_j} [ 1{dist(x, [hub_j, y]) < R} * tau + l_y(x) / v_j ]   (per s window)
  (the 2 counts the outbound and the return leg, which fly the same segment in opposite layers of the band)

  V_ij = Lambda s_i * 2 * ( c_j(hub_i) + E_{y ~ dest_i} c_j(y) )                      conflicts per hour

and a labelling of operators to band positions costs

  F(labels) = sum_{i, j} W_ij [l_i == l_j]  +  sum_{i != j} V_ij [l_j < l_i]          (W = cf_D+ "enr", as 11ad)

V_ij = tau * A_ij + B_ij is affine in tau; B (the time a leg spends inside the disc) does not depend on tau. Transits
through a band of one's own group cost nothing; transits by one transiting aircraft past another are not counted. The
same 48 layouts as 11ac/11ad (indices 1200..1223, M = 12; 1600..1623, M = 16), W recomputed by
split_scale_run.run_layout unchanged; A and B from the same destination lists (transit_terms below).

Consequence of the form, stated before the run: a pair in different bands pays V_ij or V_ji whichever is above, no
matter how many bands lie between, so the transit charge is a cut cost on pairs (with a direction), not a per-band
cost. Adding a band can only help when it separates a pair whose en-route weight S_ij = W_ij + W_ji exceeds the
transit weight of the order chosen. If V is small against S for most pairs, the optimum keeps using as many bands as
it is allowed; the transit charge then limits the gain, not the count.

tau per layer is swept, not sourced: 2, 5, 10 and 20 s (e.g. 10 m layers at 5 m/s to 40 m layers at 2 m/s). No
standard fixes small-drone layer thickness or climb rate in a layered urban scheme.

Search. Labels are band positions, so order and grouping are found together. kmax bands: k = 1, 2, 3, 4, 8 (as 11ad)
and free (kmax = M). Best of 200 random-restart single-move descents (descend_bands), with exhaustive enumeration of
3^12 ordered labellings at M = 12 for k = 3 as the check. The en-route-only planner: 11ad's best k-way partition of W
(split_kway.local_search), then the best order of its groups under V (all k! orders). gas_d: the same search on
gas_d's paper weight in place of W, V unchanged (V needs only the destination lists, as gas_d does).

Checks and predictions (written and committed before any layout's transit terms were computed or any layout scored;
only the unit tests, on synthetic operators, had run):
 P1 Monte Carlo (transit_mc: 11e's leg generator, 100,000 flights, layout 1200, tau = 5 s): the pooled V of all
    cross pairs is within 5% of the closed form's, and per-pair r >= 0.95.
 P2 Size: the median over layouts of sum_{i != j} V_ij / sum_{i != j} W_ij (all cross pairs counted in one
    direction, V and W both conflicts per hour) is between 0.03 and 0.30 at tau = 5 s, at both M.
 P3 Bands still pay at tau = 5 s: the best 8-band F is below the best 4-band F in at least 40 of 48 layouts.
 P4 The count is chosen at the top end: with kmax = M, the median number of non-empty bands at tau = 5 s is >= 8
    at both M, and is no larger at tau = 20 s than at tau = 2 s in every layout.
 P5 What bands buy shrinks: the median ratio best F(k = 4) / best F(k = 1) at tau = 5 s is at least 1.2 times
    11ad's retained_4 (0.076 and 0.087), and the ratio grows with tau.
 P6 Order matters: for the F-optimal 4-band partition at tau = 5 s, the worst of its 24 band orders has a median
    transit cost at least 1.3 times the best order's.
 P7 Planning on en-route weight and ordering afterwards loses little: mean F(en-route plan, best order) / F(best) at
    k = 4, tau = 5 s is <= 1.03 at both M.
 P8 gas_d with V: mean loss on F at k = 4, tau = 5 s is <= 1.02 at both M.
 P9 The descent is adequate: at M = 12, k = 3, it reaches the exhaustive optimum of F in 24 of 24 layouts at
    tau = 5 s.
 Reported without a prediction: F_k / F_1 for each k and tau; hub against destination shares of the transit cost;
 the fraction of cross pairs with min(V_ij, V_ji) > S_ij; band orders by operator volume.
Preliminary.
"""
import itertools
import math

import numpy as np

TAUS = (2.0, 5.0, 10.0, 20.0)


# ---------------------------------------------------------------- transit terms

def _chord(px, py, hx, hy, yx, yy, R):
    """Length of segment [h, y] inside the disc of radius R about p (vectorised over y and/or p)."""
    dx, dy = yx - hx, yy - hy
    L2 = dx * dx + dy * dy
    L = np.sqrt(L2)
    ux, uy = dx / L, dy / L
    rx, ry = px - hx, py - hy
    s = rx * ux + ry * uy                     # projection of p on the line, from h
    b2 = rx * rx + ry * ry - s * s            # squared distance of p from the line
    half = np.sqrt(np.clip(R * R - b2, 0.0, None))
    lo = np.clip(s - half, 0.0, L)
    hi = np.clip(s + half, 0.0, L)
    return np.where(b2 < R * R, hi - lo, 0.0)


def _segdist2(px, py, hx, hy, yx, yy):
    dx, dy = yx - hx, yy - hy
    L2 = dx * dx + dy * dy
    t = np.clip(((px - hx) * dx + (py - hy) * dy) / L2, 0.0, 1.0)
    qx, qy = hx + t * dx - px, hy + t * dy - py
    return qx * qx + qy * qy


class Family:
    """One operator's legs: hub, speed and destinations (uniform), sorted by direction for the wedge prefilter."""

    def __init__(self, hub, speed, dests):
        self.hx, self.hy = hub
        self.v = speed
        d = np.asarray(dests, dtype=float)
        ang = np.arctan2(d[:, 1] - self.hy, d[:, 0] - self.hx)
        o = np.argsort(ang)
        self.ang = ang[o]
        self.x, self.y = d[o, 0], d[o, 1]
        self.n = len(d)

    def at(self, px, py, R):
        """(a, b) at point p: a = fraction of legs passing within R of p, b = mean seconds a leg spends within R."""
        rx, ry = px - self.hx, py - self.hy
        dist = math.hypot(rx, ry)
        if dist <= R:
            idx = np.arange(self.n)
        else:
            th = math.atan2(ry, rx)
            al = math.asin(R / dist) + 1e-9
            lo, hi = th - al, th + al
            parts = []
            for a, b in ((lo, hi), (lo + 2 * math.pi, hi + 2 * math.pi), (lo - 2 * math.pi, hi - 2 * math.pi)):
                i0, i1 = np.searchsorted(self.ang, [a, b])
                if i1 > i0:
                    parts.append(np.arange(i0, i1))
            if not parts:
                return 0.0, 0.0
            idx = np.unique(np.concatenate(parts))
        X, Y = self.x[idx], self.y[idx]
        hit = _segdist2(px, py, self.hx, self.hy, X, Y) < R * R
        ch = _chord(px, py, self.hx, self.hy, X, Y, R)
        return float(hit.sum()) / self.n, float(ch.sum()) / self.n / self.v


def families(mix, speeds):
    """mix rows (weight, op, hx, hy, x, y) -> {op: Family}, shares {op: s}."""
    by, sh, hub = {}, {}, {}
    for w, j, hx, hy, x, y in mix:
        by.setdefault(j, []).append((x, y))
        sh[j] = sh.get(j, 0.0) + w
        hub[j] = (hx, hy)
    return {j: Family(hub[j], speeds[j], by[j]) for j in by}, sh


def transit_terms(mix, speeds, lam_h, R=50.0):
    """A, B (m x m, conflicts per hour, V = tau * A + B) and their hub / destination parts {"A_hub", ...}.
    A[i, j], B[i, j]: transits of operator i's flights through operator j's cruising traffic; diagonal zero."""
    fam, sh = families(mix, speeds)
    ops = sorted(fam)
    m = len(ops)
    out = {k: np.zeros((m, m)) for k in ("A_hub", "B_hub", "A_dst", "B_dst")}
    cache = {}
    for jj, j in enumerate(ops):
        Fj = fam[j]
        rate_j = 2.0 * lam_h * sh[j] / 3600.0          # legs per s (outbound + return) of operator j
        for ii, i in enumerate(ops):
            if i == j:
                continue
            Fi = fam[i]
            a_h, b_h = Fj.at(Fi.hx, Fi.hy, R)
            sa = sb = 0.0
            for px, py in zip(Fi.x, Fi.y):
                key = (j, px, py)
                if key not in cache:
                    cache[key] = Fj.at(px, py, R)
                a, b = cache[key]
                sa += a
                sb += b
            f = lam_h * sh[i] * 2.0 * rate_j               # flights/h of i, two transits per end, j's leg rate
            out["A_hub"][ii, jj] = f * a_h
            out["B_hub"][ii, jj] = f * b_h
            out["A_dst"][ii, jj] = f * sa / Fi.n
            out["B_dst"][ii, jj] = f * sb / Fi.n
    out["A"] = out["A_hub"] + out["A_dst"]
    out["B"] = out["B_hub"] + out["B_dst"]
    return out


def V_of(T, tau):
    return tau * T["A"] + T["B"]


# ---------------------------------------------------------------- Monte Carlo check

def transit_mc(mix, speeds, lam_h, tau, R=50.0, n_flights=100000, seed=11, hover=60.0):
    """Simulated V: 11e's leg generator (graph_partition.simulate_pairs' launch process). Every transit window of
    operator i (4 per flight; tau in the band's eastbound layer, then tau in its westbound layer) counts the legs of
    each other operator j flying in that layer that come within R of the transit point while it is there. Returns (m x m counts per hour)."""
    import random
    fam, sh = families(mix, speeds)
    ops = sorted(fam)
    pos = {j: k for k, j in enumerate(ops)}
    rnd = random.Random(seed)
    cum, rows = [], []
    acc = 0.0
    for row in mix:
        acc += row[0]
        cum.append(acc)
        rows.append(row)
    lam = lam_h / 3600.0
    dmax = max(math.hypot(r[4] - r[2], r[5] - r[3]) for r in mix)
    warm = 2 * dmax / min(speeds) + hover + 60
    lo, hi = warm, warm + n_flights / lam
    t = 0.0
    legs, events = [], []
    import bisect
    while t < hi + warm:
        t += rnd.expovariate(lam)
        _, j, hx, hy, x, y = rows[min(bisect.bisect_left(cum, rnd.random() * acc), len(rows) - 1)]
        v = speeds[j]
        d = math.hypot(x - hx, y - hy)
        ux, uy = (x - hx) / d * v, (y - hy) / d * v
        dur = d / v
        ti = t + dur + hover
        legs.append((t, t + dur, hx, hy, ux, uy, pos[j]))
        legs.append((ti, ti + dur, x, y, -ux, -uy, pos[j]))
        if lo <= t < hi:
            for te, ex, ey in ((t, hx, hy), (t + dur, x, y), (ti, x, y), (ti + dur, hx, hy)):
                events.append((te, ex, ey, pos[j]))
    L = np.array([l[:6] for l in legs])
    op = np.array([l[6] for l in legs])
    o = np.argsort(L[:, 0])
    L, op = L[o], op[o]
    dmaxt = float((L[:, 1] - L[:, 0]).max())
    m = len(ops)
    cnt = np.zeros((m, m))
    R2 = R * R
    east = (L[:, 4] > 0) | ((L[:, 4] == 0) & (L[:, 5] > 0))   # semicircular rule: the band's two layers
    for te, ex, ey, i in events:
        for lay, lay_t0 in ((True, te), (False, te + tau)):      # one layer, then the other, tau each
            w0, w1 = lay_t0, lay_t0 + tau
            a = np.searchsorted(L[:, 0], w0 - dmaxt)
            b = np.searchsorted(L[:, 0], w1)
            S = L[a:b]
            ok = (S[:, 1] > w0) & (op[a:b] != i) & (east[a:b] == lay)
            if not ok.any():
                continue
            S, oj = S[ok], op[a:b][ok]
            t0 = np.maximum(S[:, 0], w0)
            t1 = np.minimum(S[:, 1], w1)
            px = S[:, 2] + S[:, 4] * (t0 - S[:, 0]) - ex
            py = S[:, 3] + S[:, 5] * (t0 - S[:, 0]) - ey
            vv = S[:, 4] ** 2 + S[:, 5] ** 2
            s = np.clip(-(px * S[:, 4] + py * S[:, 5]) / vv, 0.0, t1 - t0)
            qx, qy = px + S[:, 4] * s, py + S[:, 5] * s
            hit = qx * qx + qy * qy < R2
            np.add.at(cnt[i], oj[hit], 1.0)
    return cnt / ((hi - lo) / 3600.0)


# ---------------------------------------------------------------- band labellings

def score(W, V, labels):
    """F = sum W_ij [l_i == l_j] + sum V_ij [l_j < l_i] (W, V may be (m, m) or stacks (r, m, m))."""
    lab = np.asarray(labels)
    same = (lab[:, None] == lab[None, :]).astype(float)
    below = (lab[None, :] < lab[:, None]).astype(float)      # [i, j]: j below i
    return np.tensordot(W, same, axes=([-2, -1], [0, 1])) + np.tensordot(V, below, axes=([-2, -1], [0, 1]))


def parts(W, V, labels):
    lab = np.asarray(labels)
    same = (lab[:, None] == lab[None, :]).astype(float)
    below = (lab[None, :] < lab[:, None]).astype(float)
    return float((W * same).sum()), float((V * below).sum())


def compact(labels):
    """Drop empty bands, keeping the order."""
    u = sorted(set(labels))
    r = {x: k for k, x in enumerate(u)}
    return tuple(r[x] for x in labels)


def descend_bands(W, V, labels, k):
    """Single-move descent over band positions 0..k-1: move the operator whose move lowers F most."""
    S = W + W.T
    lab = np.array(labels, dtype=int)
    m = len(lab)
    ar = np.arange(k)
    while True:
        best = (0.0, None, None)
        for i in range(m):
            others = np.arange(m) != i
            lj = lab[others]
            same = (lj[None, :] == ar[:, None])                   # (k, m-1)
            c = same @ S[i, others] + (lj[None, :] < ar[:, None]) @ V[i, others] + (lj[None, :] > ar[:, None]) @ V[others, i]
            d = c - c[lab[i]]
            h = int(d.argmin())
            if d[h] < best[0] - 1e-12 * max(1.0, abs(c[lab[i]])):
                best = (float(d[h]), i, h)
        if best[1] is None:
            return tuple(int(x) for x in lab)
        lab[best[1]] = best[2]


def search_bands(W, V, k, restarts=200, seed=0):
    """Best of `restarts` descents from random band labellings. Returns (compacted labels, F)."""
    W, V = np.asarray(W, float), np.asarray(V, float)
    m = W.shape[0]
    rng = np.random.default_rng(seed)
    best, arg = np.inf, None
    for _ in range(restarts):
        lab = compact(descend_bands(W, V, rng.integers(0, k, m), k))
        s = float(score(W, V, lab))
        if s < best - 1e-12 * abs(best if np.isfinite(best) else 1.0) or (abs(s - best) <= 1e-12 * abs(s) and lab < arg):
            best, arg = s, lab
    return arg, best


def exhaustive_bands(W, V, k, chunk=65536):
    """Best ordered labelling into k band positions by enumeration of all k^m. Returns (labels, F)."""
    m = W.shape[0]
    wf, vf = np.asarray(W, float).reshape(-1), np.asarray(V, float).reshape(-1)
    best, arg = np.inf, None
    it = itertools.product(range(k), repeat=m)
    while True:
        rows = list(itertools.islice(it, chunk))
        if not rows:
            break
        Lb = np.array(rows, dtype=np.int8)
        same = (Lb[:, :, None] == Lb[:, None, :]).reshape(len(Lb), -1)
        below = (Lb[:, None, :] < Lb[:, :, None]).reshape(len(Lb), -1)
        s = same @ wf + below @ vf
        q = int(s.argmin())
        if s[q] < best - 1e-12 * abs(s[q]):
            best, arg = float(s[q]), compact(tuple(int(x) for x in Lb[q]))
    return arg, best


def best_order(W, V, groups_labels):
    """Best and worst stacking of a fixed partition's groups: (best labels, best F, worst F, per-order transit list)."""
    g = compact(groups_labels)
    k = max(g) + 1
    res = []
    for perm in itertools.permutations(range(k)):
        lab = tuple(perm[x] for x in g)
        res.append((float(score(W, V, lab)), lab))
    res.sort()
    return res[0][1], res[0][0], res[-1][0], res


def volume_order(groups_labels, volume, busiest_low=True):
    """Stack groups by total flight volume (busiest lowest, or highest)."""
    g = compact(groups_labels)
    k = max(g) + 1
    vol = [sum(v for x, v in zip(g, volume) if x == c) for c in range(k)]
    order = sorted(range(k), key=lambda c: -vol[c] if busiest_low else vol[c])
    pos = {c: p for p, c in enumerate(order)}
    return tuple(pos[x] for x in g)
