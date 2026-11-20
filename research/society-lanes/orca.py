"""ORCA corridor twin (milestone 4d): the fifth operational family.

Optimal reciprocal collision avoidance (van den Berg, Guy, Lin and Manocha 2011, "Reciprocal
n-body collision avoidance", Robotics Research, STAR 70, 3-19): each walker takes, from the
velocities its neighbours leave it, the one nearest its preferred velocity. Each neighbour j
removes a half-plane of velocities that would bring i and j into contact within the time horizon,
with each of the pair taking half the avoiding effort, and a 2-D linear program finds the nearest
allowed velocity (or, when none is allowed, the least-violating one).

The geometry and the three linear programs below are a line-by-line port of RVO2's `Agent.cpp`
(UNC Chapel Hill, Apache-2.0), read in Inria's UMANS adaptation
(`src/3rd-party/ORCA/ORCASolver.cpp` and `src/Engine/CostFunctions/ORCA.{h,cpp}`, MIT, at commit
03394cc of the UMANS-python redistribution of upstream 6ac29c7). One line differs from UMANS:
in the already-colliding branch UMANS divides by the squared length of w where RVO2 divides by its
length (`wLength = w.sqrMagnitude()`); RVO2's form is used, since it is the one the derivation
gives. `tests/test_orca.py` checks the result is in every half-plane, the reciprocity, and that
two walkers on a collision course miss each other.

Parameters (none fitted here):

    time horizon 5 s                      UMANS ORCA.h default (also the RVO2 example's)
    interaction range 5 m                 UMANS examples/policies/ORCA.xml
    at most 10 nearest neighbours         the RVO2 example's maxNeighbors (UMANS takes every
                                          neighbour in range; 10 keeps the pure-numpy fallback fast)
    relaxation time 0                     UMANS ORCA.xml: the velocity is ORCA's answer
    radius 0.24 m, max acceleration 5     UMANS core/agent.h Agent::Settings defaults (as plaw.py)
    max speed 1.8 / 1.4 of desired speed  UMANS defaults (as plaw.py)
    contact scale 5000 / 80 per m         UMANS core/policy.h (as plaw.py)
    dt 0.1 s                              UMANS examples

UMANS's ORCA has no obstacle lines ("TODO: include obstacle lines"). Here each wall adds one hard
half-plane, the velocity that reaches the wall within the obstacle horizon (5 s, the RVO2
example's timeHorizonObst), entered as an obstacle line so the fallback program keeps it hard as
RVO2 does for its obstacles. This is this project's addition; walkers are also clipped inside the
corridor as in plaw.py.

Everything outside the operational model is sftwin.py's, unchanged, exactly as plaw.py uses it.
ORCA has a deterministic tie-break (an exactly head-on pair projects on the "right leg" in RVO2's
code) but no side preference for any pair that is not exactly aligned.

Needs numpy; numba is used when present (the same code runs, about 50 times slower, without it).
"""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sftwin as S  # noqa: E402

try:  # pragma: no cover - exercised either way by the tests
    from numba import njit
except ImportError:  # pragma: no cover
    def njit(*a, **k):
        if a and callable(a[0]):
            return a[0]
        return lambda f: f

TAU = 5.0
TAU_OBST = 5.0
RANGE = 5.0
MAX_NEIGHBORS = 10
RADIUS = 0.24
MAX_ACC = 5.0
MAX_SPEED_RATIO = 1.8 / 1.4
CONTACT = 5000.0 / 80.0
EPS = 1e-5


@njit(cache=True)
def _det(ax, ay, bx, by):
    return ax * by - ay * bx


