"""Experiments for house-energy. Deterministic, a few seconds.

    PYTHONPATH=src:../house-framing/src python experiments/run.py   (from research/house-energy)
"""
from pathlib import Path

from house_energy import CLIMATES, SYSTEMS, Package, Prices, baseline, evaluate, optimise, options
from house_energy.model import ANNUITY, FLOOR_FT2, WINDOW_FT2, ua_parts, wall_numbers, WALLS, ATTIC_R, WINDOW_U

out = []
P = out.append
fmt = lambda p: f"{p.wall}, attic R-{p.attic_r}, window U {p.window_u:.2f}, {p.ach50:g} ACH50, slab {'R-10 edge' if p.slab_r else 'bare'}"
b = baseline()
P(f"house: 28 x 40 ft slab, {FLOOR_FT2:.0f} ft2, windows+slider {WINDOW_FT2:.0f} ft2; {len(options())} packages searched exhaustively")
P(f"baseline: {fmt(b)}; NPC = first cost + {ANNUITY:.2f} x annual energy cost (30 y, 3% real discount)")
P("wall options (UA of opaque wall in Btu/h F, first cost in USD at assumed prices):")
for w in WALLS:
    ua, c = wall_numbers(w)
    P(f"  {w:20s} UA {ua:5.1f}  cost ${c:,.0f}")

P("\nA. cost-optimal package by climate and heating system (default prices)")
P(f"{'climate':18s} {'system':17s} {'HDD':>5} {'CDD':>5}  {'saving vs baseline':>20}  {'energy MMBtu/yr':>16}  optimum")
rows = {}
for c, (hdd, cdd) in CLIMATES.items():
    for s in SYSTEMS:
        best, e = optimise(c, s)
        base = evaluate(b, c, s)
        rows[(c, s)] = (best, e, base)
        P(f"{c:18s} {s:17s} {hdd:5d} {cdd:5d}  ${base['npc'] - e['npc']:6,.0f} ({100 * (1 - e['npc'] / base['npc']):4.1f}%)"
          f"  {e['heat_mmbtu'] + e['cool_mmbtu']:6.1f} vs {base['heat_mmbtu'] + base['cool_mmbtu']:5.1f}  {fmt(best)}")

P("\nB. how much of the saving is the wall? NPC of optimum with the wall forced to each option, Chicago, gas")
c, s = "Chicago (5A)", "gas furnace + AC"
for w in WALLS:
    best = min((p for p in options() if p.wall == w), key=lambda p: evaluate(p, c, s)["npc"])
    e = evaluate(best, c, s)
    P(f"  {w:20s} NPC ${e['npc']:,.0f}  first cost ${e['first_cost']:,.0f}  energy ${e['annual_cost']:,.0f}/yr")

P("\nC. sensitivity of the optimum (gas furnace + AC, then heat pump) to energy price and first-cost multipliers")
for c in ("Atlanta (3A)", "Chicago (5A)", "Duluth (7)"):
    for s in SYSTEMS:
        for em in (0.5, 1.0, 2.0, 4.0):
            for cm in (0.5, 1.0, 2.0):
                pr = Prices(energy_mult=em, cost_mult=cm)
                best, e = optimise(c, s, pr)
                P(f"  {c:14s} {s:17s} energy x{em:<3g} cost x{cm:<3g} -> {fmt(best)}")

P("\nD. one upgrade at a time from the baseline: simple payback and NPC change (gas furnace + AC)")
ups = {"attic R-30 -> R-49": Package(attic_r=49), "windows U 0.35 -> 0.27": Package(window_u=0.27),
       "windows U 0.35 -> 0.20": Package(window_u=0.20), "air 5 -> 3 ACH50": Package(ach50=3.0),
       "air 5 -> 1.5 ACH50": Package(ach50=1.5), "slab edge R-10": Package(slab_r=10),
       "wall 2x4 -> advanced 2x6": Package(wall="adv 2x6"), "wall 2x4 -> conv 2x6": Package(wall="conv 2x6")}
P(f"{'upgrade':26s} " + " ".join(f"{c.split(' ')[0]:>14s}" for c in ("Atlanta (3A)", "Chicago (5A)", "Duluth (7)")) + "   (extra cost; saving USD/yr; payback years)")
for name, p in ups.items():
    cells = []
    for c in ("Atlanta (3A)", "Chicago (5A)", "Duluth (7)"):
        e0, e1 = evaluate(b, c, "gas furnace + AC"), evaluate(p, c, "gas furnace + AC")
        dc, sv = e1["first_cost"] - e0["first_cost"], e0["annual_cost"] - e1["annual_cost"]
        cells.append(f"${dc:,.0f}/${sv:,.0f}/" + ("neg" if dc <= 0 else (f"{dc / sv:.0f}y" if sv > 0 else "never")))
    P(f"{name:26s} " + " ".join(f"{x:>14s}" for x in cells))

P("\nE. where the 640-package optimum puts the heat loss, Chicago, gas (Btu/h F)")
best = rows[("Chicago (5A)", "gas furnace + AC")][0]
for k, v in ua_parts(best).items():
    P(f"  {k:13s} {v:5.1f}   baseline {ua_parts(b)[k]:5.1f}")
P("\nF. cost of a code-like floor: windows no worse than U 0.35 and air no leakier than 5 ACH50 (a stand-in for a prescriptive code, not a code check)")
P(f"{'climate':18s} {'system':17s} {'free optimum NPC':>17} {'constrained NPC':>16} {'premium':>8}  constrained optimum")
for c in CLIMATES:
    for s in SYSTEMS:
        free = rows[(c, s)][1]["npc"]
        cp = min((p for p in options() if p.window_u <= 0.35 and p.ach50 <= 5.0), key=lambda p: evaluate(p, c, s)["npc"])
        cn = evaluate(cp, c, s)["npc"]
        P(f"{c:18s} {s:17s} ${free:15,.0f} ${cn:14,.0f} ${cn - free:7,.0f}  {fmt(cp)}")
Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out[:45]))
