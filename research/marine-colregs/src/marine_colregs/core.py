"""Kinematic two-ship encounters, COLREGs role classification, three planners.

Headings are compass degrees (0 = north, clockwise); positions in metres (x east, y north).
Own ship: constant speed through water, rate-limited heading. Target: constant course and speed
(the worst case for a stand-on test: it never gives way).
"""
import math, random

D_SAFE = 100.0      # required passing distance (m); a sweep parameter, not a legal figure
TURN_RATE = 6.0     # deg/s own heading rate limit (placeholder for a small boat)
DT = 1.0
WAYPOINT = (0.0, 3000.0)
STANDON_RANGE = 300.0   # stand-on vessel acts only inside this range (Rule 17a/b); swept
ACT_RANGE = 900.0   # planners ignore targets farther than this (sensor/horizon limit)


def wrap(a):
    return (a + 180.0) % 360.0 - 180.0


def vel(speed, hdg):
    h = math.radians(hdg)
    return speed * math.sin(h), speed * math.cos(h)


def cpa(p, v):
    """(distance, time) of closest approach of relative position p, relative velocity v (target - own)."""
    vv = v[0] ** 2 + v[1] ** 2
    t = 0.0 if vv < 1e-12 else max(0.0, -(p[0] * v[0] + p[1] * v[1]) / vv)
    return math.hypot(p[0] + v[0] * t, p[1] + v[1] * t), t


def classify(op, oh, os_, tp, th, ts):
    """COLREGs role of own ship: 'headon', 'giveway', 'standon', 'overtaking' (own overtakes: give way),
    'overtaken' (target overtakes: stand on)."""
    rel = (tp[0] - op[0], tp[1] - op[1])
    brg_t = wrap(math.degrees(math.atan2(rel[0], rel[1])) - oh)        # target bearing off own bow
    brg_o = wrap(math.degrees(math.atan2(-rel[0], -rel[1])) - th)      # own bearing off target bow
    if abs(brg_o) > 112.5 and abs(brg_t) < 90 and os_ > ts - 1e-9:     # own astern of target, closing
        return "overtaking"
    if abs(brg_t) > 112.5 and abs(brg_o) < 90 and ts > os_ - 1e-9:
        return "overtaken"
    if abs(brg_t) < 15 and abs(wrap(th - oh - 180.0)) <= 6.0:
        return "headon"
    return "giveway" if 0 < brg_t < 112.5 else "standon"


def make_encounter(kind, rel_course, speed_ratio, offset, own_speed=4.0, t_c=250.0):
    """Own ship from the origin heading north. The target would meet own ship's straight track at
    time t_c, shifted by `offset` metres across the target's track. kind only places the geometry;
    the role is always recomputed by classify()."""
    th = rel_course % 360.0
    ts = own_speed * speed_ratio
    meet = (0.0, own_speed * t_c)
    d = vel(1.0, th)
    perp = (d[1], -d[0])
    tp = (meet[0] - ts * d[0] * t_c + offset * perp[0], meet[1] - ts * d[1] * t_c + offset * perp[1])
    return dict(kind=kind, op=(0.0, 0.0), oh=0.0, os=own_speed, tp=tp, th=th, ts=ts)


def goal_heading(p):
    return math.degrees(math.atan2(WAYPOINT[0] - p[0], WAYPOINT[1] - p[1])) % 360.0


# ---------------------------------------------------------------- planners
def plan_none(s, role, rng):
    return goal_heading(s["p"])