@njit(cache=True)
def _lp1(L, n_lines, no, radius, ox, oy, dir_opt, res):
    """RVO2 linearProgram1 on line `no` against lines 0..no-1. L rows: px, py, dx, dy."""
    px, py, dx, dy = L[no, 0], L[no, 1], L[no, 2], L[no, 3]
    dot = px * dx + py * dy
    disc = dot * dot + radius * radius - (px * px + py * py)
    if disc < 0.0:
        return False
    sq = math.sqrt(disc)
    t_left = -dot - sq
    t_right = -dot + sq
    for i in range(no):
        den = _det(dx, dy, L[i, 2], L[i, 3])
        num = _det(L[i, 2], L[i, 3], px - L[i, 0], py - L[i, 1])
        if abs(den) <= EPS:
            if num < 0.0:
                return False
            continue
        t = num / den
        if den >= 0.0:
            t_right = min(t_right, t)
        else:
            t_left = max(t_left, t)
        if t_left > t_right:
            return False
    if dir_opt:
        if ox * dx + oy * dy > 0.0:
            res[0], res[1] = px + dx * t_right, py + dy * t_right
        else:
            res[0], res[1] = px + dx * t_left, py + dy * t_left
    else:
        t = dx * (ox - px) + dy * (oy - py)
        if t < t_left:
            t = t_left
        elif t > t_right:
            t = t_right
        res[0], res[1] = px + dx * t, py + dy * t
    return True


@njit(cache=True)
def _lp2(L, n_lines, radius, ox, oy, dir_opt, res):
    """RVO2 linearProgram2: returns the index of the first line it fails on, or n_lines."""
    if dir_opt:
        res[0], res[1] = ox * radius, oy * radius
    elif ox * ox + oy * oy > radius * radius:
        m = math.sqrt(ox * ox + oy * oy)
        res[0], res[1] = ox / m * radius, oy / m * radius
    else:
        res[0], res[1] = ox, oy
    tmp = np.empty(2)
    for i in range(n_lines):
        if _det(L[i, 2], L[i, 3], L[i, 0] - res[0], L[i, 1] - res[1]) > 0.0:
            tmp[0], tmp[1] = res[0], res[1]
            if not _lp1(L, n_lines, i, radius, ox, oy, dir_opt, res):
                res[0], res[1] = tmp[0], tmp[1]
                return i
    return n_lines


@njit(cache=True)
def _lp3(L, n_lines, n_obst, begin, radius, res):
    """RVO2 linearProgram3: the least-violating velocity, obstacle lines kept hard."""
    distance = 0.0
    proj = np.empty((n_lines + 1, 4))
    tmp = np.empty(2)
    for i in range(begin, n_lines):
        if _det(L[i, 2], L[i, 3], L[i, 0] - res[0], L[i, 1] - res[1]) > distance:
            m = 0
            for j in range(n_obst):
                proj[m, :] = L[j, :]
                m += 1
            for j in range(n_obst, i):
                deter = _det(L[i, 2], L[i, 3], L[j, 2], L[j, 3])
                if abs(deter) <= EPS:
                    if L[i, 2] * L[j, 2] + L[i, 3] * L[j, 3] > 0.0:
                        continue
                    qx = (L[i, 0] + L[j, 0]) * 0.5
                    qy = (L[i, 1] + L[j, 1]) * 0.5
                else:
                    s = _det(L[j, 2], L[j, 3], L[i, 0] - L[j, 0], L[i, 1] - L[j, 1]) / deter
                    qx = L[i, 0] + L[i, 2] * s
                    qy = L[i, 1] + L[i, 3] * s
                ex, ey = L[j, 2] - L[i, 2], L[j, 3] - L[i, 3]
                en = math.sqrt(ex * ex + ey * ey)
                if en > 0.0:
                    ex, ey = ex / en, ey / en
                proj[m, 0], proj[m, 1], proj[m, 2], proj[m, 3] = qx, qy, ex, ey
                m += 1
            tmp[0], tmp[1] = res[0], res[1]
            if _lp2(proj, m, radius, -L[i, 3], L[i, 2], True, res) < m:
                res[0], res[1] = tmp[0], tmp[1]
            distance = _det(L[i, 2], L[i, 3], L[i, 0] - res[0], L[i, 1] - res[1])


