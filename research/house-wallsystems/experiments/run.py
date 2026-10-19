"""Experiments for house-wallsystems. Deterministic (seeded), a few seconds.

    PYTHONPATH=src:../house-framing/src python experiments/run.py   (from research/house-wallsystems)
"""
from pathlib import Path

from house_wallsystems import SYSTEMS, Climate, evaluate, monte_carlo, net_wall_area, pareto

out = []
P = out.append
area = net_wall_area()
P(f"house: 28 x 40 ft, 8 ft walls (house-framing); net exterior wall area {area:,.0f} sq ft after openings")
P("all per-sq-ft inputs are stylised ranges from memory, not quotes or EPDs; heating: 5000 HDD, $0.15/kWh, COP 3, 30 yr at 5%")

P("\nA. Midpoint inputs, whole house")
P(f"{'system':24s} {'cost $':>8} {'$/sf':>5} {'kgCO2e':>8} {'R':>4} {'crew h':>7} {'heat PV $':>10} {'cost+heat $':>12}")
mid = {}
for s in SYSTEMS:
    e = evaluate(s, area)
    mid[s.name] = (e["cost"], e["carbon"], e["r"])
    P(f"{s.name:24s} {e['cost']:8,.0f} {s.cost[1]:5.1f} {e['carbon']:8,.0f} {e['r']:4.0f} {e['hours']:7,.0f} {e['heat_pv']:10,.0f} {e['cost'] + e['heat_pv']:12,.0f}")

P("\nB. Not dominated at midpoints on (cost, carbon, R)")
P(", ".join(pareto(mid)))

P("\nC. Monte Carlo: 20,000 independent triangular draws per system between its low and high")
mc = monte_carlo(area)
P(f"{'system':24s} {'cheapest':>9} {'lowest CO2e':>12} {'lowest cost+heat':>17} {'first cost < wood':>18}")
for s in SYSTEMS:
    w = mc["wins"][s.name]
    P(f"{s.name:24s} {w['cost']:9.1%} {w['carbon']:12.1%} {w['total']:17.1%} {mc['beats_wood_first_cost'][s.name]:18.1%}")

P("\nD. Heat-loss price: cost + heat PV at midpoints as electricity price rises (COP 3)")
P(f"{'$/kWh':>6} " + " ".join(f"{s.name[:11]:>12}" for s in SYSTEMS) + "  best")
for p in (0.10, 0.15, 0.25, 0.40, 0.80):
    c = Climate(price_kwh=p)
    row = {s.name: evaluate(s, area, c=c)["cost"] + evaluate(s, area, c=c)["heat_pv"] for s in SYSTEMS}
    P(f"{p:6.2f} " + " ".join(f"{v:12,.0f}" for v in row.values()) + f"  {min(row, key=row.get)}")

P("\nE. Cold climates: cost + heat PV at midpoints by heating degree days (electricity $0.15)")
P(f"{'HDD':>6} " + " ".join(f"{s.name[:11]:>12}" for s in SYSTEMS) + "  best")
for hdd in (2000, 5000, 8000, 12000):
    c = Climate(hdd=hdd)
    row = {s.name: evaluate(s, area, c=c)["cost"] + evaluate(s, area, c=c)["heat_pv"] for s in SYSTEMS}
    P(f"{hdd:6d} " + " ".join(f"{v:12,.0f}" for v in row.values()) + f"  {min(row, key=row.get)}")

P("\nF. How far would an alternative's first cost have to fall to tie wood on cost + heat PV (midpoints)?")
w = evaluate(SYSTEMS[0], area)
wt = w["cost"] + w["heat_pv"]
P(f"{'system':24s} {'cost now $/sf':>14} {'tie $/sf':>9} {'cut needed':>11}")
for s in SYSTEMS[1:]:
    e = evaluate(s, area)
    tie = (wt - e["heat_pv"]) / area
    P(f"{s.name:24s} {s.cost[1]:14.1f} {tie:9.1f} {1 - tie / s.cost[1]:11.0%}" + ("  (already ties or beats)" if tie >= s.cost[1] else ""))

Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