def plan_rule(s, role, rng):
    """Rule-based: if a give-way vessel with a predicted CPA < D_SAFE, take a bold 35 deg starboard turn
    and hold it until the target is past; a stand-on vessel holds course until 300 m, then turns starboard."""
    g = goal_heading(s["p"])
    rel = (s["tp"][0] - s["p"][0], s["tp"][1] - s["p"][1])
    rng_ = math.hypot(*rel)
    ov, tv = vel(s["os"], s["h"]), vel(s["ts"], s["th"])
    d, tc = cpa(rel, (tv[0] - ov[0], tv[1] - ov[1]))
    # "past": target now behind own track direction and opening
    opening = rel[0] * (tv[0] - ov[0]) + rel[1] * (tv[1] - ov[1]) > 0
    if s.get("turning") and opening and rng_ > 150:
        s["turning"] = False
    if s.get("turning"):
        return (s["g0"] + 35.0) % 360.0
    trigger = ACT_RANGE if role in ("giveway", "headon", "overtaking") else STANDON_RANGE
    if rng_ < trigger and d < D_SAFE and not opening:
        s["turning"], s["g0"] = True, g
        return (g + 35.0) % 360.0
    return g


def _cpa_for_heading(s, h, tv):
    ov = vel(s["os"], h)
    rel = (s["tp"][0] - s["p"][0], s["tp"][1] - s["p"][1])
    return cpa(rel, (tv[0] - ov[0], tv[1] - ov[1]))


def plan_vo(s, role, rng):
    """Velocity-obstacle: smallest deviation from the goal heading whose constant-velocity CPA >= D_SAFE.
    Give-way/head-on: starboard or zero deviation only. Stand-on: keeps course until 300 m."""
    g = goal_heading(s["p"])
    rel = (s["tp"][0] - s["p"][0], s["tp"][1] - s["p"][1])
    r = math.hypot(*rel)
    if r > ACT_RANGE or (role in ("standon", "overtaken") and r > STANDON_RANGE):
        return g
    tv = s["tv_est"]
    cands = sorted(range(-90, 91, 5), key=lambda x: (abs(x), -x))
    if role in ("giveway", "headon"):
        cands = [x for x in cands if x >= 0]
    for dev in cands:
        d, _ = _cpa_for_heading(s, (g + dev) % 360.0, tv)
        if d >= D_SAFE * 1.1:
            return (g + dev) % 360.0
    return (g + (90 if role in ("giveway", "headon") else cands[-1])) % 360.0


def plan_mpc(s, role, rng, w=(1.0, 0.02, 3.0), horizon=150):
    """Sampling MPC: first leg of 25 s at a sampled offset from the goal heading, then back to goal.
    Cost = w0*shortfall^2/D_SAFE^2*1e3 + w1*extra path + w2*port-turn penalty (give-way/head-on)."""
    g = goal_heading(s["p"])
    rel = (s["tp"][0] - s["p"][0], s["tp"][1] - s["p"][1])
    r = math.hypot(*rel)
    if r > ACT_RANGE or (role in ("standon", "overtaken") and r > STANDON_RANGE):
        return g
    tv = s["tv_est"]
    best, bc = g, 1e18
    for dev in range(-70, 71, 5):
        p = list(s["p"]); h = s["h"]; tp = list(s["tp"]); mind = 1e9; path = 0.0
        for t in range(horizon):
            tgt = (g + dev) % 360.0 if t < 25 else goal_heading(p)
            h += max(-TURN_RATE, min(TURN_RATE, wrap(tgt - h))) * DT
            v = vel(s["os"], h)
            p[0] += v[0] * DT; p[1] += v[1] * DT; path += s["os"] * DT
            tp[0] += tv[0] * DT; tp[1] += tv[1] * DT
            mind = min(mind, math.hypot(tp[0] - p[0], tp[1] - p[1]))
        short = max(0.0, D_SAFE * 1.1 - mind)
        extra = path - math.hypot(WAYPOINT[0] - p[0], WAYPOINT[1] - p[1]) * 0  # same path length; use deviation
        cost = w[0] * 1e3 * (short / D_SAFE) ** 2 + w[1] * abs(dev) * 10 + (w[2] * 10 if dev < 0 and role in ("giveway", "headon") else 0)
        if cost < bc:
            bc, best = cost, (g + dev) % 360.0
    return best


PLANNERS = {"none": plan_none, "rule": plan_rule, "vo": plan_vo, "mpc": plan_mpc}


