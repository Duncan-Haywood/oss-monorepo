"""Milestone 11af: charge altitude-layer groups for the climbs and descents through them, so the number of groups
(and their stacking order) is chosen rather than assumed.

Why. 11ad and 11ae's "Next", and the limit both stated: their score counted only en-route conflicts inside a group,
so more groups could only help (four groups keep 8% of the conflict weight, eight keep 2 to 3%), an upper bound on
what layers buy. A real stack is not free: a drone launched at its hub climbs through every band below its own and
descends through them again at the delivery point, and Doole, Ellerbroek and Hoekstra ("Drone delivery: nature of traffic conflicts in constrained urban
airspace environments", DICUAM 2021; title checked 2026-11-23, full text not opened) report that in
their layered Manhattan simulations conflicts were largely caused by flights climbing or descending to their layers.
This step adds that cost to the same model, exactly, and asks how many groups a planner should then use, whether the
en-route-optimal partitions of 11ad survive, and how much the stacking order matters.

Model (unchanged from 11ac/11ad where not stated). Each group g occupies a pair of altitude bands at stack position
pos_g (0 = lowest); inside the pair the semicircular rule puts a leg in the lower band when its east bit is 1. Legs
are straight between hub and destination at cruise altitude; the climb and descent are vertical, at the hub and at
the delivery point. A flight's two legs trace the same segment in the two bands of its group, so each band of a
group holds every one of the group's segments exactly once. A vertical transit at ground point x that crosses a band
dwells in that band's conflict layer for tau seconds (tau = 2 x half-thickness / vertical speed); a cruiser on a
segment s of that band is within R of x for chord(x, s) / v seconds. With independent Poisson launches the expected
number of (transit, cruiser) pairs whose intervals overlap is, per unit time,

    rate_transit x rate_segment x (tau + chord(x, s) / v_s)                                         (exact)

Summing over operator j's segments (rate lam w_s, w as the destination mix) and over operator i's transits gives

    c_ij = 3600 lam^2 [ s_i (tau N_j(h_i) + K_j(h_i)) + sum_{d in i} w_d (tau N_j(d) + K_j(d)) ]   conflicts / h

with N_j(x) = sum_s w_s [s passes within R of x] and K_j(x) = sum_s w_s chord(x, s) / v_j: one transit per flight
at each end, each crossing every segment of j once. Per flight there are two transits at each end (climb and
descent), so if j's group is below i's, i's transits cross both of j's bands: 4 c_ij. If they share a group, one
transit per end (the one to or from the upper band) crosses the lower band: c_ij. The total for labels pos is

    T(pos) = sum_ij (W_ij + c_ij) [pos_i == pos_j] + sum_ij 4 c_ij [pos_j < pos_i]

where W = cf_D+'s en-route pair weights (11ad's score). c_ii (own transits through own traffic, mostly at the own
hub) is in every partition and is reported but does not change any choice. Groups may be empty, so the best T with
at most k positions is non-increasing in k; "groups used" is the number of non-empty positions in the best labelling
with at most 8. Transits do not conflict with transits; no climb or descent conflict is counted twice for a leg that
both starts and ends near x (the chord is of the whole segment).

Parameters. tau: Doole et al. (Aerospace 8(2):38, 2021) space their layers 25 ft (7.6 m) apart (as reported in the abstracts found by search;
the full texts could not be opened from this session) and a DJI Matrice 300 RTK's maximum ascent speed is 5 m/s
in P mode, 6 m/s in S mode (DJI specification page). One layer spacing at 5 m/s gives tau = 7.62 / 5 = 1.52 s; a
conflict layer two spacings thick (a climber within one spacing of the band level) gives 3.05 s, the headline value.
No source gives the conflict layer of a delivery stack, so tau is swept over 0, 1, 3.05, 6 and 12 s (0 keeps only
the cruiser's own passage time). R = 50 m, Lambda = 240 flights/h, as before.

Layouts: 11ac/11ad's 48 (indices 1200..1223 with 12 operators, 1600..1623 with 16). Searches: single-move descent
over stack positions with 200 random restarts (local_search_T); exhaustive at M = 12 for k = 2 and 3 to check it.
Baseline "en-route plan": 11ad's procedure (the best k-way partition of W alone, exhaustive at k = 2 and at M = 12
for k <= 4, else 200 restarts) given its best and its worst stacking order under T.

Predictions (written and committed before any layout was evaluated with this kernel; only the synthetic unit tests
in tests/test_vertical_transit.py had run). All at tau = 3.05 s unless stated; "median" is over the 24 layouts of a
size and each prediction must hold at both M = 12 and M = 16.
 P1 Scale: the cross-operator transit weight sum_{i != j} c_ij is between 0.2% and 5% of the total en-route weight
    sum W (median).
 P2 Layers still pay: the best total with at most 8 groups is at most 0.30 of the all-in-one-group total T(k = 1)
    (median) [11ad without transits: 0.03].
 P3 But not without limit: the median number of groups used (best with at most 8) is between 3 and 6.
 P4 The en-route plan is close but not right: at k = 4, 11ad's partition with its best order has a median total
    within 1% to 10% above the joint optimum of T at k = 4 (so between 1.01 and 1.10).
 P5 Order matters: at k = 4, the worst order of 11ad's partition costs at least 5% more than its best order
    (median ratio >= 1.05).
 P6 Where: transits at hubs carry between 30% and 70% of the cross-operator transit weight (median).
 P7 The charge bites harder as tau grows: the median number of groups used is non-increasing over tau = 0, 1, 3.05,
    6, 12, and at tau = 12 s it is at most 4.
 P8 The search is adequate: at M = 12, local_search_T reaches the exhaustive optimum for k = 2 and 3 in 24 of 24
    layouts at every tau.
 Reported without a prediction: the best total and groups used by tau; c_ii; the share of T that is transit at the
 optimum; how often the joint optimum's grouping equals 11ad's.
Preliminary.
"""
import itertools
import math

