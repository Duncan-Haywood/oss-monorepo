"""Break-even premium and break-even gas growth under real fuel-price growth. Deterministic.

    PYTHONPATH=src:../house-energy/src:../house-framing/src:../house-energyprices/src:../house-hvacnpc/src python experiments/run.py > experiments/results.txt
"""
from house_energyprices.prices import STATE, prices_for
from house_escalate import esc as E

TABS = {c: E.table(c, prices_for(st)) for c, st in STATE.items()}
GROWTH = (0.0, 0.01, 0.02, 0.03)
TARGETS = (0, 2000, 4000)

print("A. break-even heat-pump premium (USD) at 3% real rate, electricity flat in real terms, gas growing g a year in real terms")
print(f"  {'climate':18s}" + "".join(f"g={g * 100:.0f}%".rjust(10) for g in GROWTH))
for c, t in TABS.items():
    print(f"  {c:18s}" + "".join(f"{E.premium(t, g_gas=g):10,.0f}" for g in GROWTH))
print()
print("B. real yearly gas price growth at which a heat pump costing X more to install than furnace + AC ties (electricity flat; '>15%' none up to 15%, '<-5%' already ahead)")
print(f"  {'climate':18s}" + "".join(f"X={x:,}".rjust(10) for x in TARGETS))
for c, t in TABS.items():
    cells = []
    for x in TARGETS:
        g = E.breakeven_gas_growth(t, x)
        cells.append((">15%" if E.premium(t, g_gas=0.15) < x else "<-5%") if g is None else f"{g * 100:.1f}%")
    print(f"  {c:18s}" + "".join(s.rjust(10) for s in cells))
print()
print("C. the same, with electricity growing 1% a year in real terms (gas growth needed to tie)")
print(f"  {'climate':18s}" + "".join(f"X={x:,}".rjust(10) for x in TARGETS))
for c, t in TABS.items():
    cells = []
    for x in TARGETS:
        g = E.breakeven_gas_growth(t, x, g_elec=0.01)
        cells.append((">15%" if E.premium(t, g_gas=0.15, g_elec=0.01) < x else "<-5%") if g is None else f"{g * 100:.1f}%")
    print(f"  {c:18s}" + "".join(s.rjust(10) for s in cells))
print()
print("D. break-even gas growth for X = 0 at discount rates 1%, 3%, 6% (electricity flat)")
print(f"  {'climate':18s}" + "".join(f"r={r * 100:.0f}%".rjust(10) for r in (0.01, 0.03, 0.06)))
for c, t in TABS.items():
    cells = []
    for r in (0.01, 0.03, 0.06):
        g = E.breakeven_gas_growth(t, 0, rate=r)
        cells.append("n/a" if g is None else f"{g * 100:.1f}%")
    print(f"  {c:18s}" + "".join(s.rjust(10) for s in cells))