# ---------------------------------------------------------------- simulation and scoring
def run(enc, planner, sigma_v=0.0, seed=0, max_t=1500):
    rng = random.Random(seed)
    s = dict(p=list(enc["op"]), h=enc["oh"], os=enc["os"], tp=list(enc["tp"]), th=enc["th"], ts=enc["ts"])
    tv = vel(s["ts"], s["th"])
    role0 = classify(enc["op"], enc["oh"], enc["os"], enc["tp"], enc["th"], enc["ts"])
    mind, path, t, tmin = 1e9, 0.0, 0, 0
    first_turn = None; max_dev_early = 0.0; cross_ahead = False
    prev = tuple(s["p"]); mind_pos = None
    while t < max_t:
        s["tv_est"] = (tv[0] + rng.gauss(0, sigma_v), tv[1] + rng.gauss(0, sigma_v)) if sigma_v else tv
        role = classify(s["p"], s["h"], s["os"], s["tp"], s["th"], s["ts"]) if t == 0 else role0
        if t % 3 == 0:
            cmd = PLANNERS[planner](s, role, rng)   # replan every 3 s, hold the command between
        s["h"] = (s["h"] + max(-TURN_RATE, min(TURN_RATE, wrap(cmd - s["h"]))) * DT) % 360.0
        v = vel(s["os"], s["h"])
        s["p"][0] += v[0] * DT; s["p"][1] += v[1] * DT
        s["tp"][0] += tv[0] * DT; s["tp"][1] += tv[1] * DT
        path += s["os"] * DT
        d = math.hypot(s["tp"][0] - s["p"][0], s["tp"][1] - s["p"][1])
        if d < mind:
            mind, mind_pos = d, ((s["p"][0] - s["tp"][0]), (s["p"][1] - s["tp"][1]))
        dev = wrap(s["h"] - goal_heading(s["p"]))
        if first_turn is None and abs(dev) > 10.0:
            first_turn = dev
        if d > 300.0:
            max_dev_early = max(max_dev_early, abs(dev))
        t += 1
        if math.hypot(WAYPOINT[0] - s["p"][0], WAYPOINT[1] - s["p"][1]) < 30.0:
            break
    straight = math.hypot(WAYPOINT[0] - enc["op"][0], WAYPOINT[1] - enc["op"][1])
    path += math.hypot(WAYPOINT[0] - s["p"][0], WAYPOINT[1] - s["p"][1])   # remaining distance if stopped short
    # passing side: own ship behind target (along target track) at closest approach
    td = vel(1.0, s["th"])
    astern = (mind_pos[0] * td[0] + mind_pos[1] * td[1]) < 0 if mind_pos else False
    if role0 in ("headon", "giveway", "overtaking"):
        ok = (first_turn is None and mind >= D_SAFE) or (first_turn is not None and (first_turn > 0 or role0 == "overtaking"))
        if role0 == "giveway":
            ok = ok and astern
    else:
        ok = max_dev_early <= 5.0
    return dict(role=role0, cpa=mind, compliant=bool(ok), detour=path - straight, safe=mind >= D_SAFE * 0.999)


def encounter_library():
    """Scripted library: head-on, crossing from either side, overtaking and being overtaken."""
    lib = []
    offs = (-100.0, -50.0, 0.0, 50.0, 100.0)
    for o in offs:
        for rc in (174.0, 180.0, 186.0):
            lib.append(make_encounter("headon", rc, 1.0, o))
        for rc in (250.0, 270.0, 290.0):
            for sr in (0.5, 1.0, 1.5):
                lib.append(make_encounter("cross-stbd", rc, sr, o))
        for rc in (70.0, 90.0, 110.0):
            for sr in (0.5, 1.0, 1.5):
                lib.append(make_encounter("cross-port", rc, sr, o))
        lib.append(make_encounter("overtaking", 0.0, 0.5, o))
        lib.append(make_encounter("overtaken", 0.0, 1.5, o))
    return lib
