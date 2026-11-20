"""Social-force corridor twin: JuPedSim's social-force model plus one side-bias parameter.

The operational model is JuPedSim's SocialForceModel (Helbing, Farkas and Vicsek 2000
parameters, JuPedSim 1.4.2 defaults). JuPedSim's social force has no side preference, so the
walkers are steered through a direct-steering stage: every `steer_every` seconds a walker
with an oncoming walker close ahead aims at lateral slope `beta` toward its own right,
otherwise straight along the corridor. beta = 0 is plain JuPedSim social force.

Geometry: an open straight corridor along x, 0 <= x <= length, walls at y = 0 and y = width
(metres). Heading +x a walker's right is at small y (right-handed frame, z up), the same
convention as `lanes.rotate_x_corridor`. The number of walkers is held fixed, as in the loop
the participants walked: a walker who reaches the far end leaves and a new walker enters at
the same end's entrance (centred, `entrance` wide) as soon as there is room.

Measurement mirrors `lanes.py`: per walker, mean offset toward its own right inside the
middle 8 m; lane order in 30 cm bins on frames with at least 4 walkers each way; median speed
over 1 s lags. Only walkers that entered after the start count (the initial placement is
random and would otherwise leak into the statistics).

Milestone 4 adds a second operational model, JuPedSim's AnticipationVelocityModel (`model="avm"`),
under the same steering stage, and the exit position as a parameter (`exit_frac`). Milestone 4b
adds a third, JuPedSim's CollisionFreeSpeedModel (`model="cfsm"`, Tordeux, Chraibi and Seyfried
2016), and the side-bias rule as a parameter (`rule`): "always" (milestones 3 and 4a), "yield"
(the bias is off for a walker whose lateral goal lies on its left half) and "scaled" (the bias is
weighted by (1 + r) / 2, r the goal's offset toward the walker's right in half-widths). Walkers
without a lateral goal get the full bias under every rule, so the free-choice fit is unchanged.

Milestone 5 adds robots (`robots`, `policy`, `robot_speed`; `robots.py`): the first `robots`
agents placed are robots and re-enter as robots, steered by a passing-side policy instead of the
side bias, and the run also reports passes and their clearance. With robots = 0 and passes off
the run is unchanged, random draws included.

Milestone 6f adds two robot settings for a factorial on what makes a robot unlike a person:
policy="human" (robots.HUMAN) leaves a robot on the people's own steering rule, side bias included, and
robot_speed="people" (robots.PEOPLE_SPEED) gives each robot entry a desired speed drawn as a person's.
A robot with both is a person in every respect except that the people-only measures leave it out.

Needs numpy and jupedsim (`python3 platform/ci/pyenv.py jupedsim numpy`).
"""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lanes as L  # noqa: E402

SECTION_HALF = 4.0   # measured section: middle 8 m, as milestones 1 and 2
LOOK_AHEAD = 3.0     # m: oncoming walker counts if within this distance ahead
LATERAL_GAP = 1.0    # m: ... and within this lateral distance
TARGET_AHEAD = 2.0   # m: steering target this far ahead
TRANSIT_MIN = 7.5    # m: a walker whose samples span this much of the 8 m section crossed it
CLEARANCE = 0.55     # m: free space needed to enter
RADIUS = 0.25        # m: lower end of the 0.5-0.7 m diameters of Helbing et al. (2000); the
                     # JuPedSim default 0.3 m cannot pack to the 3.8/m2 measured in BaSiGo b_08
AVM_RADIUS = 0.2     # m: JuPedSim 1.4.2 default for the anticipation velocity model
CFSM_RADIUS = 0.2    # m: JuPedSim 1.4.2 default for the collision-free speed model
CFSM_TIME_GAP = 1.0  # s: JuPedSim 1.4.2 default
MODELS = ("sf", "avm", "cfsm")
ENTRIES = ("edge", "lobby")
LOBBY = (0.3, 1.2)   # m behind the corridor end: milestone 6i's lobby entry


