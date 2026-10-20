"""Print-and-inspect cell with a thresholded print-failure detector (stylised).

P printers, one arm, one inspection station, closed loop at ``wip`` jobs. A job holds a printer
from the start of its load to the end of its unload. While printing, a failure strikes at rate
``fail_rate`` per hour of printing; a print that suffers one is bad however long it runs.

``detector`` is None for blind printing. Otherwise a detector looks at the print every ``period``
minutes and gives a score: N(0, 1) while the print is healthy, N(``dprime``, 1) once it has
failed, independent between looks. It raises an alarm when the score exceeds a threshold ``z``,
so each look on a healthy print false-alarms with probability f = Q(z) and each look on a failed
print is a hit with probability h = Q(z - dprime) (an equal-variance binormal ROC). The first
alarm aborts the print. An aborted or bad print is cleared by the arm (unload time) and the job
goes back to the printer queue. Good prints are inspected (inspection never rejects here, to
isolate print failures) and leave a fresh job in their place. Times are minutes; lognormal noise
with coefficient of variation ``cv`` (0 = deterministic).
"""
import heapq, math
from dataclasses import dataclass
import numpy as np


@dataclass(frozen=True)
class JobType:
    name: str
    print_min: float
    load_min: float = 2.0
    unload_min: float = 2.0
    inspect_min: float = 3.0
    weight: float = 1.0


@dataclass
class CellConfig:
    types: tuple
    printers: int = 4
    wip: int = 6
    cv: float = 0.0
    fail_rate: float = 0.0           # failures per hour of printing
    detector: tuple = None           # None = blind; else (dprime, z, period_min)
    horizon: float = 24 * 60.0
    warmup: float = 4 * 60.0


def _q(x):
    """Upper tail of the standard normal."""
    return 0.5 * math.erfc(x / math.sqrt(2))


def roc(dprime, z):
    """(false-alarm probability, hit probability) per look at threshold z."""
    return _q(z), _q(z - dprime)


def _draw(rng, mean, cv):
    if cv <= 0:
        return mean
    s2 = math.log(1 + cv * cv)
    return mean * math.exp(rng.normal(-s2 / 2, math.sqrt(s2)))


