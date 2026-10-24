"""Re-cost accel-lut's int8 MAC vs weight-shared product-table verdict with size-dependent array reads.
usage: python3 experiments/run.py   (stdlib after import; reads ../accel-lut/experiments/results.json)"""
import json
import os
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from accel_lutsize import cost as C  # noqa: E402

SRC = os.path.join(HERE, "..", "..", "accel-lut", "experiments", "results.json")
DIMS = [(64, 32), (32, 10)]
ABITS = [4, 8]
KS = (2, 4, 8, 16, 32)
ALPHAS = (0.0, 0.1, 0.2, 0.3, 0.4, 0.5)
TOL = 0.02   # accel-lut's accuracy tolerance: drop vs float32 within 2 points


def energy(row, alpha, floor=False):
    sparse = row["sparsity"] > 0
    name = row["design"]
    if name == "int8":
        f = lambda fi, fo, nz, ab: C.mac_pj(fi, fo, nz, 8, ab, sparse, alpha, floor)
    else:
        k = int(name[5:])
        f = lambda fi, fo, nz, ab: C.lut_pj(fi, fo, nz, k, ab, sparse, alpha, floor)
    return sum(f(fi, fo, nz, ab) for (fi, fo), nz, ab in zip(DIMS, row["nnz"], ABITS)) / 1000.0


def mean(v):
    return sum(v) / len(v)


def table():
    rows = json.load(open(SRC))
    out = {"alphas": ALPHAS, "tol": TOL, "cells": []}
    for sp in (0.0, 0.75):
        rs = [r for r in rows if r["sparsity"] == sp]
        base = {r["seed"]: r["test"] for r in rs if r["design"] == "float32"}
        for name in ["int8"] + ["share%d" % k for k in KS]:
            v = [r for r in rs if r["design"] == name]
            drop = mean([base[r["seed"]] - r["test"] for r in v])
            e = {a: mean([energy(r, a) for r in v]) for a in ALPHAS}
            ef = {a: mean([energy(r, a, True) for r in v]) for a in ALPHAS}
            out["cells"].append(dict(sparsity=sp, design=name, drop=drop, acc=mean([r["test"] for r in v]),
                                     nJ={str(a): e[a] for a in ALPHAS}, nJ_floor={str(a): ef[a] for a in ALPHAS}))
    return out


def crossover(layer_n=None):
    """Analytic: one dense 64xN layer, 4-bit inputs, int8 MAC vs K=16 table; table/MAC ratio per alpha."""
    res = {}
    for n in (8, 16, 32, 64, 128, 256, 512, 1024):
        res[n] = {str(a): C.lut_pj(64, n, 64 * n, 16, 4, False, a) / C.mac_pj(64, n, 64 * n, 8, 4, False, a) for a in ALPHAS}
    return res


def break_even():
    """Per sparsity: smallest alpha on a 0.005 grid at which the cheapest in-tolerance table design
    uses no more energy than the int8 MAC engine (None if never within 0..0.5)."""
    rows = json.load(open(SRC))
    res = {}
    for sp in (0.0, 0.75):
        rs = [r for r in rows if r["sparsity"] == sp]
        base = {r["seed"]: r["test"] for r in rs if r["design"] == "float32"}
        ok = []
        for k in KS:
            v = [r for r in rs if r["design"] == "share%d" % k]
            if mean([base[r["seed"]] - r["test"] for r in v]) <= TOL:
                ok.append(v)
        mac = [r for r in rs if r["design"] == "int8"]
        res[sp] = None
        for i in range(101):
            a = i * 0.005
            best = min(mean([energy(r, a) for r in v]) for v in ok)
            if best <= mean([energy(r, a) for r in mac]):
                res[sp] = a
                break
    return res


def report(t, x, be):
    L = []
    for sp in (0.0, 0.75):
        L.append("== sparsity %d%% : energy nJ/inference by size-law exponent alpha (alpha 0 = flat 0.15625 pJ/bit) ==" % int(sp * 100))
        L.append("design | acc | drop | " + " | ".join("a=%.1f" % a for a in ALPHAS))
        cells = [c for c in t["cells"] if c["sparsity"] == sp]
        mac = [c for c in cells if c["design"] == "int8"][0]
        for c in cells:
            L.append("%s | %.3f | %+.3f | %s" % (c["design"], c["acc"], c["drop"], " | ".join("%.2f" % c["nJ"][str(a)] for a in ALPHAS)))
        L.append("-- best table design within %.0f-point drop, ratio to int8 MAC (<1: table wins) --" % (TOL * 100))
        for a in ALPHAS:
            ok = [c for c in cells if c["design"] != "int8" and c["drop"] <= TOL]
            if not ok:
                L.append("a=%.1f: none within tolerance" % a)
                continue
            b = min(ok, key=lambda c: c["nJ"][str(a)])
            L.append("a=%.1f: %s %.2f nJ vs MAC %.2f nJ, ratio %.2f" % (a, b["design"], b["nJ"][str(a)], mac["nJ"][str(a)], b["nJ"][str(a)] / mac["nJ"][str(a)]))
        L.append("-- same with arrays never cheaper than the 8 KB point (floor) --")
        for a in ALPHAS:
            ok = [c for c in cells if c["design"] != "int8" and c["drop"] <= TOL]
            b = min(ok, key=lambda c: c["nJ_floor"][str(a)])
            L.append("a=%.1f: %s ratio %.2f" % (a, b["design"], b["nJ_floor"][str(a)] / mac["nJ_floor"][str(a)]))
        L.append("")
    L.append("== analytic: one dense 64xN layer, 4-bit inputs, K=16 table / int8 MAC energy ratio by alpha ==")
    L.append("N | " + " | ".join("a=%.1f" % a for a in ALPHAS))
    for n, r in x.items():
        L.append("%d | %s" % (n, " | ".join("%.2f" % r[str(a)] for a in ALPHAS)))
    L.append("")
    L.append("== break-even exponent: smallest alpha at which the cheapest in-tolerance table design ties int8 MAC ==")
    for sp, a in be.items():
        L.append("sparsity %d%%: %s" % (int(sp * 100), "never in 0..0.5" if a is None else "alpha = %.3f" % a))
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    t = table()
    x = crossover()
    be = break_even()
    json.dump({"table": t, "crossover": x, "break_even": {str(k): v for k, v in be.items()}}, open(os.path.join(HERE, "results.json"), "w"), indent=1)
    s = report(t, x, be)
    open(os.path.join(HERE, "results.txt"), "w").write(s)
    print(s)
