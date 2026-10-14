"""Discrete-event model of a small manufacturing cell.

Resources: `n_arms` robot arms, `n_printers` 3D printers, `n_inspect` inspection stations.
A job (one part) goes through four stages:

    LOAD    (arm, `load` min; reserves a free printer for the whole print)
    PRINT   (printer, part print time)
    UNLOAD  (arm, `unload` min; frees the printer at its end)
    INSPECT (inspection station, `inspect` min); with probability `q_fail` the part is
            rejected and the job restarts at LOAD (same part, same print time).

All times are minutes. Only the standard library is used. Everything is deterministic given
a `Batch` (the pre-drawn print times and rejection draws), so two policies can be compared on
identical random numbers.
"""
from __future__ import annotations

import heapq
import math
import random
from dataclasses import dataclass, field
from typing import List


@dataclass(frozen=True)
class CellParams:
    n_arms: int = 1
    n_printers: int = 4
    n_inspect: int = 1
    load: float = 2.0
    unload: float = 2.0        # includes clearing the bed
    inspect: float = 6.0
    q_fail: float = 0.08       # probability an inspected part is rejected and reprinted
    print_mean: float = 45.0
    print_cv: float = 0.5      # lognormal coefficient of variation of print time


@dataclass
class Batch:
    """Pre-drawn randomness for one replication: print time per part, and for each part a
    list of uniform draws, one per inspection attempt."""
    print_times: List[float]
    draws: List[List[float]] = field(default_factory=list)


def draw_batch(p: CellParams, n_jobs: int, seed: int, max_attempts: int = 40) -> Batch:
    rng = random.Random(seed)
    s2 = math.log(1.0 + p.print_cv ** 2)
    mu = math.log(p.print_mean) - s2 / 2.0
    times = [rng.lognormvariate(mu, math.sqrt(s2)) for _ in range(n_jobs)]
    draws = [[rng.random() for _ in range(max_attempts)] for _ in range(n_jobs)]
    return Batch(times, draws)


def mean_batch(p: CellParams, n_jobs: int) -> Batch:
    """The deterministic twin: every part takes the mean print time and none is rejected."""
    return Batch([p.print_mean] * n_jobs, [[1.0] * 40 for _ in range(n_jobs)])


STAGE_PRIORITY = {
    "unload_first": {"load": 1, "unload": 0},
    "load_first": {"load": 0, "unload": 1},
}


def simulate(p: CellParams, batch: Batch, arm_rule: str = "unload_first", job_order: str = "fifo") -> dict:
    """Run one replication. `arm_rule` picks which waiting arm task goes next
    (unload_first | load_first; unload queue is FIFO). `job_order` ranks jobs waiting to be loaded
    (fifo | spt | lpt by print time). Returns makespan, mean flow time, utilisation per
    resource, and rework count."""
    n = len(batch.print_times)
    prio = STAGE_PRIORITY[arm_rule]
    pt = batch.print_times
    jkey = {"fifo": lambda j: j, "spt": lambda j: (pt[j], j), "lpt": lambda j: (-pt[j], j)}[job_order]

    t = 0.0
    seq = 0
    events: list = []                       # (time, seq, kind, job)
    arm_free, printer_free, insp_free = p.n_arms, p.n_printers, p.n_inspect
    load_q: List[int] = list(range(n))      # jobs not yet (re)loaded
    unload_q: List[tuple] = []              # (ready_time, seq, job)
    insp_q: List[tuple] = []
    attempts = [0] * n
    done_at = [None] * n
    busy = {"arm": 0.0, "printer": 0.0, "inspect": 0.0}
    reworks = 0

    def push(time, kind, job):
        nonlocal seq
        seq += 1
        heapq.heappush(events, (time, seq, kind, job))

    def dispatch():
        nonlocal arm_free, printer_free, insp_free
        while insp_free > 0 and insp_q:
            _, _, j = heapq.heappop(insp_q)
            insp_free -= 1
            busy["inspect"] += p.inspect
            push(t + p.inspect, "insp_done", j)
        while arm_free > 0:
            cands = []
            if unload_q:
                cands.append((prio["unload"], "unload", min(unload_q)[2]))
            if load_q and printer_free > 0:
                cands.append((prio["load"], "load", min(load_q, key=jkey)))
            if not cands:
                break
            _, kind, j = min(cands)
            arm_free -= 1
            if kind == "unload":
                unload_q.remove(min(unload_q))
                busy["arm"] += p.unload
                push(t + p.unload, "unload_done", j)
            else:
                load_q.remove(j)
                printer_free -= 1
                busy["printer"] += p.load + pt[j] + p.unload   # printer is held load..unload
                busy["arm"] += p.load
                push(t + p.load, "load_done", j)

    dispatch()
    while events:
        t, _, kind, j = heapq.heappop(events)
        if kind == "load_done":
            arm_free += 1
            push(t + pt[j], "print_done", j)
        elif kind == "print_done":
            unload_q.append((t, seq, j))
        elif kind == "unload_done":
            arm_free += 1
            printer_free += 1
            seq += 1
            heapq.heappush(insp_q, (t, seq, j))
        elif kind == "insp_done":
            insp_free += 1
            a = attempts[j]
            attempts[j] += 1
            if batch.draws[j][a] < p.q_fail:
                reworks += 1
                load_q.append(j)
            else:
                done_at[j] = t
        dispatch()

    makespan = max(done_at)
    cap = {"arm": p.n_arms, "printer": p.n_printers, "inspect": p.n_inspect}
    util = {k: busy[k] / (cap[k] * makespan) for k in busy}
    return {"makespan": makespan, "mean_flow": sum(done_at) / n, "util": util, "reworks": reworks}


def lower_bound(p: CellParams, batch: Batch) -> float:
    """Capacity lower bound on makespan for a batch with no rework: the largest of
    (total printer-hold time / printers), (total arm time / arms) and (total inspection
    time / stations), a loose bound that ignores rework and start-up/drain time. Printer-hold time is load + print + unload per part because a
    printer is reserved from the start of loading to the end of unloading."""
    n = len(batch.print_times)
    hold = sum(p.load + t + p.unload for t in batch.print_times) / p.n_printers
    arm = n * (p.load + p.unload) / p.n_arms
    insp = n * p.inspect / p.n_inspect
    return max(hold, arm, insp)
