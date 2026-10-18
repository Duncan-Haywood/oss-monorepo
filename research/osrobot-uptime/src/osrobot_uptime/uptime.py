"""Availability-priced fleets: dedicated robot per job against one shared robot, on top of osrobot-reconfig (imported unchanged).

osrobot-reconfig priced the cheapest fleet that meets the load. Here every unit also fails: it is up with probability A
(= MTBF / (MTBF + MTTR), independent across units, unlimited repair crews, a spare takes over at once and at no cost).
A fleet of n units of which m are needed is "up" with probability P(Binomial(n, A) >= m). The extra units are spares.
Two service targets T are priced:
  per-job : each job separately is served in full with probability >= T (a dedicated shop spares each job on its own);
  all-jobs: every job is served in full at once with probability >= T (jobs feed one product, so any stop stops the line).
Dedicated jobs fail independently, so the all-jobs target needs each job at T**(1/J). A shared robot fails for every job at
once, so both targets are the same single requirement. Capital cost only; all figures are assumptions. Standard library only.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "osrobot-reconfig", "src"))
from osrobot_reconfig import fleet as F  # noqa: E402
from osrobot_specialise import model as M  # noqa: E402


def availability(mtbf_h, mttr_h):
    return mtbf_h / (mtbf_h + mttr_h)


def p_up(n, m, A):
    """P(at least m of n independent units are up), each up with probability A."""
    return sum(math.comb(n, k) * A ** k * (1 - A) ** (n - k) for k in range(m, n + 1))


def units_for(m, A, target, cap=64):
    """Fewest units n >= m with P(>= m up) >= target; None if A == 0 or the cap is hit."""
    for n in range(m, cap + 1):
        if p_up(n, m, A) >= target - 1e-12:
            return n
    return None


def dedicated_plan(job, phi):
    """(kind, unit cost, units needed) of the cheapest feasible robot for one job, as osrobot_reconfig.fleet.dedicated picks it."""
    g_rate, g_ok = F.gantry_rate(job["L"], job["tol"])
    best = None
    if g_ok >= F.MIN_SUCCESS:
        u = math.ceil(phi - 1e-9)
        best = ("gantry", M.gantry_cost(job["L"]), u)
    a = M.evaluate("arm", job["L"], job["tol"], n=F.N_SAMPLES, seed=1)
    if a is not None and a["success"] >= F.MIN_SUCCESS:
        u = math.ceil(phi * g_rate / a["picks_per_h"] - 1e-9)
        if best is None or a["cost"] * u < best[1] * best[2]:
            best = ("arm", a["cost"], u)
    return best


def shared_plans(jobs, phi, changeover_s):
    """{'shared_gantry': (unit cost, units), 'shared_arm': (unit cost, units)} for the feasible shared options."""
    out = {}
    cost = F.shared_gantry(jobs, phi, changeover_s)
    if cost is not None:
        xs0 = min(j["centre"][0] - j["L"] / 2 for j in jobs); xs1 = max(j["centre"][0] + j["L"] / 2 for j in jobs)
        ys0 = min(j["centre"][1] - j["L"] / 2 for j in jobs); ys1 = max(j["centre"][1] + j["L"] / 2 for j in jobs)
        unit = M.G["cost_fixed"] + M.G["cost_per_m"] * ((xs1 - xs0) + (ys1 - ys0))
        out["shared_gantry"] = (unit, round(cost / unit))
    cost = F.shared_arm(jobs, phi, changeover_s)
    if cost is not None:
        R = max(F.tray_reach(j["L"], j["centre"]) for j in jobs)
        unit = M.arm_cost(R)
        out["shared_arm"] = (unit, round(cost / unit))
    return out


def priced(jobs, phi, changeover_s, A, target):
    """Capital cost of each option meeting the target under both readings, plus the bare (no-spare) cost.

    Returns {option: dict(bare, per_job, all_jobs)}; None where the option is infeasible or cannot reach the target."""
    J = len(jobs)
    plans = [dedicated_plan(j, phi) for j in jobs]
    out = {}
    if all(p is not None for p in plans):
        bare = sum(c * m for _, c, m in plans)
        res = dict(bare=bare)
        for key, t in (("per_job", target), ("all_jobs", target ** (1.0 / J))):
            ns = [units_for(m, A, t) for _, _, m in plans]
            res[key] = None if None in ns else sum(c * n for (_, c, _), n in zip(plans, ns))
        out["dedicated"] = res
    for name, (unit, m) in shared_plans(jobs, phi, changeover_s).items():
        n = units_for(m, A, target)
        out[name] = dict(bare=unit * m, per_job=None if n is None else unit * n, all_jobs=None if n is None else unit * n)
    return out


def cheapest(table, key):
    """Cheapest option under `key` ('bare', 'per_job' or 'all_jobs'); a tie within 1e-9 goes to dedicated, shared gantry, arm."""
    live = {k: v[key] for k, v in table.items() if v[key] is not None}
    low = min(live.values())
    return next(k for k in ("dedicated", "shared_gantry", "shared_arm") if k in live and live[k] <= low + 1e-9)


def survey(J, scatter, phi, changeover_s, A, target, trials, seed, **job_kw):
    """Monte-Carlo over random job mixes: how often dedicated is cheapest bare, per-job and all-jobs, and the median cost
    of the cheapest shared option over dedicated under each reading."""
    import random
    rng = random.Random(seed)
    wins = {k: 0 for k in ("bare", "per_job", "all_jobs")}
    ratio = {k: [] for k in wins}
    for _ in range(trials):
        t = priced(F.random_jobs(J, scatter, rng, **job_kw), phi, changeover_s, A, target)
        for k in wins:
            wins[k] += cheapest(t, k) == "dedicated"
            sh = [v[k] for n, v in t.items() if n != "dedicated" and v[k] is not None]
            if sh:
                ratio[k].append(min(sh) / t["dedicated"][k])
    med = lambda xs: sorted(xs)[len(xs) // 2] if xs else None
    return dict(J=J, scatter=scatter, phi=phi, changeover_s=changeover_s, A=A, target=target, trials=trials,
                ded_wins=wins, med_ratio={k: med(v) for k, v in ratio.items()})
