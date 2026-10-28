"""Milestone 1 sweep: shaft energy per cycle by circuit. Deterministic, stdlib, <5 s.

Grid: demand (flow scale), spread (pressure imbalance), pump flow, dp_ls, dp_spool, dp_m, eta_pump.
Prints, per circuit pair, the share of cases where the first uses less energy and the median ratio.
"""
import itertools, statistics, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from heavy_hydraulics import cycle_energy, scale_cycle, REFERENCE_CYCLE

DEMAND = (0.5, 0.75, 1.0)
SPREAD = (0.0, 0.5, 1.0, 1.5)
PUMP = (35.0, 40.0, 50.0)
DP_LS = (14.0, 20.0, 30.0)
DP_SPOOL = (5.0, 10.0, 20.0)
DP_M = (3.0, 5.0, 10.0)
ETA = (0.75, 0.85, 0.92)

rows = []
for d, s, pf, dl, ds, dm, e in itertools.product(DEMAND, SPREAD, PUMP, DP_LS, DP_SPOOL, DP_M, ETA):
    c = scale_cycle(REFERENCE_CYCLE, d, s)
    try:
        r = {k: cycle_energy(c, k, pf, ds, dl, dm, e) for k in ("open_centre", "load_sensing", "metered")}
    except ValueError:
        continue
    rows.append((d, s, r))

print(f"cases: {len(rows)} of {len(DEMAND)*len(SPREAD)*len(PUMP)*len(DP_LS)*len(DP_SPOOL)*len(DP_M)*len(ETA)}")
def ratio(a, b, sel=lambda d, s: True):
    xs = [r[a]["shaft_J"] / r[b]["shaft_J"] for d, s, r in rows if sel(d, s)]
    return statistics.median(xs), min(xs), max(xs), sum(x < 1 for x in xs) / len(xs)
for a, b in (("load_sensing", "open_centre"), ("metered", "load_sensing"), ("metered", "open_centre")):
    m, lo, hi, w = ratio(a, b)
    print(f"{a}/{b}: median {m:.3f} (min {lo:.3f}, max {hi:.3f}); {a} lower in {100*w:.1f}% of cases")
print("\nLS / open-centre by demand (flow scale):")
for d in DEMAND:
    print(f"  demand {d}: median {ratio('load_sensing','open_centre',lambda dd,s:dd==d)[0]:.3f}")
print("metered / LS by pressure spread:")
for s in SPREAD:
    print(f"  spread {s}: median {ratio('metered','load_sensing',lambda d,ss:ss==s)[0]:.3f}")
ref = {k: cycle_energy(REFERENCE_CYCLE, k) for k in ("open_centre", "load_sensing", "metered")}
print("\nreference cycle (defaults):")
for k, v in ref.items():
    print(f"  {k}: shaft {v['shaft_J']/1000:.1f} kJ, hydraulic efficiency {100*v['efficiency']:.1f}%")
