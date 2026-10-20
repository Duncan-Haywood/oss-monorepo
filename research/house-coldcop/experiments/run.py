"""Seasonal heating COP and break-even premium under a temperature-dependent COP curve. Deterministic.

    PYTHONPATH=src:../house-energy/src:../house-framing/src:../house-energyprices/src:../house-hvacnpc/src python experiments/run.py > experiments/results.txt
"""
import house_energy.model as M
from house_energyprices.prices import STATE, prices_for
from house_coldcop import cold as C

CENTRAL = (3.5, 0.045)  # COP at 47 F and COP change per F: assumed, not sourced
print("A. fitted hourly temperature distribution Normal(mu, sd) and seasonal heating COP, central curve COP(T)=max(1, 3.5+0.045(T-47))")
print(f"  {'climate':18s}{'mu F':>7s}{'sd F':>7s}{'COP':>7s}")
for c in STATE:
    mu, sd = C.fit_normal(*M.CLIMATES[c])
    print(f"  {c:18s}{mu:7.1f}{sd:7.1f}{C.seasonal_cop(c, *CENTRAL):7.2f}")
print()
print("B. break-even premium (USD) at EIA prices, 3% real rate: constant COP 2.5 (house-hvacnpc) against the central curve")
print(f"  {'climate':18s}{'const 2.5':>10s}{'curve':>9s}{'change':>9s}")
for c, st in STATE.items():
    pr = prices_for(st)
    a, _ = C.premium_with_curve(c, pr, 2.5, 0.0)
    b, _ = C.premium_with_curve(c, pr, *CENTRAL)
    print(f"  {c:18s}{a:10,.0f}{b:9,.0f}{b - a:9,.0f}")
print()
print("C. seasonal COP for each curve (COP at 47 F, slope per F)")
curves = [(c47, s) for c47 in (3.0, 3.5, 4.0) for s in (0.02, 0.045, 0.07)]
print(f"  {'climate':18s}" + "".join(f"{c47:.1f}/{s:.3f}".rjust(11) for c47, s in curves))
for c in STATE:
    print(f"  {c:18s}" + "".join(f"{C.seasonal_cop(c, *cv):11.2f}" for cv in curves))
print()
print("D. break-even premium (USD) for each curve")
print(f"  {'climate':18s}" + "".join(f"{c47:.1f}/{s:.3f}".rjust(11) for c47, s in curves))
for c, st in STATE.items():
    pr = prices_for(st)
    print(f"  {c:18s}" + "".join(f"{C.premium_with_curve(c, pr, *cv)[0]:11,.0f}" for cv in curves))
