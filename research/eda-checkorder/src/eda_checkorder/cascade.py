"""Replay check cascades on the eda-verify per-mutant log.

Every number comes from `research/eda-verify/experiments/mutants.jsonl`; nothing is re-simulated.
Per-mutant outcomes are taken as logged: random_first[seed] is the index of the first failing
vector (None = passed all 64), directed_first likewise for the 16-vector directed set, and
`formal` is killed / equivalent / undecided with its CPU seconds.
"""
import json
import os

LOG = os.path.join(os.path.dirname(__file__), "..", "..", "..", "eda-verify", "experiments", "mutants.jsonl")


def load(path=LOG):
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]


def killable(rows):
    """Ground truth as eda-verify defines it: killed by any checker."""
    out = []
    for r in rows:
        if r["formal"] == "killed" or r["directed_first"] is not None or any(x is not None for x in r["random_first"]):
            out.append(r)
    return out


def random_kills(r, n, seed):
    f = r["random_first"][seed]
    return f is not None and f < n


def random_cost(r, n):
    """Assumes cost is linear in vectors (the log holds the 64-vector run only; compile time is included
    in the 64-vector figure, so this over-charges small n slightly)."""
    return r["random_seconds"] * n / 64.0


def run_cascade(rows, stages, seed):
    """stages: list of ('random', n) | ('directed',) | ('formal',). Returns dict of totals.

    A mutant leaves the cascade when a stage kills it, or when formal proves it equivalent.
    Survivors of all stages are 'unresolved'.
    """
    cpu = 0.0
    killed = equiv = 0
    unresolved = []
    for r in rows:
        done = False
        for st in stages:
            if st[0] == "random":
                cpu += random_cost(r, st[1])
                if random_kills(r, st[1], seed):
                    killed += 1
                    done = True
            elif st[0] == "directed":
                cpu += r["directed_seconds"]
                if r["directed_first"] is not None:
                    killed += 1
                    done = True
            elif st[0] == "formal":
                cpu += r["formal_seconds"]
                if r["formal"] == "killed":
                    killed += 1
                    done = True
                elif r["formal"] == "equivalent":
                    equiv += 1
                    done = True
            if done:
                break
        if not done:
            unresolved.append(r["id"])
    return {"cpu_s": cpu, "killed": killed, "equivalent": equiv, "unresolved": len(unresolved)}


def mean_over_seeds(rows, stages, seeds=range(20)):
    res = [run_cascade(rows, stages, s) for s in seeds]
    k = len(res)
    return {key: sum(x[key] for x in res) / k for key in res[0]}, res
