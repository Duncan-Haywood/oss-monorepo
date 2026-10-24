"""Deterministic experiments for infra-hosting; writes results.txt.   PYTHONPATH=src python experiments/run.py   (about 6 min)"""
from collections import Counter
from pathlib import Path
import numpy as np
from infra_hosting import (MEASURES, LOAD_NODES, hosting_capacity, with_frozen, with_no_ldc, random_placement, feeder_peak_kw,
                           open_circuit, violations)

HERE = Path(__file__).resolve().parent
N = 300
LEVELS = [0.2, 0.3, 0.5, 0.7]
out = []


def p(s=""):
    out.append(s)


peak = feeder_peak_kw()
rng = np.random.default_rng(1)
places = [random_placement(rng) for _ in range(N)]
FROZEN = [with_frozen(m) for m in MEASURES]
NOLDC = [with_no_ldc(m) for m in MEASURES[:4]]

res = {}
for lm in LEVELS:
    for m in MEASURES + FROZEN + NOLDC:
        res[(lm, m.name)] = [hosting_capacity(m, lm, pl) for pl in places]
kw = lambda lm, nm: np.array([r[0] for r in res[(lm, nm)]])

p(f"feeder: IEEE 13-node, peak customer load {peak:.0f} kW; {N} random placements (1-8 customer nodes, Dirichlet weights, seed 1); limits: 1.05 pu, line ampacity, transformer kVA")
p()
for tag, ms in (("A. Hosting capacity, live regulators (kW; median [p10, p90]; % of the load at that level)", MEASURES),
                ("B. Hosting capacity, regulator taps frozen at their no-PV values (kW; median [p10, p90])", FROZEN),
                ("H. Hosting capacity with regulator line-drop compensation off (R = X = 0; kW; median [p10, p90])", NOLDC)):
    p(tag)
    p("load_level baseline | " + " | ".join(m.name for m in ms[1:]))
    for lm in LEVELS:
        cells = []
        for m in ms:
            a = kw(lm, m.name)
            cells.append(f"{np.median(a):.0f} [{np.percentile(a, 10):.0f},{np.percentile(a, 90):.0f}]")
        pct = 100 * np.median(kw(lm, ms[0].name)) / (peak * lm)
        p(f"{lm} {cells[0]} ({pct:.0f}%) | " + " | ".join(cells[1:]))
    p()

p("C. Paired change vs the baseline of the same regulator regime at load 0.3: median kW change, share of placements better / worse / equal")
for group in (MEASURES, FROZEN, NOLDC):
    base = kw(0.3, group[0].name)
    for m in group[1:]:
        d = kw(0.3, m.name) - base
        p(f"{m.name}: median {np.median(d):+.0f} kW, better {np.mean(d > 5) * 100:.0f}%, worse {np.mean(d < -5) * 100:.0f}%, equal {np.mean(abs(d) <= 5) * 100:.0f}%")
p()

p("D. Which limit binds first at load 0.3 (baseline, live regulators) and at 0.7")
for lm in (0.3, 0.7):
    p(f"load {lm}: " + ", ".join(f"{k} {v}" for k, v in sorted(Counter(r[1] for r in res[(lm, 'baseline')]).items())))
    p(f"load {lm} volt-var+reg+EV: " + ", ".join(f"{k} {v}" for k, v in sorted(Counter(r[1] for r in res[(lm, 'volt-var + reg -2 V + EV')]).items())))
p()

p("E. Single-node hosting capacity at load 0.3 (kW): node baseline volt-var fixed-pf0.95 reg-2V")
for n in LOAD_NODES:
    row = [hosting_capacity(m, 0.3, {n: 1.0})[0] for m in (MEASURES[0], MEASURES[2], MEASURES[1], MEASURES[3])]
    p(n + " " + " ".join(f"{v:.0f}" for v in row))
p()

p("F. Median hosting capacity (kW) against load level, live regulators")
names = [m.name for m in MEASURES]
p("load_level " + " ".join(n.replace(" ", "_") for n in names))
for lm in LEVELS:
    p(f"{lm} " + " ".join(f"{np.median(kw(lm, n)):.0f}" for n in names))
p()

p("I. Lowest service voltage with no PV (pu, ANSI C84.1 Range A lower limit 0.95) by load level and measure, live regulators")
p("load_level " + " ".join(m.name.replace(" ", "_") for m in MEASURES))
import opendssdirect as dss
for lm in (0.2, 0.3, 0.7, 1.0):
    row = []
    for m in MEASURES:
        open_circuit(m, lm)
        violations()
        lo = 9.0
        for b in dss.Circuit.AllBusNames():
            if b.lower() in ("sourcebus", "650"):
                continue
            dss.Circuit.SetActiveBus(b)
            v = [x for x in dss.Bus.puVmagAngle()[0::2] if x > 0.3]
            lo = min(lo, min(v))
        row.append(f"{lo:.3f}")
    p(f"{lm} " + " ".join(row))
p()

p("G. Path dependence (baseline, load 0.3, 60 placements): a fresh solve (regulators start from nothing, no ramp) at the reported capacity, and 100 kW above it")
from infra_hosting.hosting import set_pv
clean_at, viol_above = 0, 0
for pl, (h, _) in zip(places[:60], res[(0.3, "baseline")][:60]):
    nm = open_circuit(MEASURES[0], 0.3, {k: 1.0 for k in pl})
    w = np.array(list(pl.values()))
    w = w / w.sum()
    ok = lambda t: (set_pv(nm, t * w), (lambda v: v["converged"] > 0 and max(v["voltage"], v["line"], v["xfmr"]) <= 1.0)(violations()))[1]
    clean_at += ok(h)
    nm = open_circuit(MEASURES[0], 0.3, {k: 1.0 for k in pl})
    viol_above += (not ok(h + 100))
p(f"fresh solve at the reported capacity is clean: {clean_at} of 60; fresh solve at capacity + 100 kW violates: {viol_above} of 60")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
