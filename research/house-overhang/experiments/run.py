"""Experiments for house-overhang. Deterministic; writes results.txt (also printed)."""
import math
from pathlib import Path

import house_overhang.model as hm
from house_energy.model import CLIMATES, WINDOW_FT2, ANNUITY, Prices, baseline
from house_overhang.model import (OVERHANG_COST, PROJECTIONS, WIN_H, OFFSET, evaluate, optimise,
                                  shaded_fraction)
from house_solar.model import LATITUDE, SPLITS

GAS, HP = "gas furnace + AC", "heat pump"
out = []


def p(s=""):
    out.append(s)
    print(s)


p("A. Share of a south window shaded at solar noon, by projection (ft), window height "
  f"{WIN_H} ft, gap {OFFSET} ft, at 41.9 N (Chicago)")
for name, n in (("21 Dec", 355), ("21 Mar", 80), ("21 Jun", 172)):
    dec = math.radians(23.45 * math.sin(2 * math.pi * (284 + n) / 365))
    alt = math.radians(90 - 41.9) + dec
    p(f"  {name}: sun altitude {math.degrees(alt):4.1f} deg  " +
      "  ".join(f"P={pr:.0f}: {shaded_fraction(pr, alt, 0.0):4.2f}" for pr in PROJECTIONS))

p()
p("B. Gross energy value of an overhang (baseline package, south-heavy glazing): 30-year NPC of energy saved vs no "
  "overhang, dollars, gas furnace + AC / heat pump (negative = the overhang costs energy)")
for c in CLIMATES:
    row = []
    for s in (GAS, HP):
        e0 = evaluate(baseline(), c, s, "south-heavy", 0.0)["annual_cost"] * ANNUITY
        row.append(f"{s}: " + " ".join(
            f"P{pr:.0f} {e0 - evaluate(baseline(), c, s, 'south-heavy', pr)['annual_cost'] * ANNUITY:+6,.0f}"
            for pr in PROJECTIONS[1:]))
    p(f"  {c:18s} " + " | ".join(row))

p()
swidth = WINDOW_FT2 * SPLITS["south-heavy"]["S"] / WIN_H
p(f"C. Cost-optimal projection with the assumed price (${OVERHANG_COST:.0f} per ft of width per ft of projection; "
  f"south glass {swidth:.0f} ft wide), exhaustive over 640 packages x 5 projections, south-heavy glazing")
for c in CLIMATES:
    for s in (GAS, HP):
        b, pr, e = optimise(c, s)
        p(f"  {c:18s} {s:17s} projection {pr:.0f} ft, window U{b.window_u}, NPC ${e['npc']:,.0f}")

p()
p("D. Break-even overhang price: the highest price multiplier (x the assumed price) tried at which a non-zero projection "
  "becomes the cost optimum, in each climate (gas furnace + AC); 'never' = not below 0.01x")
for c in CLIMATES:
    found = None
    old = hm.OVERHANG_COST
    for m in (1, .75, .5, .35, .25, .15, .1, .05, .02, .01):
        hm.OVERHANG_COST = old * m
        try:
            pr = optimise(c, GAS)[1]
        finally:
            hm.OVERHANG_COST = old
        if pr > 0:
            found = m
            break
    p(f"  {c:18s} " + (f"overhang pays at {found:g}x the assumed price (${OVERHANG_COST*found:.2f}/ft/ft)"
                       if found else "never"))

Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
