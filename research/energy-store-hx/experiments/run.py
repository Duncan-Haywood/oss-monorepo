"""Break-even price of the store's heat exchanger (house scale), by price year, cycle and sink temperature."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from energy_store_hx import hx_cost, diff_hx, breakeven_hx, flip_multiplier_hx, YEARS  # noqa: E402
from energy_store_hx.model import CASES, SAND_DISCHARGER_EUR_PER_KW  # noqa: E402

CASE = {c[3]: c for c in CASES}
SINKS = (35.0, 45.0, 55.0)
PRICES = (0, 25, 50, 100, 200)


def fmt(x):
    return "none" if x is None else f"{x:.2f}"


print(f"# Sand-discharger power block (upper anchor, converts heat to electricity): {SAND_DISCHARGER_EUR_PER_KW:.0f} EUR/kW")
print(f"# Annualised exchanger cost per kWh at 100 EUR/kW, 2000 h: {hx_cost(100):.5f} EUR/kWh")

for cyc in ("weekly", "daily"):
    print(f"\n# House, {cyc}: break-even exchanger price, EUR per kW of peak discharge (negative: store loses even at 0)")
    print("year  table(3.6)  " + "  ".join(f"hdd@{int(s)}" for s in SINKS))
    for y in YEARS:
        row = [breakeven_hx(y, "house", CASE[cyc], mode="table")]
        row += [breakeven_hx(y, "house", CASE[cyc], mode="cop_hdd", t_sink=s) for s in SINKS]
        print(f"{y}  " + "  ".join(f"{v:10.0f}" for v in row))

print("\n# Weekly house, 45 C sink: break-even exchanger price at 1000 and 500 full-load hours (peak 10 and 20 kW)")
print("year  flh2000  flh1000  flh500")
for y in YEARS:
    print(f"{y}  " + "  ".join(f"{breakeven_hx(y, 'house', CASE['weekly'], flh=f, mode='cop_hdd', t_sink=45.0):7.0f}" for f in (2000.0, 1000.0, 500.0)))

print("\n# Weekly house, 45 C sink: store-capex multiplier at which the verdict flips, by exchanger price (EUR/kW)")
print("year  " + "  ".join(f"hx{p}" for p in PRICES))
for y in YEARS:
    print(f"{y}  " + "  ".join(f"{fmt(flip_multiplier_hx(y, 'house', CASE['weekly'], p, mode='cop_hdd', t_sink=45.0)):>5}" for p in PRICES))

print("\n# Daily house, 45 C sink: same")
print("year  " + "  ".join(f"hx{p}" for p in PRICES))
for y in YEARS:
    print(f"{y}  " + "  ".join(f"{fmt(flip_multiplier_hx(y, 'house', CASE['daily'], p, mode='cop_hdd', t_sink=45.0)):>5}" for p in PRICES))
