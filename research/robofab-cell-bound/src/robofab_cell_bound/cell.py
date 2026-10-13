"""Discrete-event model of a print-and-inspect cell (stylised).

Resources: P printers, one arm, K inspection stations. A job holds a printer from the start of
its load until the end of its unload. The arm loads the printer, the printer runs, the arm
unloads, then the part is inspected; with probability q it fails and the job reprints. A good
part ends the job and a fresh job of a random type enters, so WIP stays at ``wip`` (closed loop).
Times are minutes. Lognormal noise with coefficient of variation ``cv`` (0 = deterministic).
"""
import heapq, math
from dataclasses import dataclass, field
import numpy as np


@dataclass(frozen=True)
class JobType:
    name: str
    print_min: float
    load_min: float = 2.0
    unload_min: float = 2.0
    inspect_min: float = 4.0
    fail_prob: float = 0.1
    weight: float = 1.0


@dataclass
class CellConfig:
    types: tuple
    printers: int = 4
    inspectors: int = 1
    wip: int = 8
    cv: float = 0.0
    arm_rule: str = "fifo"        # fifo | unload_first | spt
    horizon: float = 24 * 60.0
    warmup: float = 4 * 60.0


def _draw(rng, mean, cv):
    if cv <= 0:
        return mean
    s2 = math.log(1 + cv * cv)
    return mean * math.exp(rng.normal(-s2 / 2, math.sqrt(s2)))


def bound(cfg):
    """Utilisation bound on good parts per minute: min over stations of capacity / demand."""
    w = np.array([t.weight for t in cfg.types], float); w /= w.sum()
    v = sum(wi / (1 - t.fail_prob) for wi, t in zip(w, cfg.types))      # expected passes per good part
    def mean(f):
        return sum(wi * f(t) / (1 - t.fail_prob) for wi, t in zip(w, cfg.types))
    # a good part of type t takes 1/(1-q_t) passes; demand per good part, mixed over types
    arm = mean(lambda t: t.load_min + t.unload_min)
    prn = mean(lambda t: t.print_min + t.load_min + t.unload_min)
    ins = mean(lambda t: t.inspect_min)
    caps = {"arm": 1 / arm, "printers": cfg.printers / prn, "inspection": cfg.inspectors / ins}
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
    free_p, arm_busy, free_i = cfg.printers, False, cfg.inspectors
    q_print, q_arm, q_insp = [], [], []          # waiting jobs
    busy = {"arm": 0.0, "printers": 0.0, "inspection": 0.0}
    done, wait_arm_print = [], 0.0
    jobs = {}
    jid = 0

    def new_job(now):
        nonlocal jid
        jid += 1
        t = cfg.types[rng.choice(len(cfg.types), p=w)]
        jobs[jid] = dict(type=t, start=now, passes=0)
        q_print.append((now, jid))

    def clip(a, b, t0=None):
        lo = cfg.warmup
        return max(0.0, min(b, cfg.horizon) - max(a, lo))

    def dispatch(now):
        nonlocal free_p, arm_busy, free_i
        while free_i > 0 and q_insp:
            _, j = q_insp.pop(0); free_i -= 1
            d = _draw(rng, jobs[j]["type"].inspect_min, cfg.cv)
            busy["inspection"] += clip(now, now + d); push(now + d, "insp_done", j)
        while free_p > 0 and q_print:
            _, j = q_print.pop(0); free_p -= 1
            jobs[j]["pstart"] = now
            q_arm.append((now, j, "load"))
        if not arm_busy and q_arm:
            if cfg.arm_rule == "fifo":
                k = 0
            elif cfg.arm_rule == "unload_first":
                k = next((i for i, a in enumerate(q_arm) if a[2] == "unload"), 0)
            elif cfg.arm_rule == "spt":
                k = min(range(len(q_arm)), key=lambda i: (q_arm[i][2] == "load" and jobs[q_arm[i][1]]["type"].load_min or jobs[q_arm[i][1]]["type"].unload_min))
            else:
                raise ValueError(cfg.arm_rule)
            _, j, op = q_arm.pop(k)
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
            d = _draw(rng, t.print_min, cfg.cv)
            push(now + d, "print_done", j)
        elif kind == "print_done":
            q_arm.append((now, j, "unload"))
        elif kind == "unload_done":
            arm_busy = False
            busy["printers"] += clip(jobs[j]["pstart"], now)
            free_p += 1
            q_insp.append((now, j))
        elif kind == "insp_done":
            free_i += 1
            jobs[j]["passes"] += 1
            if rng.random() < t.fail_prob:
                q_print.append((now, j))
            else:
                if now >= cfg.warmup:
                    done.append((t.name, now - jobs[j]["start"], jobs[j]["passes"]))
                del jobs[j]
                new_job(now)
        dispatch(now)
    span = cfg.horizon - cfg.warmup
    cap = {"arm": 1, "printers": cfg.printers, "inspection": cfg.inspectors}
    return {
        "good_per_hour": 60.0 * len(done) / span,
        "util": {k: busy[k] / (span * cap[k]) for k in busy},
        "mean_flow_min": float(np.mean([d[1] for d in done])) if done else float("nan"),
        "mean_passes": float(np.mean([d[2] for d in done])) if done else float("nan"),
        "n_done": len(done),
    }


def replicate(cfg, seeds):
    rs = [simulate(cfg, s) for s in seeds]
    def ms(f):
        x = np.array([f(r) for r in rs]); return float(x.mean()), float(x.std(ddof=1) / math.sqrt(len(x)))
    return {
        "good_per_hour": ms(lambda r: r["good_per_hour"]),
        "mean_flow_min": ms(lambda r: r["mean_flow_min"]),
        "util": {k: ms(lambda r, k=k: r["util"][k])[0] for k in rs[0]["util"]},
    }
