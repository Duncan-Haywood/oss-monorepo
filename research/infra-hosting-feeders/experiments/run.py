"""Deterministic experiments for infra-hosting-feeders; writes results.txt.   PYTHONPATH=src python experiments/run.py   (about 30 min)"""
from collections import Counter
from pathlib import Path
import numpy as np
import opendssdirect as dss
from infra_hosting_feeders import (FEEDERS, MEASURES, Measure, hosting_capacity, with_frozen, with_no_ldc, random_placement,
                                   feeder_peak_kw, load_names, open_circuit, V_MAX)

HERE = Path(__file__).resolve().parent
N = 200
LEVELS = [0.3, 0.6]
out = []


def p(s=""):
    out.append(s)


def lowest_voltage(f, m, lm):
    open_circuit(f, m, lm)
    dss.Command("Solve")
    lo = 9.0
    for b in dss.Circuit.AllBusNames():
        if b.lower() in {s.lower() for s in f.skip_buses}:
            continue
        dss.Circuit.SetActiveBus(b)
        v = [x for x in dss.Bus.puVmagAngle()[0::2] if x > 0.1]
        if v:
            lo = min(lo, min(v))
    return lo


FROZEN = [with_frozen(m) for m in MEASURES]
NOLDC = [with_no_ldc(m) for m in MEASURES[:4]]
for key, f in FEEDERS.items():
    peak = feeder_peak_kw(f)
    nodes = load_names(f)
    rng = np.random.default_rng(1)
    places = [random_placement(rng, nodes) for _ in range(N)]
    res = {(lm, m.name): [hosting_capacity(f, m, lm, pl) for pl in places] for lm in LEVELS for m in MEASURES + FROZEN + NOLDC}
    kw = lambda lm, nm: np.array([r[0] for r in res[(lm, nm)]])
    p(f"=== {f.name} [{key}]: {len(nodes)} customer loads, peak {peak:.0f} kW; {N} random placements (1-8 loads, Dirichlet weights, seed 1); limits 1.05 pu and transformer kVA ===")
    p()
    for tag, ms in (("A. Hosting capacity, live regulators (kW; median [p10, p90]; % of the load at that level)", MEASURES),
                    ("B. Hosting capacity, regulator taps frozen at their no-PV values", FROZEN),
                    ("H. Hosting capacity with regulator line-drop compensation off (R = X = 0)", NOLDC)):
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
    p("C. Paired change vs the baseline of the same regulator regime at load 0.3: median kW change, share better / worse / equal")
    for group in (MEASURES, FROZEN, NOLDC):
        base = kw(0.3, group[0].name)
        for m in group[1:]:
            d = kw(0.3, m.name) - base
            p(f"{m.name}: median {np.median(d):+.0f} kW, better {np.mean(d > 10) * 100:.0f}%, worse {np.mean(d < -10) * 100:.0f}%, equal {np.mean(abs(d) <= 10) * 100:.0f}%")
    p()
    p("D. Which limit binds first, load 0.3")
    for m in (MEASURES[0], MEASURES[-1]):
        p(f"{m.name}: " + ", ".join(f"{k} {v}" for k, v in sorted(Counter(r[1] for r in res[(0.3, m.name)]).items())))
    amps = np.array([r[2] for r in res[(0.3, "baseline")]])
    p(f"worst line current at the baseline capacity, load 0.3: median {np.median(amps):.0f} A, p90 {np.percentile(amps, 90):.0f} A, max {amps.max():.0f} A")
    p()
    p("I. Regulator set-point sweep at load 0.3 (no PV lowest service pu at load 1.0 / median capacity kW at 0.3 over the same placements)")
    for drop in (0.0, 1.0, 2.0, 3.0, 4.0):
        m = Measure(f"reg -{drop:g} V", vreg_drop=drop)
        cap = np.median([hosting_capacity(f, m, 0.3, pl)[0] for pl in places[:100]])
        p(f"-{drop:g} V: lowest {lowest_voltage(f, m, 1.0):.3f} pu at peak | median capacity {cap:.0f} kW (first 100 placements)")
    p()
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
