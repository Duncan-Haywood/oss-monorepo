"""Print-and-inspect cell with random print failures (stylised).

P printers, one arm, one inspection station, closed loop at ``wip`` jobs. A job holds a printer
from the start of its load to the end of its unload. While printing, a failure (spaghetti, a
detached part) strikes at rate ``fail_rate`` per hour of printing; a print that suffers one is
bad however long it runs. ``monitor_delay`` is None for blind printing: every print runs to its
end and the arm clears a bad part at unload. Otherwise a camera aborts a failing print
``monitor_delay`` minutes after the failure (or at the print's end if that comes first) and, at
``false_stop`` per hour, also aborts good prints by mistake. An aborted or bad print is cleared
by the arm (unload time) and the job goes back to the printer queue. Good prints are inspected
(inspection never rejects here, to isolate print failures) and leave a fresh job in their place.
Times are minutes; lognormal noise with coefficient of variation ``cv`` (0 = deterministic).
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
    monitor_delay: float = None      # None = blind; else minutes from failure to abort
    false_stop: float = 0.0          # camera false aborts per hour of printing
    horizon: float = 24 * 60.0
    warmup: float = 4 * 60.0


def _draw(rng, mean, cv):
    if cv <= 0:
        return mean
    s2 = math.log(1 + cv * cv)
    return mean * math.exp(rng.normal(-s2 / 2, math.sqrt(s2)))


def attempt_stats(T, fail_rate, monitor_delay, false_stop, n=4000):
    """For a print of length T minutes (deterministic): (success probability, mean minutes
    the printer spends printing per attempt). Exact for the exponential hazards."""
    lam, mu = fail_rate / 60.0, false_stop / 60.0
    succ = math.exp(-(lam + mu) * T)
    if monitor_delay is None:
        return math.exp(-lam * T), T
    d = monitor_delay
    t = np.linspace(0.0, T, n + 1)
    surv = np.exp(-lam * np.maximum(t - d, 0.0)) * np.exp(-mu * t)   # P(attempt still running at t)
    return succ, float(((surv[1:] + surv[:-1]) / 2 * np.diff(t)).sum())


def bound(cfg):
    """Utilisation bound on good parts per minute, with the station that sets it. A good part of
    type t needs 1/s_t attempts; each attempt costs one load and one unload of the arm and
    (printing time + load + unload) of a printer; each good part is inspected once."""
    w = np.array([t.weight for t in cfg.types], float); w /= w.sum()
    arm = prn = ins = 0.0
    for wi, t in zip(w, cfg.types):
        s, e = attempt_stats(t.print_min, cfg.fail_rate, cfg.monitor_delay, cfg.false_stop)
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
    lam, mu = cfg.fail_rate / 60.0, cfg.false_stop / 60.0

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
            ts = rng.exponential(1 / mu) if mu > 0 else math.inf
            bad = tf < T or (cfg.monitor_delay is not None and ts < T)
            end = T if cfg.monitor_delay is None else min(T, tf + cfg.monitor_delay, ts)
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