@njit(cache=True)
def _agent_line(pix, piy, vix, viy, pjx, pjy, vjx, vjy, R, tau, dt, out):
    """RVO2's ORCA half-plane that neighbour j puts on agent i (point, direction)."""
    rpx, rpy = pjx - pix, pjy - piy
    rvx, rvy = vix - vjx, viy - vjy
    dist_sq = rpx * rpx + rpy * rpy
    R_sq = R * R
    if dist_sq > R_sq:
        wx, wy = rvx - rpx / tau, rvy - rpy / tau
        w_sq = wx * wx + wy * wy
        dot1 = wx * rpx + wy * rpy
        if dot1 < 0.0 and dot1 * dot1 > R_sq * w_sq:
            wl = math.sqrt(w_sq)
            ux_, uy_ = wx / wl, wy / wl
            dx, dy = uy_, -ux_
            ux, uy = ux_ * (R / tau - wl), uy_ * (R / tau - wl)
        else:
            leg = math.sqrt(dist_sq - R_sq)
            if _det(rpx, rpy, wx, wy) > 0.0:
                dx = (rpx * leg - rpy * R) / dist_sq
                dy = (rpx * R + rpy * leg) / dist_sq
            else:
                dx = -(rpx * leg + rpy * R) / dist_sq
                dy = -(-rpx * R + rpy * leg) / dist_sq
            d2 = rvx * dx + rvy * dy
            ux, uy = dx * d2 - rvx, dy * d2 - rvy
    else:
        wx, wy = rvx - rpx / dt, rvy - rpy / dt
        wl = math.sqrt(wx * wx + wy * wy)
        if wl < 1e-12:
            wl = 1e-12
        ux_, uy_ = wx / wl, wy / wl
        dx, dy = uy_, -ux_
        ux, uy = ux_ * (R / dt - wl), uy_ * (R / dt - wl)
    out[0], out[1], out[2], out[3] = vix + 0.5 * ux, viy + 0.5 * uy, dx, dy


@njit(cache=True)
def orca_velocities(P, V, pref, vmax, radius, width, tau, tau_obst, dt, rng_, max_nb):
    """New velocity for every walker. Walls are y = 0 and y = width (None: no walls, width <= 0)."""
    n = P.shape[0]
    out = np.empty((n, 2))
    L = np.empty((max_nb + 2, 4))
    res = np.empty(2)
    d2 = np.empty(n)
    line = np.empty(4)
    for i in range(n):
        m = 0
        n_obst = 0
        if width > 0.0:
            L[m, 0], L[m, 1], L[m, 2], L[m, 3] = 0.0, -(P[i, 1] - radius[i]) / tau_obst, 1.0, 0.0
            m += 1
            L[m, 0], L[m, 1], L[m, 2], L[m, 3] = 0.0, (width - radius[i] - P[i, 1]) / tau_obst, -1.0, 0.0
            m += 1
            n_obst = 2
        for j in range(n):
            dx, dy = P[j, 0] - P[i, 0], P[j, 1] - P[i, 1]
            d2[j] = dx * dx + dy * dy if j != i else np.inf
        order = np.argsort(d2)
        for k in range(min(max_nb, n - 1)):
            j = order[k]
            if d2[j] > rng_ * rng_:
                break
            _agent_line(P[i, 0], P[i, 1], V[i, 0], V[i, 1], P[j, 0], P[j, 1], V[j, 0], V[j, 1],
                        radius[i] + radius[j], tau, dt, line)
            L[m, :] = line
            m += 1
        fail = _lp2(L, m, vmax[i], pref[i, 0], pref[i, 1], False, res)
        if fail < m:
            _lp3(L, m, n_obst, fail, vmax[i], res)
        out[i, 0], out[i, 1] = res[0], res[1]
    return out


def contact(pos, radius, width):
    """UMANS contact force (as plaw.contact)."""
    import plaw
    return plaw.contact(pos, radius, width)


def _clamp(v, m):
    s = np.linalg.norm(v, axis=1)
    f = np.where(s > m, m / np.maximum(s, 1e-12), 1.0)
    return v * f[:, None]