def entry_x(rng, d, length, entry="edge"):
    """x of a re-entering walker heading d. "edge": 0.35 m inside its end; "lobby": LOBBY m behind it."""
    if entry == "edge":
        return 0.35 if d > 0 else length - 0.35
    if entry != "lobby":
        raise ValueError(f"entry must be one of {ENTRIES}")
    back = rng.uniform(*LOBBY)
    return -back if d > 0 else length + back
RULES = ("always", "yield", "scaled")


def desired_speeds(rng, n, mean=1.34, sd=0.26, lo=0.6, hi=2.0):
    """Weidmann (1993) free speed, normal with the spread Helbing et al. (2000) used."""
    return np.clip(rng.normal(mean, sd, n), lo, hi)


def bias_weight(dirs, goal_y, width, rule="always"):
    """Per-walker weight on the side bias. No lateral goal: 1 under every rule."""
    if rule not in RULES:
        raise ValueError(f"rule must be one of {RULES}")
    w = np.ones(len(dirs))
    has_goal = ~np.isnan(goal_y)
    if rule == "always" or not has_goal.any():
        return w
    r = right_offset(np.nan_to_num(goal_y, nan=width / 2.0), dirs, width)
    if rule == "yield":
        return np.where(has_goal & (r < 0), 0.0, w)
    return np.where(has_goal, np.clip((1.0 + r) / 2.0, 0.0, 1.0), w)


def steer_targets(pos, dirs, goal_y, beta, width, length, radius=RADIUS, rule="always"):
    """Steering target per walker (vectorised).

    pos: (n, 2); dirs: (n,) +1 heading +x, -1 heading -x; goal_y: (n,) lateral goal or nan.
    A walker with an oncoming walker within LOOK_AHEAD ahead and LATERAL_GAP sideways adds a
    lateral component beta * TARGET_AHEAD toward its own right (-dir in y).
    """
    n = len(dirs)
    x, y = pos[:, 0], pos[:, 1]
    tx = x + dirs * TARGET_AHEAD
    ty = y.copy()
    # lateral goal: head for (far end, goal_y) along the straight line
    has_goal = ~np.isnan(goal_y)
    if has_goal.any():
        end = np.where(dirs > 0, length, 0.0)
        dist = np.maximum((end - x) * dirs, TARGET_AHEAD)
        ty = np.where(has_goal, y + (np.nan_to_num(goal_y) - y) * TARGET_AHEAD / dist, ty)
    if beta and n > 1:
        dx = (x[None, :] - x[:, None]) * dirs[:, None]        # ahead distance of j from i
        dy = np.abs(y[None, :] - y[:, None])
        opp = dirs[None, :] != dirs[:, None]
        oncoming = (opp & (dx > 0) & (dx <= LOOK_AHEAD) & (dy < LATERAL_GAP)).any(axis=1)
        w = bias_weight(dirs, goal_y, width, rule)
        ty = ty + np.where(oncoming, -dirs * beta * w * TARGET_AHEAD, 0.0)
    tx = np.clip(tx, -1.4, length + 1.4)
    ty = np.clip(ty, radius + 0.05, width - radius - 0.05)
    return tx, ty


def right_offset(y, d, width):
    """Offset toward own right, in half-widths: heading +x the right is small y."""
    half = width / 2.0
    return -d * (y - half) / half


