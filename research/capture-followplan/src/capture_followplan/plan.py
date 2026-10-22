"""Follow-camera controllers on the capture-follow plaza: inverse-distance repulsion against a predictive sampler.

The world, crowd, metrics and platforms are capture-follow's (imported, not copied). Only the controller changes,
so mode "repulsion" must reproduce capture_follow.model.simulate exactly (tested).

The sampler ("plan") picks, every step, the velocity from a fixed set of headings and speeds that minimises
  distance of the camera at the horizon from where the creator's shot point will be (constant-velocity creator)
  + PEN * sum over horizon samples of max(0, R - distance to each pedestrian (constant-velocity))^2.
That lets the camera go round a pedestrian and rejoin the shot, which a potential field cannot. Pedestrian
velocities are taken as known (finite difference of perfect tracking): an upper bound on perception.
"""
import math
import random

from capture_follow.model import (PED_V, TARGET, CONTACT, CLOSE, SIGHT, BAND, W, Walker, crosses_any,
                                  crosses_step, delta, dist, seg_dist, wrap)

HORIZON = 3.0
SAMPLES = (0.5, 1.0, 1.5, 2.0, 2.5, 3.0)
HEADINGS = 16
PEN = 6.0
SENSE = 7.0   # only pedestrians within this range are considered (m)


def _repulse(pos, peds, gain=1.2):
    fx = fy = 0.0
    for w in peds:
        ax, ay = delta(pos[0], w.p[0]), delta(pos[1], w.p[1])
        if abs(ax) < 2.0 and abs(ay) < 2.0:
            d = math.hypot(ax, ay) or 1e-6
            if d < 2.0:
                k = gain * (1 / d - 1 / 2.0)
                fx += k * ax / d
                fy += k * ay / d
    return fx, fy


def _plan(pos, vel, vmax, creator, cvel, peds, pvels, radius):
    """Return the desired velocity (vx, vy) chosen by the sampler."""
    near = []
    for w, v in zip(peds, pvels):
        rx, ry = delta(w.p[0], pos[0]), delta(w.p[1], pos[1])
        if rx * rx + ry * ry < SENSE * SENSE:
            near.append((rx, ry, v[0], v[1]))
    # shot point now and at the horizon, relative to the camera
    h = creator.h
    tx0, ty0 = delta(creator.p[0] - TARGET * math.cos(h), pos[0]), delta(creator.p[1] - TARGET * math.sin(h), pos[1])
    best, best_c = (0.0, 0.0), float("inf")
    cands = [(0.0, 0.0)]
    for frac in (0.4, 0.75, 1.0):
        for k in range(HEADINGS):
            a = 2 * math.pi * k / HEADINGS
            cands.append((frac * vmax * math.cos(a), frac * vmax * math.sin(a)))
    # the direct pursuit velocity is always a candidate
    dx, dy = 1.5 * tx0, 1.5 * ty0
    sp = math.hypot(dx, dy)
    if sp > vmax:
        dx, dy = dx * vmax / sp, dy * vmax / sp
    cands.append((dx, dy))
    # rotations and scalings of the pursuit velocity, so the planner can pass a pedestrian on either side and still close on the shot
    for ang in (-1.2, -0.8, -0.4, -0.2, 0.2, 0.4, 0.8, 1.2):
        ca, sa = math.cos(ang), math.sin(ang)
        for f in (0.5, 1.0):
            cands.append((f * (dx * ca - dy * sa), f * (dx * sa + dy * ca)))
    r2 = radius * radius
    for ux, uy in cands:
        pen = 0.0
        for t in SAMPLES:
            cx, cy = ux * t, uy * t
            for rx, ry, vx, vy in near:
                d = math.hypot(rx + vx * t - cx, ry + vy * t - cy)
                if d < radius:
                    pen += (radius - d) ** 2
        ex = tx0 + cvel[0] * HORIZON - ux * HORIZON
        ey = ty0 + cvel[1] * HORIZON - uy * HORIZON
        c = math.hypot(ex, ey) + PEN * pen + 0.05 * math.hypot(ux - vel[0], uy - vel[1])
        if c < best_c:
            best_c, best = c, (ux, uy)
    return best


