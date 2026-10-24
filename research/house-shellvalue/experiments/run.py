"""Experiments for house-shellvalue. Deterministic.  python experiments/run.py > experiments/results.txt"""
import sys
from dataclasses import replace
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src")] + [str(HERE.parents[1] / p / "src") for p in ("house-schedule", "house-offsite", "house-framing")]

from house_offsite import Process  # noqa: E402
from house_schedule import Params  # noqa: E402
from house_shellvalue import breakeven_price, premium_dollars, shell_value  # noqa: E402

N = 4000
print("house-shellvalue: does a factory shell pay once the interest on the days it saves is counted?")
print("Days and interest % come from house-schedule (wall+roof shell); premium from house-offsite (wall panels only).")
print("House price is a parameter, not sourced. Every rate is an assumption of the sibling projects.\n")

P0 = premium_dollars()
print(f"A. Premium of panelising the walls, house-offsite defaults: ${P0:,.0f}")
for crane in (1500, 750, 0):
    print(f"   crane day ${crane:>5}: ${premium_dollars(replace(Process(), crane_day_cost=crane)):,.0f}")

print(f"\nB. Interest saved by the factory shell (N={N} builds, common random numbers), rate 8%")
print(f"{'ordering':28s} {'lead d':>6} {'days saved':>10} {'% of price':>10} {'break-even price at $1,500 crane':>34}")
rows = {}
for label, early, lead in (("ordered at foundation start", False, 25.0), ("ordered at foundation start", False, 10.0),
                           ("ordered at foundation start", False, 5.0), ("ordered at day 0", True, 25.0)):
    r = shell_value(n=N, order_early=early, prefab_lead=lead)
    rows[(early, lead)] = r
    be = breakeven_price(r["interest_pct_saved"], P0)
    print(f"{label:28s} {lead:6.0f} {r['days_saved']:10.1f} {r['interest_pct_saved']:10.2f} "
          f"{('${:,.0f}'.format(be)) if be else 'never':>34}")

print("\nC. Net value of the shell (interest saved - premium), dollars, by house price; ordered at day 0, lead 25 d")
r = rows[(True, 25.0)]
print(f"{'price':>10} " + " ".join(f"crane ${c:>5}" for c in (1500, 750, 0)))
for price in (300_000, 450_000, 600_000, 800_000):
    cells = [r["interest_pct_saved"] / 100 * price - premium_dollars(replace(Process(), crane_day_cost=c)) for c in (1500, 750, 0)]
    print(f"{price:10d} " + " ".join(f"{v:12.0f}" for v in cells))

print("\nD. Same, ordered at foundation start (lead 25 d)")
r = rows[(False, 25.0)]
for price in (300_000, 450_000, 600_000, 800_000):
    cells = [r["interest_pct_saved"] / 100 * price - premium_dollars(replace(Process(), crane_day_cost=c)) for c in (1500, 750, 0)]
    print(f"{price:10d} " + " ".join(f"{v:12.0f}" for v in cells))

print("\nE. Interest-rate sensitivity of the break-even price (ordered at day 0, $1,500 crane)")
for rate in (0.04, 0.08, 0.12):
    r = shell_value(replace(Params(), rate=rate), n=N, order_early=True)
    be = breakeven_price(r["interest_pct_saved"], P0)
    print(f"   rate {rate:.2f}: saves {r['interest_pct_saved']:.2f}% of price; break-even price ${be:,.0f}")
