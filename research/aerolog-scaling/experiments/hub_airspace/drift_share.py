"""Milestone 11al: a sourced per-drone altitude error, and whether nearby drones share it.

Why. 11ai chose the layer spacing from a per-drone altitude error of sd sigma, independent between drones, swept over
0.5 to 3 m, and found 5 bands at 13.3 m for sigma = 1 m, 6 at 10.9 m for 0.5 m and 4 at 17.1 m for 2 to 3 m
(Z = 25 ft). 11ak measured one source of that error from NOAA ISD pressure reports: a barometer zeroed at take-off
drifts 0.8, 1.6 and 3.1 m (sd) after u uniform on a 15, 30 and 60 min flight. Read as an independent per-drone sigma,
that would move a 30 to 60 min mission to 4 bands. But the drift is not independent between drones: two drones in
the same pressure field that zeroed at take-off both read the current pressure, so the current pressure cancels in
their altitude gap. What is left is the pressure change between their two take-off times, plus the pressure
difference between their two take-off points.

Model. Drone i, zeroed on the ground at its hub at time t - u_i (u_i its age in the air), flies at indicated height
y_i = 8.32 m/hPa x (Q_hub_i(t - u_i) - Q(t, x)) above its hub's ground, where Q is the sea-level-reduced pressure
(QNH) and x is where it is now (hub ground elevations are taken as known, so terrain is not an error). Two drones near
each other read the same Q(t, x), so their gap error is
    g_ij = 8.32 [Q_hub_i(t - u_i) - Q_hub_j(t - u_j)] + n_i - n_j,
with n the height-keeping noise of one drone, N(0, sigma_n^2) and independent (swept over 0.5 and 1 m as in 11ai: no
sourced 1-sigma figure was reachable, see 11ai). The pressure part splits into
  * time:  8.32 [Q(t - u_i) - Q(t - u_j)] at one station (JFK main; all five ISD stations as a check), the drift
           over the take-off-time difference |u_i - u_j|, not over each drone's whole age;
  * space: 8.32 [Q_A(t) - Q_B(t)] - its mean, the simultaneous, centred QNH difference between two stations (JFK and
           LGA, 18.5 km, main), scaled by d_ij / 18.5 km for hubs d_ij apart (a smooth field: linear in distance; the
           sqrt(d) scaling a rougher field would give is a sensitivity in the statistics), taken at the same t.
Ages. "deliv": each operator flies out-and-back missions from its hub to a destination drawn from its own service
disc (the layout's demand points within its radius, as random_layouts.mix_radii weights them), out at its cruise
speed and straight back (dwell 0; 5 min as a statistics sensitivity), and an en-route encounter finds it at an age
uniform over its mission. "T30" and "T60": every drone on a mission of 30 or 60 min (inspection, multi-drop),
age uniform on [0, T].

Planner analysis (ref_mix's fast descent, 11aj's h grid, Z = 7.62 m, H = 120 m, 200 descents, the 48 layouts and
11ai's inputs W, X, V rebuilt unchanged). Each operator pair (i, j), the own fleet included (i = j: same hub, d = 0),
gets its own level-overlap table from 4000 Monte Carlo draws of (t, u_i, u_j) over 2014 (drone_ages, gap_samples),
convolved with the Gaussian noise. Planners, all scored under the shared-field truth of their condition:
  * aware: knows every pair's table (PairProblem);
  * none: 11ai at sigma_n (pressure ignored);
  * indep: 11ai at sigma = sqrt(sigma_n^2 + s0^2), s0 the per-drone take-off drift sd of the same ages (11ak's S0
    read as an independent error: the natural way to put 11ak's figure into 11ai).

Predictions (written and pushed before any drift_share statistic was computed and before any layout was scored;
11ai, 11aj and 11ak results were known; no leg time had been computed):
 P1 deliv: the median mission time over operators is between 3 and 10 min, and the sd of the pressure part of the
    gap error (time + space), median over operator pairs and layouts, is at most 0.3 m.
 P2 space alone, at the layouts' hub separations (0.8 to 14 km): sd at most 0.3 m, median over cross pairs.
 P3 deliv: the aware plan's h* equals the "none" plan's h* in at least 22 of 24 layouts at both M and both sigma_n,
    and F(none plan) / F(aware plan) has median at most 1.01.
 P4 sharing: at T30 and T60 the sd of the shared-field pressure part (time + space), median over pairs, is at most
    0.6 times the independent-drift pair sd sqrt(2) s0.
 P5 at T60, sigma_n = 1 m: the indep planner widens the spacing (median h* above 13.3 m) and costs a median at
    least 3% over the aware plan; at T30 at least 1%.
 P6 at T60, sigma_n = 1 m, the aware plan keeps the median h* at 13.3 m (5 bands).
Reported without a prediction: s0 at the delivery ages, the per-station time-part sd at T30 and T60, the dwell = 5
min and sqrt(d) sensitivities, F(aware) / F(none-pressure baseline), and every condition at sigma_n = 0.5 m.
Preliminary.
"""
import bisect
import json
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
M_PER_HPA = 287.05 * 288.15 / (9.80665 * 101325.0) * 100.0   # 8.32 m per hPa (ref_mix.M_PER_HPA)
YEAR_MIN = 365 * 1440.0
MAX_GAP_MIN = 180.0
N_MC = 4000
SIGMA_NS = (0.5, 1.0)
MISSIONS = ("deliv", "T30", "T60")
Z = 7.62


