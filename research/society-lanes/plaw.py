"""Anticipatory power-law corridor twin (milestone 4c): the fourth operational family.

The interaction is the time-to-collision energy of Karamouzas, Skinner and Guy (2014), "Universal
power law governing pedestrian interactions", Phys. Rev. Lett. 113, 238701,
E(tau) = k / tau^2 * exp(-tau / tau0), with the force the negative gradient of E with respect to
the relative position x = x_i - x_j. The closed form below is the one in Inria's UMANS
(`src/Engine/CostFunctions/PowerLaw.cpp`, MIT, Pettre et al. 2018-2020; read at commit 03394cc of
the UMANS-python redistribution of upstream 6ac29c7), which follows the paper's supplement:

    a = v.v, b = -x.v, c = x.x - R^2, d = b^2 - a c, tau = (b - sqrt d) / a
    F = -k exp(-tau/tau0) (2/tau + 1/tau0) / (a tau^2) * (v - (a x + b v) / sqrt d)

for 0.001 <= tau <= tau0 (none for overlapping pairs, d <= 0 or tau outside that window), with
v = v_i - v_j and R the sum of radii. `test_plaw.py` checks it against a finite-difference
gradient of E.

Parameters (all from UMANS's defaults and its `PowerLaw.xml` policy, which "reproduces the
original algorithm"; none fitted here):

    k = 1.5, tau0 = 3 s                   UMANS PowerLaw.h (the paper's values)
    relaxation time 0.5 s                 UMANS policies/PowerLaw.xml (goal force (v_pref - v) / 0.5)
    interaction range 5 m                 UMANS policies/PowerLaw.xml
    radius 0.24 m, max acceleration 5     UMANS core/agent.h Agent::Settings defaults
    max speed 1.8 / 1.4 of desired speed  UMANS defaults are 1.8 max at 1.4 preferred; kept as a
                                          ratio because desired speeds here vary per walker
    contact scale 5000 / 80 per m         UMANS core/policy.h (agent-agent and agent-wall overlap)
    mass 1                                UMANS agent.h

Integration is UMANS's: clamp acceleration, Euler-step velocity, clamp speed, add contact forces
times dt, Euler-step position. dt = 0.05 s (UMANS examples use 0.1 s; halved for the denser
BaSiGo crowds). UMANS's power law has no wall force (its header says the original paper does not
describe one), so walls act through the contact force only, and a walker is held inside the
corridor by clipping (its outward lateral velocity is zeroed), which the JuPedSim families did by
geometry.

Everything outside the operational model is sftwin.py's, unchanged: the corridor loop, entrance
and clearance rules, the steering stage (`sftwin.steer_targets` every 0.1 s: a walker's preferred
velocity points from its position to its steering target at its desired speed), the side-bias
rules and the measurement. The power law has no side preference of its own: an exactly head-on
pair gets no lateral force.

Needs numpy only.
"""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sftwin as S  # noqa: E402

K = 1.5
TAU0 = 3.0
RELAX = 0.5
RANGE = 5.0
RADIUS = 0.24
MAX_ACC = 5.0
MAX_SPEED_RATIO = 1.8 / 1.4
CONTACT = 5000.0 / 80.0
TAU_MIN = 0.001


def energy(x, v, R, k=K, tau0=TAU0):
    """E(tau) for one pair (relative position x = x_i - x_j, relative velocity v); 0 if no tau."""
    a = float(v @ v)
    b = -float(x @ v)
    c = float(x @ x) - R * R
    if a <= 0 or c <= 0:
        return 0.0
    d = b * b - a * c
    if d <= 0:
        return 0.0
    tau = (b - math.sqrt(d)) / a
    if tau < TAU_MIN or tau > tau0:
        return 0.0
    return k / tau ** 2 * math.exp(-tau / tau0)


