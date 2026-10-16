"""Replay a formal-timeout cap on the eda-verify per-mutant log (nothing is re-run).

A mutant reaches formal only if the cheap stages (random-N vectors, then the 16 directed vectors)
did not kill it. Formal then runs with a cap T seconds. The log holds one formal run per mutant
with its outcome and seconds, so a capped run is replayed as: if logged seconds <= T the logged
outcome stands, otherwise the mutant is unresolved and T seconds are charged. This is exact only if
solver time does not depend on the cap, which holds for a single deterministic solver run.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "eda-checkorder", "src"))
from eda_checkorder import cascade as C  # noqa: E402

load = C.load


def run(rows, n_random, cap, seed):
    """Cascade random-n -> directed-16 -> formal(cap). cap=None means the logged, uncapped run."""
    cpu = 0.0
    killed = equiv = unres = 0
    for r in rows:
        cpu += C.random_cost(r, n_random)
        if C.random_kills(r, n_random, seed):
            killed += 1
            continue
        cpu += r["directed_seconds"]
        if r["directed_first"] is not None:
            killed += 1
            continue
        s = r["formal_seconds"]
        if cap is not None and s > cap:
            cpu += cap
            unres += 1
            continue
        cpu += s
        if r["formal"] == "killed":
            killed += 1
        elif r["formal"] == "equivalent":
            equiv += 1
        else:
            unres += 1
    return {"cpu_s": cpu, "killed": killed, "equivalent": equiv, "unresolved": unres}


def mean(rows, n_random, cap, seeds=range(20)):
    res = [run(rows, n_random, cap, s) for s in seeds]
    return {k: sum(x[k] for x in res) / len(res) for k in res[0]}


def train_cap(rows, n_random, margin=1.1, seeds=range(20)):
    """Cap = margin x the longest logged formal kill among mutants that reach formal in the training rows."""
    longest = 0.0
    for r in rows:
        for s in seeds:
            reaches = not (C.random_kills(r, n_random, s) or r["directed_first"] is not None)
            if reaches and r["formal"] == "killed":
                longest = max(longest, r["formal_seconds"])
    return margin * longest if longest else None