# ---------------------------------------------------------------- pressure series

def load_isd():
    """{station: (t_min array, QNH hPa array, (lat, lon))} from the committed 11ak extract: station pressure plus the
    station's median (altimeter - station) offset, as pressure_ref.qnh_series."""
    d = json.load(open(os.path.join(HERE, "nyc_isd_pressure_2014.json")))
    out = {}
    for name, s in d["stations"].items():
        diffs = sorted(a - p for a, p in zip(s["alt"], s["stn"]) if a is not None and p is not None)
        n = len(diffs)
        off = 0.5 * (diffs[(n - 1) // 2] + diffs[n // 2])
        pts = sorted({float(t): p + off for t, p in zip(s["t"], s["stn"]) if p is not None}.items())
        out[name] = (np.array([p[0] for p in pts]), np.array([p[1] for p in pts]), (s["lat"], s["lon"]))
    return out


def interp(ts, vs, t):
    """Linear interpolation at the times t (array); NaN outside or where the bracketing reports are > 3 h apart."""
    t = np.asarray(t, dtype=float)
    j = np.searchsorted(ts, t, side="right")
    ok = (j > 0) & (j < len(ts))
    jj = np.clip(j, 1, len(ts) - 1)
    t0, t1 = ts[jj - 1], ts[jj]
    ok &= (t1 - t0) <= MAX_GAP_MIN
    w = np.where(t1 > t0, (t - t0) / np.where(t1 > t0, t1 - t0, 1.0), 0.0)
    v = vs[jj - 1] * (1 - w) + vs[jj] * w
    return np.where(ok, v, np.nan)


def haversine_km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


# ---------------------------------------------------------------- ages

def mission_minutes(hub, dests, speed, dwell_min=0.0):
    """Out-and-back mission time (min) to each destination: 2 d / v plus the dwell."""
    hx, hy = hub
    d = np.hypot(np.asarray([p[0] for p in dests]) - hx, np.asarray([p[1] for p in dests]) - hy)
    return 2.0 * d / speed / 60.0 + dwell_min


def drone_ages(rng, n, mission, missions=None):
    """n ages (min) at an en-route encounter: uniform over a mission drawn from `missions` (deliv), or over
    [0, T] for mission "T30"/"T60"."""
    if mission == "deliv":
        T = rng.choice(missions, n)
    else:
        T = np.full(n, float(mission[1:]))
    return rng.uniform(0.0, 1.0, n) * T


# ---------------------------------------------------------------- gap samples

def gap_samples(rng, isd, ages_i, ages_j, d_km, main="JFK", pair=("JFK", "LGA"), space_pow=1.0):
    """Pressure part (m) of the gap error for len(ages_i) draws: time part at `main` plus the centred simultaneous
    pair difference scaled by (d_km / pair distance) ** space_pow. Draws with any reading undefined are redrawn
    (the year is sampled uniformly, so this only drops report gaps)."""
    ts, qs, _ = isd[main]
    a, b = isd[pair[0]], isd[pair[1]]
    D = haversine_km(a[2], b[2])
    mu = _pair_mean(isd, pair)
    n = len(ages_i)
    out = np.empty(0)
    while len(out) < n:
        t = rng.uniform(MAX_GAP_MIN, YEAR_MIN, n)
        qi, qj = interp(ts, qs, t - ages_i), interp(ts, qs, t - ages_j)
        x = interp(a[0], a[1], t) - interp(b[0], b[1], t) - mu
        space = x * (d_km / D) ** space_pow if d_km > 0 else 0.0
        g = M_PER_HPA * ((qi - qj) + space)
        out = np.concatenate([out, g[np.isfinite(g)]])
    return out[:n]


_PAIR_MEAN = {}


def _pair_mean(isd, pair):
    if pair not in _PAIR_MEAN:
        a, b = isd[pair[0]], isd[pair[1]]
        t = np.arange(0.0, YEAR_MIN, 10.0)
        x = interp(a[0], a[1], t) - interp(b[0], b[1], t)
        _PAIR_MEAN[pair] = float(np.nanmean(x))
    return _PAIR_MEAN[pair]


def drift_samples(rng, isd, ages, main="JFK"):
    """Per-drone take-off-zero drift 8.32 (Q(t - u) - Q(t)) (11ak's S0) at the given ages."""
    ts, qs, _ = isd[main]
    n = len(ages)
    out = np.empty(0)
    while len(out) < n:
        t = rng.uniform(MAX_GAP_MIN, YEAR_MIN, n)
        g = M_PER_HPA * (interp(ts, qs, t - ages) - interp(ts, qs, t))
        out = np.concatenate([out, g[np.isfinite(g)]])
    return out[:n]


# ---------------------------------------------------------------- level-overlap tables

def erf(x):
    """Abramowitz and Stegun 7.1.26, |error| < 1.5e-7."""
    x = np.asarray(x, dtype=float)
    s = np.sign(x)
    a = np.abs(x)
    t = 1.0 / (1.0 + 0.3275911 * a)
    y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * np.exp(-a * a)
    return s * y


def p_overlap(gaps, Z, s, deltas):
    """P(|gap + delta + e| < Z) averaged over delta samples (symmetrised in sign), e ~ N(0, s^2); gaps an array."""
    g = np.asarray(gaps, dtype=float)[:, None]
    d = np.concatenate([deltas, -deltas])[None, :]
    if s <= 0:
        return (np.abs(g + d) < Z).mean(axis=1)
    c = lambda x: 0.5 * (1.0 + erf(x / (s * math.sqrt(2.0))))
    return (c(Z - g - d) - c(-Z - g - d)).mean(axis=1)


def compress(x, nbins=120):
    """Bin means of x over equal-count bins: a support that keeps the mixture's tails (equal-count, so the extreme
    bins are the extreme samples)."""
    x = np.sort(np.asarray(x, dtype=float))
    return np.array([c.mean() for c in np.array_split(x, min(nbins, len(x)))])


def weights_from(h, Z, s, k, deltas):
    """(pw, px) as 11ai's level_weights for one pair: W pairs 2d levels apart, X pairs half at 2d + 1, half at
    |2d - 1|."""
    n = np.arange(0, 2 * k + 1)
    p = p_overlap(n * h, Z, s, deltas)
    pw = np.array([p[2 * d] for d in range(k)])
    px = np.array([0.5 * (p[2 * d + 1] + p[abs(2 * d - 1)]) for d in range(k)])
    return pw, px


class PairProblem:
    """F with a level-overlap table per operator pair: pw[i, j, d], px[i, j, d] (symmetric in i, j). Same score as
    level_leak.score when every pair has the same table; descent as ref_mix.Problem (O(m k) per move)."""

    def __init__(self, W, X, V, pw, px):
        self.W, self.X, self.V, self.pw, self.px = W, X, V, pw, px
        self.k = pw.shape[2]
        self._G = None

    def score(self, labels):
        lab = np.asarray(labels)
        m = len(lab)
        D = np.abs(lab[:, None] - lab[None, :])
        I, J = np.meshgrid(np.arange(m), np.arange(m), indexing="ij")
        below = (lab[None, :] < lab[:, None]).astype(float)
        return float((self.W * self.pw[I, J, D]).sum() + (self.X * self.px[I, J, D]).sum() + (self.V * below).sum())

    def _pair_table(self):
        if self._G is None:
            S = lambda A: A + A.T
            ar = np.arange(self.k)
            Dk = np.abs(ar[:, None] - ar[None, :])
            Cw = S(self.W)[:, :, None, None] * self.pw[:, :, Dk] + S(self.X)[:, :, None, None] * self.px[:, :, Dk]
            below = (ar[None, :] < ar[:, None]).astype(float)
            G = Cw + self.V[:, :, None, None] * below + self.V.T[:, :, None, None] * below.T
            m = G.shape[0]
            G[np.arange(m), np.arange(m)] = 0.0
            self._G = G
        return self._G

    def descend(self, labels):
        G = self._pair_table()
        lab = np.array(labels, dtype=int)
        ar = np.arange(len(lab))
        cost = G[ar[:, None], ar[None, :], :, lab[None, :]].sum(axis=1)
        moves = 0
        while True:
            cur = cost[ar, lab]
            d = cost - cur[:, None]
            i, a = np.unravel_index(int(d.argmin()), d.shape)
            if not d[i, a] < -1e-12 * max(1.0, abs(cur[i])):
                return tuple(int(x) for x in lab)
            b = lab[i]
            cost += G[:, i, :, a] - G[:, i, :, b]
            lab[i] = a
            moves += 1
            if moves % 64 == 0:
                cost = G[ar[:, None], ar[None, :], :, lab[None, :]].sum(axis=1)

    def search(self, restarts=200, seed=0, starts=()):
        m = self.W.shape[0]
        rng = np.random.default_rng(seed)
        cands = [tuple(int(x) for x in s) for s in starts if max(s) < self.k]
        cands += [tuple(int(x) for x in rng.integers(0, self.k, m)) for _ in range(restarts)]
        best, arg = np.inf, None
        for s0 in cands:
            lab = self.descend(s0)
            f = self.score(lab)
            if f < best - 1e-12 * abs(best if np.isfinite(best) else 1.0):
                best, arg = f, lab
        return arg, best
