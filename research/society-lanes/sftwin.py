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

Milestone 5 adds robots (`robot_n`, `robot_policy`, `robot_speed`): agents of the same model and
body radius that never take the side bias, walk at a fixed desired speed and steer by one of the
policies in `ROBOT_POLICIES` ("crowd": hold the quarter-width lane on their own right, the crowd's
convention; "opposite": the quarter-width lane on their own left; "adapt": the lane on whichever
side most same-direction walkers within ADAPT_RANGE take, re-read every steering step; "goal": a
lateral exit at 0.25 or 0.75 of the width, drawn 50/50 at entry, approached like an assigned
walker's). A robot that leaves re-enters as a robot. Robots are excluded from every human
statistic; `measure` adds robot passes and close passes (centre distance under CLOSE_PASS between
a human and a robot, each pair counted once). With robot_n = 0 the run is unchanged, draw for draw.

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
CLEARANCE = 0.55     # m: free space needed to enter
RADIUS = 0.25        # m: lower end of the 0.5-0.7 m diameters of Helbing et al. (2000); the
                     # JuPedSim default 0.3 m cannot pack to the 3.8/m2 measured in BaSiGo b_08
AVM_RADIUS = 0.2     # m: JuPedSim 1.4.2 default for the anticipation velocity model
CFSM_RADIUS = 0.2    # m: JuPedSim 1.4.2 default for the collision-free speed model
CFSM_TIME_GAP = 1.0  # s: JuPedSim 1.4.2 default
MODELS = ("sf", "avm", "cfsm")
RULES = ("always", "yield", "scaled")
ROBOT_POLICIES = ("crowd", "opposite", "adapt", "goal")
ROBOT_MERGE = 4.0    # m: a lane-holding robot closes on its lane over this distance ahead
ADAPT_RANGE = 5.0    # m: "adapt" reads same-direction walkers within this distance along x
CLOSE_PASS = 0.5     # m: centre distance counted as a close pass (proposal, Evaluation)
NEAR_PASS = 1.0      # m: a wider reading, inside Hall's (1966) 0.45-1.2 m personal distance


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


def steer_targets(pos, dirs, goal_y, beta, width, length, radius=RADIUS, rule="always", robot=None):
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
        if robot is not None:
            w = np.where(robot, 0.0, w)   # robots never take the human side bias
        ty = ty + np.where(oncoming, -dirs * beta * w * TARGET_AHEAD, 0.0)
    tx = np.clip(tx, -1.4, length + 1.4)
    ty = np.clip(ty, radius + 0.05, width - radius - 0.05)
    return tx, ty


def lane_y(d, side, width):
    """Centre of the quarter-width lane on a walker's own right (side=+1) or left (side=-1)."""
    return width / 2.0 - d * side * width / 4.0


def adapt_sides(pos, dirs, robot, width, current):
    """Per robot: +1 (right) or -1 (left), the side most same-direction humans nearby walk on.

    Humans of the robot's own direction within ADAPT_RANGE along x vote with the sign of their
    offset toward their own right; a tie or no humans keeps `current`.
    """
    out = np.array(current, dtype=float)
    hum = ~robot
    for k in np.nonzero(robot)[0]:
        near = hum & (dirs == dirs[k]) & (np.abs(pos[:, 0] - pos[k, 0]) <= ADAPT_RANGE)
        if near.any():
            v = np.sign(right_offset(pos[near, 1], dirs[k], width)).sum()
            if v != 0:
                out[k] = np.sign(v)
    return out


def robot_targets(pos, dirs, goal_y, length):
    """Lane-holding robots close on goal_y over ROBOT_MERGE metres rather than the whole corridor."""
    end = np.where(dirs > 0, length, 0.0)
    dist = np.clip((end - pos[:, 0]) * dirs, TARGET_AHEAD, ROBOT_MERGE)
    return pos[:, 1] + (goal_y - pos[:, 1]) * TARGET_AHEAD / dist


def right_offset(y, d, width):
    """Offset toward own right, in half-widths: heading +x the right is small y."""
    half = width / 2.0
    return -d * (y - half) / half


def simulate(n_walkers, width, length, entrance, beta, seed, goals=False,
             warmup=40.0, duration=160.0, dt=0.01, steer_every=0.1, record_every=0.1,
             model="sf", exit_frac=0.25, rule="always", robot_n=0, robot_policy="crowd",
             robot_speed=0.9, track_close=False):
    """Run one closed-loop corridor. Returns per-run statistics (dict).

    model: "sf" (JuPedSim SocialForceModel, Helbing et al. 2000 defaults, radius 0.25 m) or
    "avm" (JuPedSim AnticipationVelocityModel, Xu, Chraibi and Seyfried 2021, JuPedSim
    defaults). exit_frac: with goals, an assigned walker aims at the far end at this fraction
    of the width from the left or the right wall (50/50).
    """
    import jupedsim as jps

    if model not in MODELS:
        raise ValueError(f"model must be one of {MODELS}")
    if rule not in RULES:
        raise ValueError(f"rule must be one of {RULES}")
    if robot_n and robot_policy not in ROBOT_POLICIES:
        raise ValueError(f"robot_policy must be one of {ROBOT_POLICIES}")
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
    agents = {}  # id -> [dir, goal_y, born_after_start, is_robot]

    def goal_for(d):
        if not goals:
            return math.nan
        return width * (exit_frac if rng.random() < 0.5 else 1.0 - exit_frac)

    def robot_goal(d):
        if robot_policy == "goal":
            return width * (0.25 if rng.random() < 0.5 else 0.75)
        if robot_policy == "opposite":
            return lane_y(d, -1, width)
        return lane_y(d, 1, width)   # crowd; adapt starts on the crowd's side

    def add(x, y, d, v0, new, bot=False):
        if bot:
            v0 = robot_speed
        if model == "sf":
            par = jps.SocialForceModelAgentParameters(
                journey_id=journey, stage_id=stage, position=(float(x), float(y)),
                orientation=(float(d), 0.0), desired_speed=float(v0), radius=radius)
        elif model == "cfsm":
            par = jps.CollisionFreeSpeedModelAgentParameters(
                journey_id=journey, stage_id=stage, position=(float(x), float(y)),
                time_gap=CFSM_TIME_GAP, desired_speed=float(v0), radius=radius)
        else:
            par = jps.AnticipationVelocityModelAgentParameters(
                journey_id=journey, stage_id=stage, position=(float(x), float(y)),
                desired_speed=float(v0), radius=radius)
        aid = sim.add_agent(par)
        agents[aid] = [d, robot_goal(d) if bot else goal_for(d), new, bot]

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
    queue = {1: [], -1: []}   # per direction, the kinds waiting to enter (True: robot), in order
    for k, p in enumerate(placed):
        d0 = 1 if k % 2 == 0 else -1
        bot = k < robot_n     # robots alternate direction like everyone else
        try:
            add(p[0], p[1], d0, v0s[k], False, bot)
        except RuntimeError:  # AVM/CFSM refuse overlapping placement: the walker enters later instead
            queue[d0].append(bot)
    e_lo = max(radius + 0.05, width / 2 - entrance / 2)
    e_hi = min(width - radius - 0.05, width / 2 + entrance / 2)
    steer_n = max(1, round(steer_every / dt))
    rec_n = max(1, round(record_every / dt))
    lo_x, hi_x = length / 2 - SECTION_HALF, length / 2 + SECTION_HALF
    samples = {}   # aid -> list of (t, x, y)
    dirs_of = {}
    rob_samples = {}   # robot aid -> list of (t, x, y), in the section after warm-up
    close = set()      # (human aid, robot aid) pairs that came within CLOSE_PASS
    near = set()       # (human aid, robot aid) pairs that came within NEAR_PASS
    close_hh = set()   # human-human pairs within CLOSE_PASS (the reference rate), if tracked
    track = bool(robot_n) or track_close
    steps = round(duration / dt)
    for it in range(steps + 1):
        t = it * dt
        if it % steer_n == 0:
            ids = list(agents)
            pos = np.array([sim.agent(a).position for a in ids]) if ids else np.zeros((0, 2))
            if ids:
                d = np.array([agents[a][0] for a in ids], dtype=float)
                g = np.array([agents[a][1] for a in ids], dtype=float)
                rb = np.array([agents[a][3] for a in ids], dtype=bool)
                # leave at the far end, re-enter at own entrance
                leaving = np.where(d > 0, pos[:, 0] >= length, pos[:, 0] <= 0.0)
                for k in np.nonzero(leaving)[0]:
                    sim.mark_agent_for_removal(ids[k])
                    queue[int(d[k])].append(bool(rb[k]))
                    del agents[ids[k]]
                keep = ~leaving
                ids = [a for a, kk in zip(ids, keep) if kk]
                pos, d, g, rb = pos[keep], d[keep], g[keep], rb[keep]
                if rb.any() and robot_policy == "adapt":
                    side = np.sign(right_offset(np.nan_to_num(g, nan=width / 2), d, width))
                    side = adapt_sides(pos, d, rb, width, np.where(side == 0, 1.0, side))
                    g = np.where(rb, lane_y(d, side, width), g)
                    for a, gg, r_ in zip(ids, g, rb):
                        if r_:
                            agents[a][1] = float(gg)
                tx, ty = steer_targets(pos, d, g, beta, width, length, radius, rule,
                                       robot=rb if rb.any() else None)
                if rb.any() and robot_policy != "goal":
                    ty = np.where(rb, np.clip(robot_targets(pos, d, g, length), radius + 0.05,
                                              width - radius - 0.05), ty)
                for a, xx, yy in zip(ids, tx, ty):
                    sim.agent(a).target = (float(xx), float(yy))
            for dd in (1, -1):
                while queue[dd]:
                    x0 = 0.35 if dd > 0 else length - 0.35
                    y0 = rng.uniform(e_lo, e_hi) if e_hi > e_lo else width / 2
                    if len(pos) and np.min((pos[:, 0] - x0) ** 2 + (pos[:, 1] - y0) ** 2) < CLEARANCE ** 2:
                        break
                    try:
                        add(x0, y0, dd, desired_speeds(rng, 1)[0], True, queue[dd][0])
                    except RuntimeError:
                        # AVM/CFSM check contact on entry; a walker marked for removal is still
                        # present until the next step, so wait for room (SF never raises here)
                        break
                    queue[dd].pop(0)
                    pos = np.vstack([pos, [x0, y0]]) if len(pos) else np.array([[x0, y0]])
        if it % rec_n == 0 and t >= warmup:
            hum_now, rob_now = [], []
            for a, (d, _, new, bot) in agents.items():
                if not (new or bot):
                    continue
                x, y = sim.agent(a).position
                if lo_x <= x <= hi_x:
                    if bot:
                        rob_samples.setdefault(a, []).append((round(t / record_every), x, y))
                        rob_now.append((a, x, y))
                        continue
                    samples.setdefault(a, []).append((round(t / record_every), x, y))
                    dirs_of[a] = d
                    hum_now.append((a, x, y))
            if track and len(hum_now) > 1:
                hp = np.array([[x, y] for _, x, y in hum_now])
                d2 = ((hp[:, None, :] - hp[None, :, :]) ** 2).sum(-1)
                ii, jj = np.nonzero(np.triu(d2 < CLOSE_PASS ** 2, 1))
                for i_, j_ in zip(ii, jj):
                    close_hh.add((hum_now[i_][0], hum_now[j_][0]))
            for rid, rx, ry in rob_now:
                for hid, hx, hy in hum_now:
                    d2r = (hx - rx) ** 2 + (hy - ry) ** 2
                    if d2r < NEAR_PASS ** 2:
                        near.add((hid, rid))
                        if d2r < CLOSE_PASS ** 2:
                            close.add((hid, rid))
        try:
            sim.iterate()
        except RuntimeError:  # a walker pushed through a wall at high density: count it, drop the run
            out = measure({}, {}, width, record_every)
            out["failed"] = 1
            if track:
                out.update(robot_measure({}, set(), set(), record_every))
                out.update(human_transit({}, record_every))
                out["close_hh"] = 0
            return out
    out = measure(samples, dirs_of, width, record_every)
    out["failed"] = 0
    if track:
        out.update(robot_measure(rob_samples, close, near, record_every))
        out.update(human_transit(samples, record_every))
        out["close_hh"] = len(close_hh)
    return out


def human_transit(samples, record_every):
    """Mean human walking speed through the section: x travelled over time, walkers as in measure."""
    v = []
    for s in samples.values():
        if len(s) < 10 or abs(s[-1][1] - s[0][1]) < 2.0:
            continue
        dt = (s[-1][0] - s[0][0]) * record_every
        if dt > 0:
            v.append(abs(s[-1][1] - s[0][1]) / dt)
    return dict(human_vbar=(sum(v) / len(v)) if v else float("nan"))


def robot_measure(rob_samples, close, near, record_every):
    """Robot passes (section crossings of at least 2 m) and close passes with humans."""
    passes, v = 0, []
    for s in rob_samples.values():
        if len(s) < 10 or abs(s[-1][1] - s[0][1]) < 2.0:
            continue
        passes += 1
        dt = (s[-1][0] - s[0][0]) * record_every
        if dt > 0:
            v.append(abs(s[-1][1] - s[0][1]) / dt)
    return dict(robot_passes=passes, close_passes=len(close), near_passes=len(near),
                robot_vbar=(sum(v) / len(v)) if v else float("nan"))


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
    dens = (sum(n_sec.values()) / len(n_sec) / (2 * SECTION_HALF * width)) if n_sec else float("nan")
    return dict(walkers=len(walkers), share=(sum(flags) / len(flags)) if flags else float("nan"),
                lane=lane, lane_frames=len(frames), speed=L.median(speeds), density=dens, flags=flags)