def simulate(n_walkers, width, length, entrance, beta, seed, goals=False,
             warmup=40.0, duration=160.0, dt=0.01, steer_every=0.1, record_every=0.1,
             model="sf", exit_frac=0.25, rule="always", robots=0, policy="crowd",
             robot_speed=None, passes=False, agent_scale=None, time_gap=None, entry="edge"):
    """Run one closed-loop corridor. Returns per-run statistics (dict).

    entry (milestone 6i): "edge" (default) places a re-entering walker 0.35 m inside its own end, where it
    shares room with the walkers leaving that end; "lobby" places it 0.3 to 1.2 m behind the end, in the
    run-out where leavers have already been removed. Both need CLEARANCE of free space and use the
    `entrance` width.

    agent_scale (social force, Helbing's A in N; JuPedSim default 2000) and time_gap (collision-free
    speed, s; default CFSM_TIME_GAP): milestone 6h's spacing parameters; None keeps the defaults.

    model: "sf" (JuPedSim SocialForceModel, Helbing et al. 2000 defaults, radius 0.25 m) or
    "avm" (JuPedSim AnticipationVelocityModel, Xu, Chraibi and Seyfried 2021, JuPedSim
    defaults). exit_frac: with goals, an assigned walker aims at the far end at this fraction
    of the width from the left or the right wall (50/50).
    """
    import jupedsim as jps
    import robots as R

    if model not in MODELS:
        raise ValueError(f"model must be one of {MODELS}")
    if rule not in RULES:
        raise ValueError(f"rule must be one of {RULES}")
    if entry not in ENTRIES:
        raise ValueError(f"entry must be one of {ENTRIES}")
    radius = {"sf": RADIUS, "avm": AVM_RADIUS, "cfsm": CFSM_RADIUS}[model]
    rng = np.random.default_rng(seed)
    # walkable area runs 1.5 m past each end so leaving walkers are not held by an end wall
    area = [(-1.5, 0), (length + 1.5, 0), (length + 1.5, width), (-1.5, width)]
    if model == "sf":
        op = jps.SocialForceModel()
    elif model == "avm":
        op = jps.AnticipationVelocityModel(rng_seed=int(seed))
    else:
        op = jps.CollisionFreeSpeedModel()
    sim = jps.Simulation(model=op, geometry=area, dt=dt)
    stage = sim.add_direct_steering_stage()
    journey = sim.add_journey(jps.JourneyDescription([stage]))
    agents = {}  # id -> [dir, goal_y, born_after_start, is_robot, robot_goal_y]
    people_speed = robot_speed == R.PEOPLE_SPEED   # milestone 6f: robots draw people's free speed
    v_robot = R.ROBOT_SPEED if robot_speed is None else (math.nan if people_speed else robot_speed)

    def goal_for(d):
        if not goals:
            return math.nan
        return width * (exit_frac if rng.random() < 0.5 else 1.0 - exit_frac)

    def add(x, y, d, v0, new, robot=False):
        if robot and not people_speed:
            v0 = v_robot
        if model == "sf":
            par = jps.SocialForceModelAgentParameters(
                journey_id=journey, stage_id=stage, position=(float(x), float(y)),
                orientation=(float(d), 0.0), desired_speed=float(v0), radius=radius,
                **({} if agent_scale is None else {"agent_scale": float(agent_scale)}))
        elif model == "cfsm":
            par = jps.CollisionFreeSpeedModelAgentParameters(
                journey_id=journey, stage_id=stage, position=(float(x), float(y)),
                time_gap=CFSM_TIME_GAP if time_gap is None else float(time_gap), desired_speed=float(v0), radius=radius)
        else:
            par = jps.AnticipationVelocityModelAgentParameters(
                journey_id=journey, stage_id=stage, position=(float(x), float(y)),
                desired_speed=float(v0), radius=radius)
        aid = sim.add_agent(par)
        if robot:
            agents[aid] = [d, math.nan, new, True,
                           R.robot_goal(rng, width) if policy == "goal" else math.nan]
        else:
            agents[aid] = [d, goal_for(d), new, False, math.nan]

    # initial placement: a jittered lattice over the whole corridor, half each way
    cols = max(1, int(round(math.sqrt(n_walkers * length / width))))
    rows_ = max(1, math.ceil(n_walkers / cols))
    gx, gy = length / cols, width / rows_
    cells = [(i, j) for i in range(cols) for j in range(rows_)]
    rng.shuffle(cells)
    placed = []
    for i, j in cells[:n_walkers]:
        jx, jy = max(0.0, gx / 2 - radius), max(0.0, gy / 2 - radius)
        x = (i + 0.5) * gx + rng.uniform(-jx, jx)
        y = min(max((j + 0.5) * gy + rng.uniform(-jy, jy), radius + 0.05), width - radius - 0.05)
        placed.append((x, y))
    v0s = desired_speeds(rng, len(placed))
    queue = {1: 0, -1: 0}
    rqueue = {1: 0, -1: 0}
    for k, p in enumerate(placed):
        d0 = 1 if k % 2 == 0 else -1
        try:
            add(p[0], p[1], d0, v0s[k], False, robot=k < robots)
        except RuntimeError:  # AVM/CFSM refuse overlapping placement: the walker enters later instead
            (rqueue if k < robots else queue)[d0] += 1
    e_lo = max(radius + 0.05, width / 2 - entrance / 2)
    e_hi = min(width - radius - 0.05, width / 2 + entrance / 2)
    steer_n = max(1, round(steer_every / dt))
    rec_n = max(1, round(record_every / dt))
    lo_x, hi_x = length / 2 - SECTION_HALF, length / 2 + SECTION_HALF
    samples = {}   # aid -> list of (t, x, y)
    dirs_of = {}
    rsamples = {}  # robots, same format
    tracker = R.PassTracker(lo_x, hi_x, radius) if (robots or passes) else None
    steps = round(duration / dt)
    for it in range(steps + 1):
        t = it * dt
        if it % steer_n == 0:
            ids = list(agents)
            pos = np.array([sim.agent(a).position for a in ids]) if ids else np.zeros((0, 2))
            if ids:
                d = np.array([agents[a][0] for a in ids], dtype=float)
                g = np.array([agents[a][1] for a in ids], dtype=float)
                # leave at the far end, re-enter at own entrance
                leaving = np.where(d > 0, pos[:, 0] >= length, pos[:, 0] <= 0.0)
                for k in np.nonzero(leaving)[0]:
                    sim.mark_agent_for_removal(ids[k])
                    (rqueue if agents[ids[k]][3] else queue)[int(d[k])] += 1
                    del agents[ids[k]]
                keep = ~leaving
                ids = [a for a, kk in zip(ids, keep) if kk]
                pos, d, g = pos[keep], d[keep], g[keep]
                tx, ty = steer_targets(pos, d, g, beta, width, length, radius, rule)
                if robots and policy != R.HUMAN:
                    isr = np.array([agents[a][3] for a in ids], dtype=bool)
                    if isr.any():
                        rg = np.array([agents[a][4] for a in ids], dtype=float)
                        rtx, rty = R.robot_targets(pos, d, rg, isr, policy, width, length, radius)
                        tx, ty = tx.copy(), ty.copy()
                        tx[isr], ty[isr] = rtx, rty
                for a, xx, yy in zip(ids, tx, ty):
                    sim.agent(a).target = (float(xx), float(yy))
            for dd in (1, -1):
                for _ in range(queue[dd]):
                    x0 = entry_x(rng, dd, length, entry)
                    y0 = rng.uniform(e_lo, e_hi) if e_hi > e_lo else width / 2
                    if len(pos) and np.min((pos[:, 0] - x0) ** 2 + (pos[:, 1] - y0) ** 2) < CLEARANCE ** 2:
                        break
                    try:
                        add(x0, y0, dd, desired_speeds(rng, 1)[0], True)
                    except RuntimeError:
                        # AVM/CFSM check contact on entry; a walker marked for removal is still
                        # present until the next step, so wait for room (SF never raises here)
                        break
                    queue[dd] -= 1
                    pos = np.vstack([pos, [x0, y0]]) if len(pos) else np.array([[x0, y0]])
                for _ in range(rqueue[dd]):
                    x0 = entry_x(rng, dd, length, entry)
                    y0 = rng.uniform(e_lo, e_hi) if e_hi > e_lo else width / 2
                    if len(pos) and np.min((pos[:, 0] - x0) ** 2 + (pos[:, 1] - y0) ** 2) < CLEARANCE ** 2:
                        break
                    try:
                        add(x0, y0, dd, desired_speeds(rng, 1)[0] if people_speed else v_robot, True,
                            robot=True)
                    except RuntimeError:
                        break
                    rqueue[dd] -= 1
                    pos = np.vstack([pos, [x0, y0]]) if len(pos) else np.array([[x0, y0]])
        if it % rec_n == 0 and t >= warmup:
            if tracker is not None:
                tids = list(agents)
                tpos = np.array([sim.agent(a).position for a in tids]) if tids else np.zeros((0, 2))
                tracker.update(tids, tpos, np.array([agents[a][0] for a in tids], dtype=float),
                               np.array([agents[a][3] for a in tids], dtype=bool))
            for a, (d, _, new, robot, _) in agents.items():
                if not new:
                    continue
                x, y = sim.agent(a).position
                if lo_x <= x <= hi_x:
                    if robot:
                        rsamples.setdefault(a, []).append((round(t / record_every), x, y))
                        continue
                    samples.setdefault(a, []).append((round(t / record_every), x, y))
                    dirs_of[a] = d
        try:
            sim.iterate()
        except RuntimeError:  # a walker pushed through a wall at high density: count it, drop the run
            out = measure({}, {}, width, record_every)
            out["failed"] = 1
            return out
    out = measure(samples, dirs_of, width, record_every)
    out["failed"] = 0
    if tracker is not None:
        out.update(tracker.summary())
        rws = {a: (1, [(f, y * 100.0, x * 100.0) for f, x, y in s]) for a, s in rsamples.items()
               if len(s) >= 10}
        out["robot_speed"] = L.median(L.walker_speeds(rws, 1.0 / record_every, round(1.0 / record_every)))
        out["robot_transits"] = sum(1 for s in rsamples.values() if abs(s[-1][1] - s[0][1]) >= TRANSIT_MIN)
    return out