def simulate(n_walkers, width, length, entrance, beta, seed, goals=False,
             warmup=40.0, duration=160.0, dt=0.1, steer_every=0.1, record_every=0.1,
             exit_frac=0.25, rule="always", max_neighbors=MAX_NEIGHBORS, robots=0, policy="crowd",
             robot_speed=None, passes=False, tau=TAU, entry="edge"):
    """One closed-loop corridor under ORCA; same loop and statistics as plaw.simulate.

    robots, policy, robot_speed, passes: milestone 5b, as sftwin.simulate (robots.py). Robots are
    ORCA agents too, so robot and crowd share one planner; with robots = 0 and passes off the run
    is unchanged, random draws included. tau: the agent-agent time horizon (s), milestone 6h's
    spacing parameter (RVO2's example value TAU by default). entry: milestone 6i, as sftwin.simulate."""
    if rule not in S.RULES:
        raise ValueError(f"rule must be one of {S.RULES}")
    if entry not in S.ENTRIES:
        raise ValueError(f"entry must be one of {S.ENTRIES}")
    import robots as R
    rng = np.random.default_rng(seed)
    people_speed = robot_speed == R.PEOPLE_SPEED   # milestone 6f, as sftwin.simulate
    v_robot = R.ROBOT_SPEED if robot_speed is None else (math.nan if people_speed else robot_speed)
    RB = np.zeros(0, dtype=bool)   # is a robot
    RG = np.zeros(0)               # a robot's exit under policy "goal" (nan otherwise)
    P = np.zeros((0, 2))
    V = np.zeros((0, 2))
    v0 = np.zeros(0)
    D = np.zeros(0)
    G = np.zeros(0)
    NEW = np.zeros(0, dtype=bool)
    ID = np.zeros(0, dtype=int)
    next_id = [0]

    def goal_for():
        if not goals:
            return math.nan
        return width * (exit_frac if rng.random() < 0.5 else 1.0 - exit_frac)

    def add(x, y, d, s, new, robot=False):
        nonlocal P, V, v0, D, G, NEW, ID, RB, RG
        if robot and not people_speed:
            s = v_robot
        P = np.vstack([P, [x, y]])
        V = np.vstack([V, [d * s, 0.0]])
        v0 = np.append(v0, s)
        D = np.append(D, d)
        G = np.append(G, math.nan if robot else goal_for())
        RB = np.append(RB, robot)
        RG = np.append(RG, R.robot_goal(rng, width) if (robot and policy == "goal") else math.nan)
        NEW = np.append(NEW, new)
        ID = np.append(ID, next_id[0])
        next_id[0] += 1

    cols = max(1, int(round(math.sqrt(n_walkers * length / width))))
    rows_ = max(1, math.ceil(n_walkers / cols))
    gx, gy = length / cols, width / rows_
    cells = [(i, j) for i in range(cols) for j in range(rows_)]
    rng.shuffle(cells)
    placed = []
    for i, j in cells[:n_walkers]:
        jx, jy = max(0.0, gx / 2 - RADIUS), max(0.0, gy / 2 - RADIUS)
        x = (i + 0.5) * gx + rng.uniform(-jx, jx)
        y = min(max((j + 0.5) * gy + rng.uniform(-jy, jy), RADIUS + 0.05), width - RADIUS - 0.05)
        placed.append((x, y))
    v0s = S.desired_speeds(rng, len(placed))
    for kk, p in enumerate(placed):
        add(p[0], p[1], 1 if kk % 2 == 0 else -1, v0s[kk], False, robot=kk < robots)
    queue = {1: 0, -1: 0}
    rqueue = {1: 0, -1: 0}
    e_lo = max(RADIUS + 0.05, width / 2 - entrance / 2)
    e_hi = min(width - RADIUS - 0.05, width / 2 + entrance / 2)
    steer_n = max(1, round(steer_every / dt))
    rec_n = max(1, round(record_every / dt))
    lo_x, hi_x = length / 2 - S.SECTION_HALF, length / 2 + S.SECTION_HALF
    samples, dirs_of = {}, {}
    rsamples = {}
    tracker = R.PassTracker(lo_x, hi_x, RADIUS) if (robots or passes) else None
    T = np.zeros((0, 2))
    steps = round(duration / dt)
    for it in range(steps + 1):
        t = it * dt
        if it % steer_n == 0:
            leaving = np.where(D > 0, P[:, 0] >= length, P[:, 0] <= 0.0)
            for dd, rb in zip(D[leaving], RB[leaving]):
                (rqueue if rb else queue)[int(dd)] += 1
            keep = ~leaving
            P, V, v0, D, G, NEW, ID = P[keep], V[keep], v0[keep], D[keep], G[keep], NEW[keep], ID[keep]
            RB, RG = RB[keep], RG[keep]
            for dd in (1, -1):
                for _ in range(queue[dd]):
                    x0 = S.entry_x(rng, dd, length, entry)
                    y0 = rng.uniform(e_lo, e_hi) if e_hi > e_lo else width / 2
                    if len(P) and np.min((P[:, 0] - x0) ** 2 + (P[:, 1] - y0) ** 2) < S.CLEARANCE ** 2:
                        break
                    add(x0, y0, dd, S.desired_speeds(rng, 1)[0], True)
                    queue[dd] -= 1
                for _ in range(rqueue[dd]):
                    x0 = S.entry_x(rng, dd, length, entry)
                    y0 = rng.uniform(e_lo, e_hi) if e_hi > e_lo else width / 2
                    if len(P) and np.min((P[:, 0] - x0) ** 2 + (P[:, 1] - y0) ** 2) < S.CLEARANCE ** 2:
                        break
                    add(x0, y0, dd, S.desired_speeds(rng, 1)[0] if people_speed else v_robot, True,
                        robot=True)
                    rqueue[dd] -= 1
            tx, ty = S.steer_targets(P, D, G, beta, width, length, RADIUS, rule)
            if robots and RB.any() and policy != R.HUMAN:
                rtx, rty = R.robot_targets(P, D, RG, RB, policy, width, length, RADIUS)
                tx, ty = tx.copy(), ty.copy()
                tx[RB], ty[RB] = rtx, rty
            T = np.stack([tx, ty], axis=1)
        if it % rec_n == 0 and t >= warmup:
            if tracker is not None:
                tracker.update(list(ID), P, D, RB)
            sel = NEW & (P[:, 0] >= lo_x) & (P[:, 0] <= hi_x)
            f = round(t / record_every)
            for a, (x, y), d, rb in zip(ID[sel], P[sel], D[sel], RB[sel]):
                if rb:
                    rsamples.setdefault(int(a), []).append((f, float(x), float(y)))
                    continue
                samples.setdefault(int(a), []).append((f, float(x), float(y)))
                dirs_of[int(a)] = int(d)
        n = len(P)
        if n == 0:
            continue
        rad = np.full(n, RADIUS)
        to = T - P
        dist = np.linalg.norm(to, axis=1)
        pref = to / np.maximum(dist, 1e-9)[:, None] * v0[:, None]
        vmax = MAX_SPEED_RATIO * v0
        new_v = orca_velocities(P, V, pref, vmax, rad, float(width), float(tau), TAU_OBST, dt, RANGE,
                                max_neighbors)
        acc = _clamp((new_v - V) / dt, MAX_ACC)
        V = _clamp(V + acc * dt, vmax)
        V = V + contact(P, rad, width) * dt
        P = P + V * dt
        lo_y, hi_y = RADIUS, width - RADIUS
        out_lo, out_hi = P[:, 1] < lo_y, P[:, 1] > hi_y
        P[:, 1] = np.clip(P[:, 1], lo_y, hi_y)
        V[out_lo, 1] = np.maximum(V[out_lo, 1], 0.0)
        V[out_hi, 1] = np.minimum(V[out_hi, 1], 0.0)
        if not np.isfinite(P).all():
            out = S.measure({}, {}, width, record_every)
            out["failed"] = 1
            return out
    out = S.measure(samples, dirs_of, width, record_every)
    out["failed"] = 0
    if tracker is not None:
        out.update(tracker.summary())
        rws = {a: (1, [(f, y * 100.0, x * 100.0) for f, x, y in s]) for a, s in rsamples.items()
               if len(s) >= 10}
        out["robot_speed"] = S.L.median(S.L.walker_speeds(rws, 1.0 / record_every, round(1.0 / record_every)))
        out["robot_transits"] = sum(1 for s in rsamples.values() if abs(s[-1][1] - s[0][1]) >= S.TRANSIT_MIN)
    return out
