"""Experiments for house-foundation. Deterministic (seeded), a few seconds.

    PYTHONPATH=src:../house-framing/src python experiments/run.py   (from research/house-foundation)
"""
from pathlib import Path

from house_foundation import KINDS, PRICES, Site, cheapest, cost_of, design_load_plf, footing_width_in, mid_prices, monte_carlo, quantities
from house_foundation.model import NAMES

out = []
P = out.append
AREA = 28 * 40
P("house: 28 x 40 ft, 1,120 sq ft footprint (house-framing); unit prices are stylised ranges from memory, not quotes")
P("foundation cost includes the ground floor surface (slab, or framed floor over the crawlspace or basement)")

P("\nA. Footing width (in) the bearing check asks for, by allowable soil bearing (minimum built: 16 in)")
P(f"{'bearing psf':>12} " + " ".join(f"{NAMES[k][:12]:>13}" for k in KINDS))
for q in (600, 1000, 1500, 2000, 3000):
    P(f"{q:12d} " + " ".join(f"{footing_width_in(k, Site(bearing_psf=q)):13.0f}" for k in KINDS))
P("(unrounded need at 2,000 psf, in: " + ", ".join(f"{NAMES[k]} {design_load_plf(k) / (2000 - 100) * 12:.1f}" for k in KINDS) + ")")

P("\nB. Midpoint first cost ($), concrete (cy) and excavation (cy) by frost depth, 2,000 psf soil")
P(f"{'frost in':>9} " + " ".join(f"{NAMES[k][:12]:>13}" for k in KINDS) + "  cheapest")
for f in (12, 24, 36, 48, 60):
    s = Site(frost_in=f)
    k, tot = cheapest(s)
    P(f"{f:9d} " + " ".join(f"{tot[x]:13,.0f}" for x in KINDS) + f"  {NAMES[k]}")
P("\n   concrete cy (footing, wall, slab) and dig cy at 48 in frost:")
for k in KINDS:
    q = quantities(k, Site(frost_in=48))
    P(f"   {NAMES[k]:26s} struct {q['struct_cy']:5.1f}  slab {q['slab_cy']:5.1f}  dig {q['dig_cy']:6.1f}  CO2e {cost_of(q)[1]:7,.0f} kg  cost {cost_of(q)[0]:8,.0f}")

P("\nC. Cheapest foundation by frost depth at midpoints, 6 in steps (first cost)")
row = []
for f in range(12, 66, 6):
    k, tot = cheapest(Site(frost_in=f))
    row.append(f"{f}in:{k}")
P("  ".join(row))
P("slab minus frost-protected shallow, by frost depth ($): " + ", ".join(
    f"{f}in {cost_of(quantities('slab', Site(frost_in=f)))[0] - cost_of(quantities('fpsf', Site(frost_in=f)))[0]:+,.0f}" for f in (12, 18, 24, 30, 36, 48, 60)))

P("\nD. Monte Carlo: 5,000 shared draws of every unit price (triangular, low to high); share of draws each type is cheapest")
P(f"{'frost in':>9} " + " ".join(f"{NAMES[k][:12]:>13}" for k in KINDS))
mcs = {}
for f in (12, 24, 36, 48, 60):
    mc = monte_carlo(Site(frost_in=f))
    mcs[f] = mc
    P(f"{f:9d} " + " ".join(f"{mc['wins'][k]:13.1%}" for k in KINDS))

P("\nE. What a basement adds: basement minus crawlspace first cost per added sq ft of floor (10th, 50th, 90th percentile of the draws)")
for f in (12, 24, 36, 48, 60):
    lo, med, hi = mcs[f]["increment_psf"]
    P(f"   frost {f:2d} in: ${lo:5.1f} / ${med:5.1f} / ${hi:5.1f} per sq ft (midpoints ${(cost_of(quantities('basement', Site(frost_in=f)))[0] - cost_of(quantities('crawl', Site(frost_in=f)))[0]) / AREA:.1f})")

P("\nF. One-at-a-time: swing in (basement minus crawlspace) at 48 in frost when each price goes low to high, others at midpoint ($)")
qb, qc = quantities("basement", Site(frost_in=48)), quantities("crawl", Site(frost_in=48))
base = cost_of(qb)[0] - cost_of(qc)[0]
P(f"midpoint difference ${base:,.0f}")
rows = []
for name, (lo, mid, hi) in PRICES.items():
    d = []
    for v in (lo, hi):
        p = mid_prices()
        p[name] = v
        d.append(cost_of(qb, p)[0] - cost_of(qc, p)[0])
    rows.append((abs(d[1] - d[0]), name, d))
for _, name, d in sorted(rows, reverse=True)[:6]:
    P(f"   {name:12s} {d[0]:9,.0f} to {d[1]:9,.0f}")

P("\nG. Soil bearing: crawlspace at 48 in frost, midpoint first cost by allowable bearing")
for q in (600, 1000, 1500, 2000, 3000):
    qq = quantities("crawl", Site(frost_in=48, bearing_psf=q))
    P(f"   {q:5d} psf: footing {qq['footing_in']:.0f} in, ${cost_of(qq)[0]:,.0f}")

P("\nH. How wrong could the frost-protected shallow foundation's insulation be? Insulation quantity multiple at which it ties a conventional slab (midpoint prices)")
for f in (18, 24, 36, 48, 60):
    s = Site(frost_in=f)
    qf, qs = quantities("fpsf", s), quantities("slab", s)
    gap = cost_of(qs)[0] - cost_of(qf)[0]
    foam = qf["foam_sf"] * mid_prices()["foam"]
    P(f"   frost {f:2d} in: slab costs ${gap:+,.0f} more; insulation is ${foam:,.0f}, so a tie needs {1 + gap / foam:.1f}x the modelled insulation")

Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