import numpy as np

WEDGE_EPS = 1e-9
CHUNK = 2_000_000          # candidate (query, segment) pairs per block


class Seg:
    """One operator's segments: hub, sorted by direction; w = destination mix weight (share / n), v = speed."""

    def __init__(self, hub, speed, rows):
        self.hub = (float(hub[0]), float(hub[1]))
        a = np.array(rows, dtype=float).reshape(-1, 3)            # (w, dx, dy)
        ang = np.arctan2(a[:, 2], a[:, 1])
        o = np.argsort(ang, kind="stable")
        self.w, self.dx, self.dy, self.ang = a[o, 0], a[o, 1], a[o, 2], ang[o]
        self.L = np.hypot(self.dx, self.dy)
        self.ux, self.uy = self.dx / self.L, self.dy / self.L
        self.v = float(speed)
        n = len(self.ang)
        self.ang3 = np.concatenate([self.ang - 2 * math.pi, self.ang, self.ang + 2 * math.pi])
        self.n = n


def operators(mix, speeds):
    """mix rows (w, j, hx, hy, x, y) as random_layouts.mix_radii -> {j: Seg}."""
    by = {}
    for w, j, hx, hy, x, y in mix:
        by.setdefault(j, ((hx, hy), []))[1].append((w, x - hx, y - hy))
    return {j: Seg(h, speeds[j], rows) for j, (h, rows) in by.items()}


def _chord(S, px, py, idx, R):
    s = px * S.ux[idx] + py * S.uy[idx]
    p = np.abs(px * S.uy[idx] - py * S.ux[idx])
    half = np.sqrt(np.maximum(R * R - p * p, 0.0))
    a = np.maximum(0.0, s - half)
    b = np.minimum(S.L[idx], s + half)
    ch = np.where(p < R, np.maximum(0.0, b - a), 0.0)
    return ch


