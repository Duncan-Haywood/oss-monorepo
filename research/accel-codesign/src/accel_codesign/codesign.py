"""Joint model + hardware search over measured accel-kws models and a lane-count knob (stylised).

Model side: the 40 trained, RTL-verified configurations in research/accel-kws/experiments/results.json
(3-seed means). Hardware side: lane count P. Cycles are analytic: ceil(IN*H/P) + ceil(H*OUT/P) + 3,
which equals accel-kws's measured MACs + 3 at P = 1. Area = accel-kws's measured engine cells at P=1,
plus (datapath(P) - datapath(1)) where datapath(P) is a Yosys generic-gate synthesis of rtl/mac_dp.v.
Energy per inference is accel-kws's modelled number, independent of P (no leakage or clock-tree model).
"""
import json, math, os

OUT = 11
LANES = (1, 2, 4, 8, 16, 32)
HERE = os.path.dirname(os.path.abspath(__file__))
KWS = os.path.join(HERE, "..", "..", "..", "accel-kws", "experiments", "results.json")


def load_models(path=KWS):
    rows = json.load(open(path))["rows"]
    return [dict(seg=r["segments"], inputs=r["inputs"], hidden=r["hidden"], wbits=r["wbits"],
                 val=r["val_mean"], test=r["test_mean"], cells1=r["cells"], flops1=r["flops"],
                 energy=r["energy_nj"], kbit=r["storage_kbit"], macs=r["macs"]) for r in rows]


def cycles(m, p):
    return math.ceil(m["inputs"] * m["hidden"] / p) + math.ceil(m["hidden"] * OUT / p) + 3


def area(m, p, dp):
    """Cells: measured P=1 engine + extra datapath cells for P lanes at this weight width."""
    return m["cells1"] + dp[str(m["wbits"])][str(p)] - dp[str(m["wbits"])]["1"]


def design_space(models, dp, lanes=LANES):
    return [dict(m, p=p, cyc=cycles(m, p), area=area(m, p, dp)) for m in models for p in lanes]


def feasible(space, deadline):
    return [d for d in space if d["cyc"] <= deadline]


def sequential(space, deadline):
    """Model first, hardware second. Pick the model with the highest validation accuracy among those
    that can meet the deadline at the widest array (ties by lower energy), then the smallest-area
    lane count that meets the deadline for that model."""
    top = lanes_max(space)
    ok = [d for d in space if d["p"] == top and d["cyc"] <= deadline]
    if not ok:
        return None
    best = max(ok, key=lambda d: (round(d["val"], 6), -d["energy"]))
    key = (best["seg"], best["hidden"], best["wbits"])
    cand = [d for d in space if (d["seg"], d["hidden"], d["wbits"]) == key and d["cyc"] <= deadline]
    return min(cand, key=lambda d: d["area"])


def lanes_max(space):
    return max(d["p"] for d in space)


def pareto(points, keys):
    """Non-dominated set; maximise keys[0] (accuracy), minimise the rest."""
    out = []
    for a in points:
        dom = False
        for b in points:
            if b is a:
                continue
            ge = b[keys[0]] >= a[keys[0]] and all(b[k] <= a[k] for k in keys[1:])
            gt = b[keys[0]] > a[keys[0]] or any(b[k] < a[k] for k in keys[1:])
            if ge and gt:
                dom = True
                break
        if not dom:
            out.append(a)
    return out


def joint_min_area(space, deadline, acc_floor):
    """Joint: smallest-area design with validation accuracy >= acc_floor and cycles <= deadline."""
    c = [d for d in space if d["cyc"] <= deadline and d["val"] >= acc_floor]
    return min(c, key=lambda d: (d["area"], d["energy"])) if c else None