def simulate(plat, density, seed, mode="repulsion", radius=1.5, gain=1.2, duration=240.0, dt=0.25, steps_on=True,
             estimator=None):
    """capture_follow.model.simulate with a switchable controller. mode: 'repulsion', 'plan' or 'ignore'."""
    rng = random.Random(seed)
    n = int(round(density * W * W))
    peds = [Walker(rng, PED_V) for _ in range(n)]
    creator = Walker(rng, 1.3)
    creator.p = [5.0, 15.0]
    pos = [creator.p[0] - TARGET * math.cos(creator.h), creator.p[1] - TARGET * math.sin(creator.h)]
    if plat.wheeled:
        pos[1] = creator.p[1]
    vel = [0.0, 0.0]
    steps = int(duration / dt)
    framed = clear = blocked = close_steps = contacts = 0
    in_contact = False
    energy_j = 0.0
    for _ in range(steps):
        prev = [(w.p[0], w.p[1]) for w in peds]
        cprev = (creator.p[0], creator.p[1])
        for w in peds:
            w.step(dt)
        creator.step(dt)
        c = creator.p
        if mode == "plan":
            pvels = [(delta(w.p[0], q[0]) / dt, delta(w.p[1], q[1]) / dt) for w, q in zip(peds, prev)]
            seen = peds
            if estimator is not None:   # perception: planner sees estimated positions and velocities, not the truth
                seen, pvels = estimator.update(peds)
            cvel = (delta(c[0], cprev[0]) / dt, delta(c[1], cprev[1]) / dt)
            dvx, dvy = _plan(pos, vel, plat.vmax, creator, cvel, seen, pvels, radius)
        else:
            tx = c[0] - TARGET * math.cos(creator.h)
            ty = c[1] - TARGET * math.sin(creator.h)
            dvx, dvy = 1.5 * delta(tx, pos[0]), 1.5 * delta(ty, pos[1])
            if mode == "repulsion":
                fx, fy = _repulse(pos, peds, gain)
                dvx += fx
                dvy += fy
            sp = math.hypot(dvx, dvy)
            if sp > plat.vmax:
                dvx, dvy = dvx * plat.vmax / sp, dvy * plat.vmax / sp
        ax_, ay_ = dvx - vel[0], dvy - vel[1]
        am = math.hypot(ax_, ay_)
        if am > plat.accel * dt:
            ax_, ay_ = ax_ * plat.accel * dt / am, ay_ * plat.accel * dt / am
        vel[0] += ax_
        vel[1] += ay_
        nx, ny = wrap(pos[0] + vel[0] * dt), wrap(pos[1] + vel[1] * dt)
        if steps_on and not plat.flies and crosses_any(pos, (nx, ny)):
            if plat.wheeled:
                if crosses_step(pos, (nx, ny)):
                    nx, ny = pos[0], pos[1]
                    vel[0] = vel[1] = 0.0
                    blocked += 1
            else:
                nx = wrap(pos[0] + vel[0] * dt * plat.cross_speed)
                ny = wrap(pos[1] + vel[1] * dt * plat.cross_speed)
        pos[0], pos[1] = nx, ny
        energy_j += (plat.base_w + plat.move_w * min(1.0, math.hypot(*vel) / plat.vmax)) * dt
        d = dist(pos, c)
        if abs(d - TARGET) <= BAND * TARGET:
            framed += 1
        near = min((dist(pos, w.p) for w in peds), default=99.0)
        if near < CLOSE:
            close_steps += 1
        if near < CONTACT:
            if not in_contact:
                contacts += 1
            in_contact = True
        else:
            in_contact = False
        if plat.flies or not any(seg_dist(w.p, pos, c) < SIGHT for w in peds if dist(w.p, c) < d + 1):
            clear += 1
    hours = duration / 3600.0
    return {"framed": framed / steps, "clear": clear / steps, "blocked": blocked / steps,
            "close_s_per_h": close_steps * dt / hours, "contacts_per_h": contacts / hours,
            "wh_per_h": energy_j / 3600.0 / hours}
