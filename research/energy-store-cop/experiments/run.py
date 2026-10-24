"""Weather-dependent heat-pump COP against the table's 3.6: effect on the sand-store vs heat-pump verdict (house scale)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from energy_store_cop import cop_ashp, load_temp, seasonal_cop, diff, flip_multiplier, YEARS  # noqa: E402
from energy_store_cop.model import CASES  # noqa: E402

CASE = {c[3]: c for c in CASES}
SINKS = (35.0, 45.0, 55.0)


def fmt(x):
    return "none" if x is None else f"{x:.2f}"


print("# COP curve (Staffell et al. 2012 fit)")
print("source_C " + " ".join(f"sink{int(s)}" for s in SINKS))
for t in (-10, -5, 0, 5, 10, 15):
    print(f"{t:8d} " + " ".join(f"{cop_ashp(t, s):6.2f}" for s in SINKS))

print("\n# Weather and seasonal COP (heat-weighted, base 15 C)")
print("year  mean_T_NovMar  heating_degree_hours  " + "  ".join(f"SCOP@{int(s)}" for s in SINKS))
for y in YEARS:
    t = load_temp(y)
    nm = [x for i, x in enumerate(t) if i < 90 * 24 or i >= 304 * 24]
    hdh = sum(max(0.0, 15 - x) for x in t)
    print(f"{y}  {sum(nm) / len(nm):13.2f}  {hdh:20.0f}  " + "  ".join(f"{seasonal_cop(y, s):7.2f}" for s in SINKS))

for cyc in ("weekly", "daily"):
    print(f"\n# House, {cyc}: store minus pump, EUR/kWh (negative: store wins)")
    print("year  table(3.6)  " + "  ".join(f"hdd@{int(s)}" for s in SINKS) + "  flat@45")
    for y in YEARS:
        row = [diff(y, "house", CASE[cyc], mode="table")]
        row += [diff(y, "house", CASE[cyc], mode="cop_hdd", t_sink=s) for s in SINKS]
        row += [diff(y, "house", CASE[cyc], mode="cop_flat", t_sink=45.0)]
        print(f"{y}  " + "  ".join(f"{v:+9.4f}" for v in row))

    print(f"\n# House, {cyc}: store-capex multiplier at which the verdict flips (>1: store wins with room to spare)")
    print("year  table(3.6)  " + "  ".join(f"hdd@{int(s)}" for s in SINKS))
    for y in YEARS:
        row = [flip_multiplier(y, "house", CASE[cyc], mode="table")]
        row += [flip_multiplier(y, "house", CASE[cyc], mode="cop_hdd", t_sink=s) for s in SINKS]
        print(f"{y}  " + "  ".join(f"{fmt(v):>9}" for v in row))

print("\n# Weekly house, hdd weights @45C: sweep the heating base temperature (flip multiplier)")
print("year  base12  base15  base18")
for y in YEARS:
    print(f"{y}  " + "  ".join(f"{fmt(flip_multiplier(y, 'house', CASE['weekly'], mode='cop_hdd', t_base=b)):>6}" for b in (12.0, 15.0, 18.0)))
