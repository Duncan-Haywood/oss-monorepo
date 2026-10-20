"""Fidelity ladder over the logged eda-harness evaluations (40 MAC-engine designs, p lanes x wb bits).

Rung 0  analytical cost model: no tool run (cost 0).  cells ~ p*wb^2 (multiplier array), cycles = ceil(W/p)
        with W = 110, the single measured p=1 cycle count (one calibration point).
Rung 1  cycle-accurate RTL simulation (Icarus): exact cycles; cells still from rung 0.  cost = lint + rtl_sim seconds.
Rung 2  Yosys synthesis: exact cells.  cost = rung 1 + synth seconds.   (Top rung: OpenROAD was not installed, so
        there is no post-route rung.)
Objective: cells * cycles (lower is better), as in eda-harness.
"""
import json
import math
import numpy as np

W = 110


def load(path):
    rows = []
    for line in open(path):
        r = json.loads(line)
        if r["cache_hit"] or not r["passed"]:
            continue
        s = r["stage_seconds"]
        rows.append({"p": r["cand"]["p"], "wb": r["cand"]["wb"], "cells": r["cells"], "cycles": r["cycles"],
                     "t1": s["lint"] + s["rtl_sim"], "t2": s["lint"] + s["rtl_sim"] + s["synth"]})
    return rows


def rung_value(row, rung):
    """Estimated objective after climbing to `rung`."""
    cells0 = row["p"] * row["wb"] ** 2
    cyc0 = math.ceil(W / row["p"])
    if rung == 0:
        return cells0 * cyc0
    if rung == 1:
        return cells0 * row["cycles"]
    return row["cells"] * row["cycles"]


def rung_cost(row, rung):
    return (0.0, row["t1"], row["t2"])[rung]


def ranks(x):
    x = np.asarray(x, float)
    order = np.argsort(x, kind="mergesort")
    r = np.empty(len(x))
    i = 0
    while i < len(x):  # average ranks for ties
        j = i
        while j + 1 < len(x) and x[order[j + 1]] == x[order[i]]:
            j += 1
        r[order[i:j + 1]] = (i + j) / 2
        i = j + 1
    return r


def spearman(a, b):
    ra, rb = ranks(a), ranks(b)
    if ra.std() == 0 or rb.std() == 0:
        return float("nan")
    return float(np.corrcoef(ra, rb)[0, 1])


def kendall(a, b):
    """Kendall tau-b."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    n = len(a)
    c = d = ta = tb = 0
    for i in range(n):
        for j in range(i + 1, n):
            da, db = np.sign(a[i] - a[j]), np.sign(b[i] - b[j])
            if da == 0 and db == 0:
                continue
            if da == 0:
                ta += 1
            elif db == 0:
                tb += 1
            elif da == db:
                c += 1
            else:
                d += 1
    den = math.sqrt((c + d + ta) * (c + d + tb))
    return (c - d) / den if den else float("nan")


def truth(row):
    return rung_value(row, 2)


def halving(rows, perm, n0, eta=3):
    """Successive halving up rungs 0 -> 1 -> 2 over the first n0 designs of perm.
    Rung 0 is free and ranks all n0; the top ceil(n0/eta) are simulated (rung 1) and ranked by the rung-1 value; the top
    ceil(that/eta) are synthesised (rung 2). Returns (best true objective among the synthesised, seconds charged)."""
    pool = sorted(perm[:n0], key=lambda i: rung_value(rows[i], 0))
    pool = pool[:math.ceil(len(pool) / eta)]
    cost = sum(rung_cost(rows[i], 1) for i in pool)
    pool = sorted(pool, key=lambda i: rung_value(rows[i], 1))
    pool = pool[:math.ceil(len(pool) / eta)]
    cost += sum(rung_cost(rows[i], 2) - rung_cost(rows[i], 1) for i in pool)
    return min(truth(rows[i]) for i in pool), cost


def random_search(rows, perm, budget):
    """Synthesise designs in perm order (full cost each) until the next would exceed budget seconds."""
    best, cost = math.inf, 0.0
    for i in perm:
        c = rung_cost(rows[i], 2)
        if cost + c > budget:
            break
        cost += c
        best = min(best, truth(rows[i]))
    return best, cost


def halving_at_budget(rows, perm, budget, eta=3):
    """Largest first-rung pool n0 whose halving run fits in budget seconds (the pools are nested prefixes of perm)."""
    out = (math.inf, 0.0)
    for n0 in range(1, len(rows) + 1):
        b, c = halving(rows, perm, n0, eta)
        if c <= budget:
            out = (b, c)
    return out