def point_sums(S, qx, qy, R=50.0, chunk=CHUNK):
    """For each query point: N = sum_s w_s [segment s passes within R], K = sum_s w_s chord / v (exact; segments
    pruned by the wedge they must lie in seen from the hub). Returns (N, K) arrays."""
    qx = np.asarray(qx, dtype=float)
    qy = np.asarray(qy, dtype=float)
    q = len(qx)
    N = np.zeros(q)
    K = np.zeros(q)
    px, py = qx - S.hub[0], qy - S.hub[1]
    rho = np.hypot(px, py)
    near = np.nonzero(rho <= R)[0]
    for t in near:                                   # the disc contains the hub: test every segment
        ch = _chord(S, px[t], py[t], np.arange(S.n), R)
        N[t] = float((S.w * (ch > 0)).sum())
        K[t] = float((S.w * ch).sum()) / S.v
    far = np.nonzero(rho > R)[0]
    if len(far) == 0:
        return N, K
    phi = np.arctan2(py[far], px[far])
    al = np.arcsin(np.minimum(1.0, R / rho[far])) + WEDGE_EPS
    lo = np.searchsorted(S.ang3, phi - al, side="left")
    hi = np.searchsorted(S.ang3, phi + al, side="right")
    cnt = hi - lo
    start = 0
    while start < len(far):
        cs = np.cumsum(cnt[start:])
        stop = start + max(1, int(np.searchsorted(cs, chunk, side="right")))
        sel = np.arange(start, stop)
        c = cnt[sel]
        tot = int(c.sum())
        if tot:
            qid = np.repeat(sel, c)
            off = np.arange(tot) - np.repeat(np.cumsum(c) - c, c)
            idx = (np.repeat(lo[sel], c) + off) % S.n
            ch = _chord(S, px[far[qid]], py[far[qid]], idx, R)
            w = S.w[idx]
            N[far] += np.bincount(qid, w * (ch > 0), minlength=len(far))
            K[far] += np.bincount(qid, w * ch, minlength=len(far)) / S.v
        start = stop
    return N, K


def point_sums_brute(S, qx, qy, R=50.0):
    """Reference for the tests: every (query, segment) pair."""
    N, K = [], []
    for x, y in zip(qx, qy):
        ch = _chord(S, x - S.hub[0], y - S.hub[1], np.arange(S.n), R)
        N.append(float((S.w * (ch > 0)).sum()))
        K.append(float((S.w * ch).sum()) / S.v)
    return np.array(N), np.array(K)


def transit_terms(mix, speeds, shares, lam_h, R=50.0):
    """Per ordered operator pair (i, j): c = 3600 lam^2 (tau cN + cK), split by where i's transit is (hub or
    destination). Returns dict with (m, m) arrays HN, HK, DN, DK (H = at i's hub, D = at i's destinations)."""
    lam = lam_h / 3600.0
    sc = 3600.0 * lam * lam
    ops = operators(mix, speeds)
    m = len(speeds)
    pts = {}
    dw = [dict() for _ in range(m)]
    for w, j, hx, hy, x, y in mix:
        k = (x, y)
        if k not in pts:
            pts[k] = len(pts)
        dw[j][pts[k]] = dw[j].get(pts[k], 0.0) + w
    P = np.array(list(pts.keys()), dtype=float)
    hubs = np.array([ops[i].hub for i in range(m)], dtype=float)
    Wd = np.zeros((m, len(P)))
    for i in range(m):
        for t, w in dw[i].items():
            Wd[i, t] = w
    out = {k: np.zeros((m, m)) for k in ("HN", "HK", "DN", "DK")}
    for j in range(m):
        Nh, Kh = point_sums(ops[j], hubs[:, 0], hubs[:, 1], R)
        Nd, Kd = point_sums(ops[j], P[:, 0], P[:, 1], R)
        out["HN"][:, j] = sc * np.asarray(shares) * Nh
        out["HK"][:, j] = sc * np.asarray(shares) * Kh
        out["DN"][:, j] = sc * Wd @ Nd
        out["DK"][:, j] = sc * Wd @ Kd
    return out


def c_matrix(terms, tau, where="all"):
    """c_ij at dwell tau (s); where = 'all', 'hub' or 'dest'."""
    h = tau * terms["HN"] + terms["HK"]
    d = tau * terms["DN"] + terms["DK"]
    return {"all": h + d, "hub": h, "dest": d}[where]