def forces(pos, vel, radius, k=K, tau0=TAU0, rng_=RANGE):
    """Power-law interaction force on every walker (vectorised over pairs). pos, vel: (n, 2)."""
    n = len(pos)
    if n < 2:
        return np.zeros((n, 2))
    x = pos[:, None, :] - pos[None, :, :]           # x_i - x_j
    v = vel[:, None, :] - vel[None, :, :]
    R = radius[:, None] + radius[None, :]
    a = np.einsum("ijk,ijk->ij", v, v)
    b = -np.einsum("ijk,ijk->ij", x, v)
    xx = np.einsum("ijk,ijk->ij", x, x)
    c = xx - R * R
    d = b * b - a * c
    ok = (a > 1e-12) & (c > 0) & (d > 0) & (xx < rng_ * rng_)
    np.fill_diagonal(ok, False)
    sd = np.sqrt(np.where(ok, d, 1.0))
    aa = np.where(ok, a, 1.0)
    tau = (b - sd) / aa
    ok &= (tau >= TAU_MIN) & (tau <= tau0)
    tau = np.where(ok, tau, 1.0)
    c1 = np.where(ok, -k * np.exp(-tau / tau0) * (2.0 / tau + 1.0 / tau0) / (aa * tau * tau), 0.0)
    c2 = v - (aa[:, :, None] * x + b[:, :, None] * v) / sd[:, :, None]
    return (c1[:, :, None] * c2).sum(axis=1)


def contact(pos, radius, width):
    """UMANS contact force: scale times overlap, along the centre line; walls at y = 0, width."""
    n = len(pos)
    f = np.zeros((n, 2))
    if n > 1:
        x = pos[:, None, :] - pos[None, :, :]
        dist = np.sqrt(np.einsum("ijk,ijk->ij", x, x))
        np.fill_diagonal(dist, np.inf)
        over = radius[:, None] + radius[None, :] - dist
        m = over > 0
        if m.any():
            u = np.where(m[:, :, None], x / np.where(dist > 1e-9, dist, 1.0)[:, :, None], 0.0)
            f += (CONTACT * np.where(m, over, 0.0)[:, :, None] * u).sum(axis=1)
    lo = radius - pos[:, 1]
    hi = pos[:, 1] + radius - width
    f[:, 1] += CONTACT * np.clip(lo, 0, None) - CONTACT * np.clip(hi, 0, None)
    return f


def _clamp(v, m):
    s = np.linalg.norm(v, axis=1)
    f = np.where(s > m, m / np.maximum(s, 1e-12), 1.0)
    return v * f[:, None]


def simulate(n_walkers, width, length, entrance, beta, seed, goals=False,
             warmup=40.0, duration=160.0, dt=0.05, steer_every=0.1, record_every=0.1,
             exit_frac=0.25, rule="always", robots=0, policy="crowd", robot_speed=None, passes=False):
    """One closed-loop corridor under the power law; same loop and statistics as sftwin.simulate.

    robots, policy, robot_speed, passes: milestone 5b, as sftwin.simulate (robots.py); with
    robots = 0 and passes off the run is unchanged, random draws included."""
    if rule not in S.RULES:
        raise ValueError(f"rule must be one of {S.RULES}")
    import robots as R
    rng = np.random.default_rng(seed)
    v_robot = R.ROBOT_SPEED if robot_speed is None else robot_speed
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
        if robot:
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
                    x0 = 0.35 if dd > 0 else length - 0.35
                    y0 = rng.uniform(e_lo, e_hi) if e_hi > e_lo else width / 2
                    if len(P) and np.min((P[:, 0] - x0) ** 2 + (P[:, 1] - y0) ** 2) < S.CLEARANCE ** 2:
                        break
                    add(x0, y0, dd, S.desired_speeds(rng, 1)[0], True)
                    queue[dd] -= 1
                for _ in range(rqueue[dd]):
                    x0 = 0.35 if dd > 0 else length - 0.35
                    y0 = rng.uniform(e_lo, e_hi) if e_hi > e_lo else width / 2
                    if len(P) and np.min((P[:, 0] - x0) ** 2 + (P[:, 1] - y0) ** 2) < S.CLEARANCE ** 2:
                        break
                    add(x0, y0, dd, v_robot, True, robot=True)
                    rqueue[dd] -= 1
            tx, ty = S.steer_targets(P, D, G, beta, width, length, RADIUS, rule)
            if robots and RB.any():
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
        acc = (pref - V) / max(RELAX, dt) + forces(P, V, rad)
        acc = _clamp(acc, MAX_ACC)
        V = _clamp(V + acc * dt, MAX_SPEED_RATIO * v0)
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