def attempt_stats(T, fail_rate, detector):
    """For a print of T minutes (deterministic): (success probability, mean minutes the printer
    spends printing per attempt, probability the attempt ends on a false alarm). Exact for an
    exponential failure time and independent looks, summed over the number of looks before the
    failure."""
    lam = fail_rate / 60.0
    if detector is None:
        return math.exp(-lam * T), T, 0.0
    dprime, z, p = detector
    f, h = roc(dprime, z)
    m = int(T // p)
    def false_part(j):             # E[time; false alarm within the first j looks], P(false alarm there)
        pf = et = 0.0
        for k in range(1, j + 1):
            w = (1 - f) ** (k - 1) * f
            pf += w; et += w * k * p
        return et, pf
    # healthy to the end
    ph = math.exp(-lam * T)
    et, pf = false_part(m)
    succ = ph * (1 - f) ** m
    E = ph * (et + (1 - f) ** m * T)
    pfalse = ph * pf
    # failure at time t in [j p, (j+1) p): j looks come before it
    for j in range(m + 1):
        pj = math.exp(-lam * j * p) - math.exp(-lam * min((j + 1) * p, T))
        if pj <= 0:
            continue
        et, pf = false_part(j)
        alive = (1 - f) ** j
        e2 = 0.0
        for k in range(j + 1, m + 1):
            e2 += h * (1 - h) ** (k - j - 1) * k * p
        none = (1 - h) ** (m - j)
        E += pj * (et + alive * (e2 + none * T))
        pfalse += pj * pf
    return succ, E, pfalse


def bound(cfg):
    """Utilisation bound on good parts per minute, with the station that sets it. A good part of
    type t needs 1/s_t attempts; each attempt costs one load and one unload of the arm and
    (printing time + load + unload) of a printer; each good part is inspected once."""
    w = np.array([t.weight for t in cfg.types], float); w /= w.sum()
    arm = prn = ins = 0.0
    for wi, t in zip(w, cfg.types):
        s, e, _ = attempt_stats(t.print_min, cfg.fail_rate, cfg.detector)
        arm += wi * (t.load_min + t.unload_min) / s
        prn += wi * (e + t.load_min + t.unload_min) / s
        ins += wi * t.inspect_min
    caps = {"arm": 1 / arm, "printers": cfg.printers / prn, "inspection": 1 / ins}
    b = min(caps, key=caps.get)
    return caps[b], b, caps


def simulate(cfg, seed=0):
    rng = np.random.default_rng(seed)
    w = np.array([t.weight for t in cfg.types], float); w /= w.sum()
    ev, seq = [], 0
    def push(t, kind, job):
        nonlocal seq
        seq += 1
        heapq.heappush(ev, (t, seq, kind, job))
    free_p, arm_busy, insp_busy = cfg.printers, False, False
    q_print, q_arm, q_insp = [], [], []
    busy = {"arm": 0.0, "printers": 0.0, "inspection": 0.0}
    wasted = 0.0                      # printer minutes spent printing on attempts that failed
    done, jobs, jid = [], {}, 0
    lam = cfg.fail_rate / 60.0
    if cfg.detector is not None:
        _dp, _z, per = cfg.detector
        f_, h_ = roc(_dp, _z)

    def new_job(now):
        nonlocal jid
        jid += 1
        jobs[jid] = dict(type=cfg.types[rng.choice(len(cfg.types), p=w)], start=now, attempts=0)
        q_print.append(j_ := jid)
        return j_

    def clip(a, b):
        return max(0.0, min(b, cfg.horizon) - max(a, cfg.warmup))

    def dispatch(now):
        nonlocal free_p, arm_busy, insp_busy
        if not insp_busy and q_insp:
            j = q_insp.pop(0); insp_busy = True
            d = _draw(rng, jobs[j]["type"].inspect_min, cfg.cv)
            busy["inspection"] += clip(now, now + d); push(now + d, "insp_done", j)
        while free_p > 0 and q_print:
            j = q_print.pop(0); free_p -= 1
            jobs[j]["pstart"] = now
            q_arm.append((j, "load"))
        if not arm_busy and q_arm:
            j, op = q_arm.pop(0)
            t = jobs[j]["type"]
            d = _draw(rng, t.load_min if op == "load" else t.unload_min, cfg.cv)
            arm_busy = True
            busy["arm"] += clip(now, now + d)
            push(now + d, "load_done" if op == "load" else "unload_done", j)

    for _ in range(cfg.wip):
        new_job(0.0)
    dispatch(0.0)
    while ev:
        now, _, kind, j = heapq.heappop(ev)
        if now > cfg.horizon:
            break
        t = jobs[j]["type"]
        if kind == "load_done":
            arm_busy = False
            T = _draw(rng, t.print_min, cfg.cv)
            tf = rng.exponential(1 / lam) if lam > 0 else math.inf
            bad, end = tf < T, T
            if cfg.detector is not None:
                m = int(T // per)
                j0 = min(m, int(tf // per)) if tf < math.inf else m   # looks before the failure
                kf = rng.geometric(f_) if f_ > 0 else math.inf
                if kf <= j0:
                    bad, end = True, kf * per
                elif tf < T and h_ > 0:
                    kd = j0 + rng.geometric(h_)
                    if kd <= m:
                        end = kd * per
            jobs[j]["good"] = not bad
            jobs[j]["pend"] = now + end
            if bad:
                wasted += clip(now, now + end)
            push(now + end, "print_done", j)
        elif kind == "print_done":
            q_arm.append((j, "unload"))
        elif kind == "unload_done":
            arm_busy = False
            busy["printers"] += clip(jobs[j]["pstart"], now)
            free_p += 1
            jobs[j]["attempts"] += 1
            if jobs[j]["good"]:
                q_insp.append(j)
            else:
                q_print.append(j)
        elif kind == "insp_done":
            insp_busy = False
            if now >= cfg.warmup:
                done.append((now - jobs[j]["start"], jobs[j]["attempts"]))
            del jobs[j]
            new_job(now)
        dispatch(now)
    span = cfg.horizon - cfg.warmup
    cap = {"arm": 1, "printers": cfg.printers, "inspection": 1}
    return {
        "good_per_hour": 60.0 * len(done) / span,
        "util": {k: busy[k] / (span * cap[k]) for k in busy},
        "wasted_share": wasted / (span * cfg.printers),
        "mean_attempts": float(np.mean([d[1] for d in done])) if done else float("nan"),
    }


def replicate(cfg, seeds):
    rs = [simulate(cfg, s) for s in seeds]
    def ms(f):
        x = np.array([f(r) for r in rs]); return float(x.mean()), float(x.std(ddof=1) / math.sqrt(len(x)))
    return {
        "good_per_hour": ms(lambda r: r["good_per_hour"]),
        "wasted_share": ms(lambda r: r["wasted_share"]),
        "mean_attempts": ms(lambda r: r["mean_attempts"]),
        "util": {k: ms(lambda r, k=k: r["util"][k])[0] for k in rs[0]["util"]},
    }
