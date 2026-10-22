import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "..")
sys.path.insert(0, os.path.join(ROOT, "eda-proposers", "src"))
"""Proposers search a *cheap view* (measured generic-gate numbers) of 40 MAC-engine designs and are scored on the *true view*
(SKY130-mapped area and latency, measured by `eda-sky130rung`). The disagreement between the views is a real tool measurement,
not injected noise. Reuses `eda-proposers` (proposers, runner, hypervolume) and `eda-noisy`'s scoring convention unchanged."""
import json
import numpy as np
from eda_proposers import bench, proposers
from eda_proposers.hv import hypervolume, nondominated

MAPPED = os.path.join(ROOT, "eda-sky130rung", "experiments", "mapped.json")
TABLE = os.path.join(ROOT, "eda-proposers", "experiments", "table.jsonl")
STOCH = [c for c in proposers.ALL if c.name != "grid"]
REF = bench.REF
DIMS = {"p": list(range(1, 9)), "wb": [4, 5, 6, 7, 8]}
VIEWS = {
    "true":      ("SKY130 area, cycles x mapped delay, error", lambda r: (r["area_um2"], r["cycles"] * r["delay_ps"], r["err"])),
    "cells":     ("generic cells, cycles, error", lambda r: (r["gen_cells"], r["cycles"], r["err"])),
    "cells_dep": ("generic cells, cycles x generic depth, error", lambda r: (r["gen_cells"], r["cycles"] * r["gen_depth"], r["err"])),
}


def load_rows():
    """The 40 designs with both rungs. Error (1 - held-out accuracy) comes from `eda-proposers`' table (abc 'gates' rows)."""
    err = {(r["p"], r["wb"]): r["err"] for r in map(json.loads, open(TABLE)) if r["abc"] == "gates"}
    rows = []
    for r in json.load(open(MAPPED))["rows"]:
        rows.append(dict(r, err=err[(r["p"], r["wb"])]))
    assert len(rows) == 40
    return rows


class View:
    """Index-coded (p, wb) space whose evaluate() returns the chosen view's objectives scaled to [0, 1] over the 40 designs."""

    def __init__(self, rows, view):
        self.keys, self.sizes = list(DIMS), [len(v) for v in DIMS.values()]
        f = VIEWS[view][1]
        self.t = {(DIMS["p"].index(r["p"]), DIMS["wb"].index(r["wb"])): tuple(float(v) for v in f(r)) for r in rows}
        a = list(self.t.values())
        self.lo = [min(x[i] for x in a) for i in range(3)]
        self.hi = [max(x[i] for x in a) for i in range(3)]

    def evaluate(self, x):
        return tuple((v - l) / (h - l) for v, l, h in zip(self.t[x], self.lo, self.hi))

    def all(self):
        return list(self.t)


class Noisy(View):
    """The true view plus iid N(0, sigma) per objective, fixed per design per run (`eda-noisy`'s model), for matched-sigma comparison."""

    def __init__(self, rows, sigma, seed):
        super().__init__(rows, "true")
        rng = np.random.default_rng(10_000 + seed)
        self.err = {x: rng.normal(0.0, sigma, 3) for x in sorted(self.t)}

    def evaluate(self, x):
        return tuple(float(v) for v in np.array(super().evaluate(x)) + self.err[x])


def hv_ratio(true, order, budget):
    """True-view hypervolume of the first `budget` designs over that of the true front."""
    full = hypervolume(nondominated([true.evaluate(x) for x in true.all()]), REF)
    return hypervolume(nondominated([true.evaluate(x) for x in order[:budget]]), REF) / full


def run(rows, cls, search, budget, seed, sigma=None):
    """One run: the proposer queries `search` (a view name, or 'noisy' with `sigma`); the designs it picked are scored on the true view."""
    true = View(rows, "true")
    space = Noisy(rows, sigma, seed) if search == "noisy" else View(rows, search)
    return hv_ratio(true, bench.run_once(space, cls, budget, seed), budget)


def view_error(rows, view):
    """Per-objective RMS of (scaled cheap - scaled true) over the 40 designs: the measured analogue of eda-noisy's sigma,
    and the Spearman rank correlation of each objective with its true counterpart."""
    t, c = View(rows, "true"), View(rows, view)
    d = np.array([np.array(c.evaluate(x)) - np.array(t.evaluate(x)) for x in t.all()])
    ranks = lambda a: np.argsort(np.argsort(a))
    sp = [float(np.corrcoef(ranks([c.t[x][i] for x in t.all()]), ranks([t.t[x][i] for x in t.all()]))[0, 1]) for i in range(3)]
    return np.sqrt((d ** 2).mean(0)), sp


def front(rows, view):
    v = View(rows, view)
    names = {(DIMS["p"].index(r["p"]), DIMS["wb"].index(r["wb"])): f"p{r['p']}w{r['wb']}" for r in rows}
    pts = {x: v.evaluate(x) for x in v.all()}
    nd = nondominated(list(pts.values()))
    return sorted(names[x] for x, y in pts.items() if y in nd)
