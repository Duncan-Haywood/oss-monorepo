"""Dedicated robot per job against one shared robot, on top of osrobot-specialise (imported from ../osrobot-specialise/src).

A shop has J pick-and-place jobs. Job j is an L_j x L_j tray whose centre sits at (x_j, y_j) from a common origin, with a
placement tolerance tol_j and a demand of phi * (the good picks per hour a dedicated gantry would deliver on it).
Options, compared on capital cost (arbitrary units from osrobot-specialise; every figure is assumed):
  dedicated : one cheapest-feasible robot (gantry or arm, from osrobot-specialise) per job, ceil(load) units each;
  shared gantry : one gantry spanning the bounding box of all trays, its cycle on a job as in the dedicated gantry;
  shared arm : one arm at the origin, reach = farthest tray corner, cycle from the arm's real joint moves at each tray.
A shared robot loses `changeover_s` seconds per job per 8 h shift, spread over J jobs. A robot with success < MIN_SUCCESS on
a job cannot do it. Standard library only; lengths in m, time in s.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "osrobot-specialise", "src"))
from osrobot_specialise import model as M  # noqa: E402

MIN_SUCCESS = 0.9   # ASSUMED: a robot below this success rate on a job is not used for it
SHIFT_S = 8 * 3600.0
N_SAMPLES = 200


def _job_points(L, centre, n, seed):
    return [((a[0] + centre[0], a[1] + centre[1]), (b[0] + centre[0], b[1] + centre[1]))
            for a, b in M.sample_job(L, n, seed)]


def gantry_rate(L, tol, n=N_SAMPLES, seed=1):
    """Good picks per hour of a gantry on an L tray (position-independent), and its success rate."""
    r = M.evaluate("gantry", L, tol, n=n, seed=seed)
    return r["picks_per_h"], r["success"]


def arm_rate(R, L, centre, tol, n=N_SAMPLES, seed=1):
    """(good picks/h, success) of an arm of reach R at the origin on an L tray centred at `centre`; None if out of reach."""
    zt, _ = M.z_cycle()
    tt = 0.0
    for pick, place in _job_points(L, centre, n, seed):
        r1, r2 = M.arm_move(R, pick, place), M.arm_move(R, place, pick)
        if r1 is None or r2 is None:
            return None
        tt += r1[0] + r2[0] + 2 * zt
    t = tt / n
    ok = M.p_inside(tol, M.A["sigma_angle"] * R) ** 2
    return 3600.0 / t * ok, ok


def tray_reach(L, centre):
    """Distance from the origin to the farthest corner of the tray (the reach an origin-based arm needs)."""
    return max(math.hypot(abs(centre[0]) + L / 2, abs(centre[1]) + L / 2), 1e-9)


def random_jobs(J, scatter, rng, sides=(0.1, 0.4), tols=(0.001, 0.002, 0.005)):
    """J jobs: side uniform in `sides`, tolerance from `tols`, centre at a random angle and distance <= scatter."""
    jobs = []
    for _ in range(J):
        d, a = scatter * math.sqrt(rng.random()), rng.uniform(0, 2 * math.pi)
        jobs.append(dict(L=rng.uniform(*sides), tol=rng.choice(tols), centre=(d * math.cos(a), d * math.sin(a))))
    return jobs


def dedicated(jobs, phi):
    """(total cost, per-job design list) of one cheapest feasible robot per job, ceil(phi * rate/rate_robot) units each.
    The arm is centred on its own tray. None if some job has no feasible robot (does not happen for the gantry)."""
    total, picks = 0.0, []
    for j in jobs:
        g_rate, g_ok = gantry_rate(j["L"], j["tol"])
        best = None
        if g_ok >= MIN_SUCCESS:
            best = ("gantry", M.gantry_cost(j["L"]) * math.ceil(phi - 1e-9))
        a = M.evaluate("arm", j["L"], j["tol"], n=N_SAMPLES, seed=1)
        if a is not None and a["success"] >= MIN_SUCCESS:
            units = math.ceil(phi * g_rate / a["picks_per_h"] - 1e-9)
            if best is None or a["cost"] * units < best[1]:
                best = ("arm", a["cost"] * units)
        if best is None:
            return None
        total += best[1]
        picks.append(best[0])
    return total, picks


def shared_gantry(jobs, phi, changeover_s):
    """Cost of one shared gantry (xN units) spanning the bounding box of all trays; None if the load cannot be met."""
    xs0 = min(j["centre"][0] - j["L"] / 2 for j in jobs)
    xs1 = max(j["centre"][0] + j["L"] / 2 for j in jobs)
    ys0 = min(j["centre"][1] - j["L"] / 2 for j in jobs)
    ys1 = max(j["centre"][1] + j["L"] / 2 for j in jobs)
    cost = M.G["cost_fixed"] + M.G["cost_per_m"] * ((xs1 - xs0) + (ys1 - ys0))
    load = phi * len(jobs)                       # in units of "one dedicated gantry busy", gantry rate is the same
    for j in jobs:
        if gantry_rate(j["L"], j["tol"])[1] < MIN_SUCCESS:
            return None
    load /= max(1e-9, 1.0 - len(jobs) * changeover_s / SHIFT_S)
    if len(jobs) * changeover_s >= SHIFT_S:
        return None
    return cost * math.ceil(load - 1e-9)


def shared_arm(jobs, phi, changeover_s):
    """Cost of one shared arm (xN units) at the origin reaching every tray; None if unreachable, too big or too imprecise."""
    R = max(tray_reach(j["L"], j["centre"]) for j in jobs)
    if R > M.A["r_max"] or len(jobs) * changeover_s >= SHIFT_S:
        return None
    load = 0.0
    for j in jobs:
        g_rate, _ = gantry_rate(j["L"], j["tol"])
        r = arm_rate(R, j["L"], j["centre"], j["tol"])
        if r is None or r[1] < MIN_SUCCESS:
            return None
        load += phi * g_rate / r[0]
    load /= 1.0 - len(jobs) * changeover_s / SHIFT_S
    return M.arm_cost(R) * math.ceil(load - 1e-9)


def compare(jobs, phi, changeover_s):
    """Costs of the three options (None where infeasible) for one job mix."""
    d = dedicated(jobs, phi)
    return dict(dedicated=None if d is None else d[0],
                shared_gantry=shared_gantry(jobs, phi, changeover_s),
                shared_arm=shared_arm(jobs, phi, changeover_s))


def best_option(costs):
    """Cheapest option; a tie within 1e-9 goes to dedicated, then to the shared gantry."""
    live = {k: v for k, v in costs.items() if v is not None}
    low = min(live.values())
    return next(k for k in ("dedicated", "shared_gantry", "shared_arm") if k in live and live[k] <= low + 1e-9)


def survey(J, scatter, phi, changeover_s, trials, seed, **job_kw):
    """Monte-Carlo over random job mixes: how often each option is cheapest, and the median cost ratio to dedicated."""
    rng = random.Random(seed)
    wins = {"dedicated": 0, "shared_gantry": 0, "shared_arm": 0}
    ratios = {"shared_gantry": [], "shared_arm": []}
    arm_feasible = 0
    for _ in range(trials):
        c = compare(random_jobs(J, scatter, rng, **job_kw), phi, changeover_s)
        wins[best_option(c)] += 1
        for k in ratios:
            if c[k] is not None:
                ratios[k].append(c[k] / c["dedicated"])
        arm_feasible += c["shared_arm"] is not None
    med = lambda xs: sorted(xs)[len(xs) // 2] if xs else None
    return dict(J=J, scatter=scatter, phi=phi, changeover_s=changeover_s, trials=trials,
                wins=wins, med_gantry=med(ratios["shared_gantry"]), med_arm=med(ratios["shared_arm"]),
                arm_feasible=arm_feasible)
