"""Writes results.txt: breakdowns, implied markups and replica costs. Deterministic."""
import os
from garment_teardown import *

# Reported retail prices, USD, read from search-engine result snippets of the retailers' pages on
# 2026-10-13 (the pages themselves could not be fetched from the run environment).
OBSERVED = [
    (TRENCH, "Burberry, Long Kensington Heritage Trench Coat, us.burberry.com", 2850.0),
    (COAT, "Max Mara, Madame 101801 Icon coat, Net-a-Porter (Singapore site, duties incl.)", 3850.0),
]
out = []
w = out.append
for g, label, price in OBSERVED:
    w(f"## {label}: reported price ${price:,.0f}; model: {g.name}")
    for k, s in SCENARIOS.items():
        b = cost_breakdown(g, s)
        mc = monte_carlo(g, s)
        w(f"{s.name}: fabric {b['fabric']:.0f} lining {b['lining']:.0f} trims {b['trims']:.0f} "
          f"labour {b['labour']:.0f} overhead {b['overhead_profit']:.0f} -> FOB {b['fob']:.0f} "
          f"(MC 5-95%: {mc['fob'][0]:.0f}-{mc['fob'][2]:.0f}); model retail at assumed multipliers "
          f"{b['retail']:.0f} (MC {mc['retail'][0]:.0f}-{mc['retail'][2]:.0f}); "
          f"reported price / model FOB = {implied_markup(g, s, price):.1f}x; "
          f"FOB share of price {100*fob_share(g, s, price):.1f}%")
    w("")
    w("replica (cheap cloth, simple trims, 60% of sewing minutes, no markups), cost to make:")
    for k, s in SCENARIOS.items():
        r = replica(g)
        b = cost_breakdown(r, s)
        w(f"  {s.name}: fabric+lining {b['fabric']+b['lining']:.0f} trims {b['trims']:.0f} "
          f"labour {b['labour']:.0f} -> total {b['fob']:.0f}")
    r = replica(g, shell_price_per_m2=4.0, lining_price_per_m2=2.0, trims=5.0, sam_minutes=g.sam_minutes*0.4)
    b = cost_breakdown(r, SCENARIOS["low-wage"])
    w(f"  leanest case (cloth $4/m2, 40% sewing minutes, low wage): {b['fob']:.0f}")
    w("")
# Sensitivity: which input moves model FOB most (+-25% each, trench, mid-wage)
from dataclasses import replace
base = cost_breakdown(TRENCH, SCENARIOS["mid-wage"])["fob"]
w("## one-at-a-time +25% sensitivity of model FOB, trench, mid-wage")
rows = []
for f in ["piece_area_m2", "shell_price_per_m2", "lining_price_per_m2", "trims", "sam_minutes",
          "cutting_finishing_minutes", "overhead_rate", "marker_efficiency"]:
    v = cost_breakdown(replace(TRENCH, **{f: getattr(TRENCH, f) * 1.25}), SCENARIOS["mid-wage"])["fob"]
    rows.append((abs(v/base-1), f, v/base-1))
for _, f, d in sorted(rows, reverse=True):
    w(f"  {f}: {100*d:+.1f}%")
w(f"  wage_per_hour: {100*(cost_breakdown(TRENCH, replace(SCENARIOS['mid-wage'], wage_per_hour=7.5))['fob']/base-1):+.1f}%")
path = os.path.join(os.path.dirname(__file__), "results.txt")
open(path, "w").write("\n".join(out) + "\n")
print("\n".join(out))
