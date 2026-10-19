"""Experiments for house-solar. Deterministic; writes results.txt (also printed)."""
import sys
from pathlib import Path

from house_energy.model import CLIMATES, Package, Prices, baseline, evaluate as old_eval, optimise as old_opt
from house_solar.model import SHGC, SPLITS, evaluate, optimise, options, solar_table

GAS, HP = "gas furnace + AC", "heat pump"
out = []


def p(s=""):
    out.append(s)
    print(s)


p("A. Incident solar on a vertical surface, kBtu/ft2 per year (heating-weighted / cooling-weighted), by orientation")
for c in CLIMATES:
    t = solar_table(c)
    p(f"  {c:18s} " + "  ".join(f"{o} {t[o][0]/1e3:5.1f}/{t[o][1]/1e3:5.1f}" for o in "SEWN"))

p()
p("B. Cost-optimal package with solar gain (even split) vs house-energy's (lumped 25% gains credit); window U chosen")
for c in CLIMATES:
    for s in (GAS, HP):
        b0, e0 = old_opt(c, s)
        b1, e1 = optimise(c, s)
        base1 = evaluate(baseline(), c, s)
        p(f"  {c:18s} {s:17s} old: U{b0.window_u} attic R{b0.attic_r} ach{b0.ach50} slab R{b0.slab_r} | "
          f"new: {b1.wall} U{b1.window_u} attic R{b1.attic_r} ach{b1.ach50} slab R{b1.slab_r} "
          f"NPC ${e1['npc']:,.0f} saves ${base1['npc']-e1['npc']:,.0f}")

p()
p("C. Window orientation is free: NPC of the optimum package by glazing split (gas furnace + AC)")
for c in ("Atlanta (3A)", "Chicago (5A)", "Duluth (7)", "Miami (1A)", "Albuquerque (4B)"):
    row = []
    for name in SPLITS:
        b, e = optimise(c, GAS, name)
        row.append(f"{name} ${e['npc']:,.0f} (U{b.window_u})")
    p(f"  {c:18s} " + " | ".join(row))

p()
p("D. Same, best split minus worst split, NPC dollars, both systems")
for c in CLIMATES:
    d = []
    for s in (GAS, HP):
        v = [optimise(c, s, n)[1]["npc"] for n in SPLITS]
        d.append(f"{s} ${max(v)-min(v):,.0f}")
    p(f"  {c:18s} " + " | ".join(d))

p()
p("E. Does a better window ever pay, and does the assumed SHGC change that? Chicago, gas, south-heavy glazing: extra NPC of forcing each window over the free optimum, by SHGC of the U 0.20 glass")
for g in (0.20, 0.28, 0.40, 0.50):
    sh = dict(SHGC)
    sh[0.20] = g
    free = optimise("Chicago (5A)", GAS, "south-heavy", shgc=sh)[1]["npc"]
    forced = min(evaluate(q, "Chicago (5A)", GAS, "south-heavy", shgc=sh)["npc"] for q in options() if q.window_u == 0.20)
    p(f"  SHGC(U0.20)={g:.2f}: forcing U 0.20 costs ${forced-free:,.0f} NPC over the optimum")

p()
p("F. House-energy's code-like floor (U <= 0.35) re-priced with solar: extra NPC of forcing U<=0.35, even split")
for c in ("Miami (1A)", "Atlanta (3A)", "Chicago (5A)", "Duluth (7)"):
    for s in (GAS, HP):
        free = optimise(c, s)[1]["npc"]
        forced = min(evaluate(q, c, s)["npc"] for q in options() if q.window_u <= 0.35 and q.ach50 <= 5)
        p(f"  {c:18s} {s:17s} ${forced-free:,.0f}")

Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
