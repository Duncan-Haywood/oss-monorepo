"""Break-even heat-pump premium over gas furnace + AC at EIA prices. Deterministic.

    PYTHONPATH=src:../house-energy/src:../house-framing/src:../house-energyprices/src python experiments/run.py > experiments/results.txt
"""
from house_energyprices.prices import STATE, prices_for
from house_hvacnpc.breakeven import premium

print("A. break-even premium at EIA prices, 3% real rate, 30 years: the heat pump may cost this much more than gas furnace + AC (negative: must cost less)")
print(f"  {'climate':18s}{'gas $/yr':>10s}{'HP $/yr':>10s}{'premium $':>11s}")
for c, st in STATE.items():
    pr = prices_for(st)
    prem, g, h = premium(c, pr)
    print(f"  {c:18s}{g:10,.0f}{h:10,.0f}{prem:11,.0f}")
print()
print("B. the same premium at 1%, 3% and 6% real discount rates")
print(f"  {'climate':18s}{'1%':>9s}{'3%':>9s}{'6%':>9s}")
for c, st in STATE.items():
    pr = prices_for(st)
    print(f"  {c:18s}" + "".join(f"{premium(c, pr, rate=r)[0]:9,.0f}" for r in (0.01, 0.03, 0.06)))
print()
print("C. the same premium if the gas price were 25% lower and 25% higher than the EIA state price")
print(f"  {'climate':18s}{'gas -25%':>10s}{'EIA':>9s}{'gas +25%':>10s}")
for c, st in STATE.items():
    p0 = prices_for(st)
    from house_energy import Prices
    mk = lambda f: Prices(gas_per_therm=p0.gas_per_therm * f, elec_per_kwh=p0.elec_per_kwh)
    print(f"  {c:18s}" + "".join(f"{premium(c, mk(f))[0]:{w},.0f}" for f, w in ((0.75, 10), (1.0, 9), (1.25, 10))))