def measure(samples, dirs_of, width, record_every):
    """Per-run statistics with the milestone 1 and 2 definitions."""
    walkers = {}
    for a, s in samples.items():
        if len(s) < 10:
            continue
        if abs(s[-1][1] - s[0][1]) < 2.0:
            continue
        walkers[a] = (dirs_of[a], s)
    offs = [sum(right_offset(y, d, width) for _, _, y in s) / len(s) for d, s in walkers.values()]
    flags = [1 if o > 0 else 0 for o in offs]
    # lane order on frames every 0.5 s, via lanes.py in its own frame (cm, lateral = W - y)
    step = round(0.5 / record_every)
    ws_cm = {a: (d, [(f, (width - y) * 100.0, x * 100.0) for f, x, y in s]) for a, (d, s) in walkers.items()}
    frames = L.frames_by_time(ws_cm, step=step)
    lane = L.lane_order(frames) if len(frames) >= 10 else float("nan")
    lag = round(1.0 / record_every)
    speeds = L.walker_speeds(ws_cm, 1.0 / record_every, lag)
    n_sec = {}
    for d, s in walkers.values():
        for f, _, _ in s:
            n_sec[f] = n_sec.get(f, 0) + 1
    crossed = [s for d, s in walkers.values() if abs(s[-1][1] - s[0][1]) >= TRANSIT_MIN]
    transits = [(s[-1][0] - s[0][0]) * record_every for s in crossed]
    # milestone 6g: the section density each crossing walker saw, averaged over its own frames
    seen = [sum(n_sec[f] for f, _, _ in s) / len(s) / (2 * SECTION_HALF * width) for s in crossed]
    dens = (sum(n_sec.values()) / len(n_sec) / (2 * SECTION_HALF * width)) if n_sec else float("nan")
    return dict(walkers=len(walkers), share=(sum(flags) / len(flags)) if flags else float("nan"),
                lane=lane, lane_frames=len(frames), speed=L.median(speeds), density=dens, flags=flags,
                transit=(sum(transits) / len(transits)) if transits else float("nan"),
                transits=len(transits),
                transit_density=(sum(seen) / len(seen)) if seen else float("nan"))