def total(W, c, pos):
    """T(pos) = sum (W + c)[same] + 4 c [pos_j < pos_i]; W, c (m, m); pos may be (m,) or (n, m)."""
    P = np.atleast_2d(np.asarray(pos))
    same = (P[:, :, None] == P[:, None, :])
    below = (P[:, None, :] < P[:, :, None])           # [i, j]: pos_j < pos_i
    t = (same * (W + c)).sum(axis=(1, 2)) + 4.0 * (below * c).sum(axis=(1, 2))
    return t if np.ndim(pos) == 2 else float(t[0])


def transit_part(c, pos):
    """The transit share of T(pos): sum c [same] + 4 c [below]."""
    return total(np.zeros_like(c), c, pos)


def exhaustive_T(W, c, k, chunk=200_000):
    """Best stack labelling with at most k positions, by enumeration of all k^m labellings (ties: first)."""
    m = W.shape[0]
    Q = (W + c).reshape(m * m)
    A = (4.0 * c).reshape(m * m)
    best, arg = np.inf, None
    it = itertools.product(range(k), repeat=m)
    while True:
        rows = list(itertools.islice(it, chunk))
        if not rows:
            break
        L = np.array(rows, dtype=np.int8)
        same = (L[:, :, None] == L[:, None, :]).reshape(len(L), m * m)
        below = (L[:, None, :] < L[:, :, None]).reshape(len(L), m * m)
        s = same @ Q + below @ A
        i = int(s.argmin())
        if s[i] < best - 1e-12 * abs(s[i]):
            best, arg = float(s[i]), tuple(int(x) for x in L[i])
    return arg, best


def descend_T(W, c, pos, k):
    """Single-move descent on T over positions 0..k-1."""
    Q = W + c
    Qs = Q + Q.T
    A = 4.0 * c
    p = np.array(pos, dtype=int)
    m = len(p)
    while True:
        bestd, bi, bh = 0.0, None, None
        for i in range(m):
            mask = np.ones(m, bool)
            mask[i] = False
            O = np.zeros((m, k))
            O[np.arange(m)[mask], p[mask]] = 1.0
            same = Qs[i] @ O                                    # (k,)
            mi = A[i] @ O                                       # i above j: A_ij for pos_j < h
            mj = A[:, i] @ O                                    # j above i: A_ji for pos_j > h
            below = np.concatenate([[0.0], np.cumsum(mi)[:-1]])
            above = mj.sum() - np.cumsum(mj)
            f = same + below + above
            d = f - f[p[i]]
            h = int(d.argmin())
            if d[h] < bestd - 1e-12 * max(1.0, abs(f[p[i]])):
                bestd, bi, bh = d[h], i, h
        if bi is None:
            return tuple(int(x) for x in p)
        p[bi] = bh


def local_search_T(W, c, k, restarts=200, seed=0):
    """Best of `restarts` descents from uniformly random stack labellings. Returns (pos, T)."""
    rng = np.random.default_rng(seed)
    best, arg = np.inf, None
    for _ in range(restarts):
        pos = descend_T(W, c, rng.integers(0, k, W.shape[0]), k)
        t = total(W, c, pos)
        if t < best - 1e-12 * abs(t) or (abs(t - best) <= 1e-12 * abs(t) and pos < arg):
            best, arg = t, pos
    return arg, best


def orders(labels, W, c):
    """A partition (group labels) stacked in every order: returns (best pos, best T, worst T)."""
    groups = sorted(set(labels))
    perms = np.array(list(itertools.permutations(range(len(groups)))), dtype=np.int8)
    g = np.array([groups.index(x) for x in labels])
    P = perms[:, g]                                     # (n_perm, m) stack positions
    T = np.concatenate([total(W, c, P[i:i + 5000]) for i in range(0, len(P), 5000)])
    i = int(T.argmin())
    return tuple(int(x) for x in P[i]), float(T[i]), float(T.max())


def used(pos):
    return len(set(pos))


def same_grouping(a, b):
    """True when two labellings put the same operators together (positions ignored)."""
    m = len(a)
    return all((a[i] == a[j]) == (b[i] == b[j]) for i in range(m) for j in range(i + 1, m))
