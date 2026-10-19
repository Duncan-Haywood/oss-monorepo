"""Run the LCOS experiments and write results.txt (deterministic). Run: PYTHONPATH=src python experiments/run.py"""
from dataclasses import replace
from pathlib import Path
from energy_lcos import TECHS, lcos, winner, crossover, cycles_per_year, life_years

HERE = Path(__file__).resolve().parent
DURS = [1, 2, 4, 8, 10, 24, 48, 100, 168, 500]
names = list(TECHS)
short = lambda n: n.split(" (")[0][:10]
out = []


def row(label, vals):
    return f"{label:>6} " + " ".join(f"{v:>10}" for v in vals)


out.append("A. LCOS, $/MWh delivered (7% discount, charging power $30/MWh, 2000 discharge-hours/yr, <=365 cycles/yr)")
out.append(row("hours", [short(n) for n in names] + ["winner"]))
for d in DURS:
    out.append(row(d, [f"{lcos(t, d):.0f}" for t in TECHS.values()] + [short(winner(d).name)]))

out.append("")
out.append("B. Cycles per year and economic life in years at each duration")
out.append(row("hours", ["cycles"] + [short(n) for n in names]))
for d in DURS:
    c = cycles_per_year(d)
    out.append(row(d, [f"{c:.0f}"] + [f"{life_years(t, c):.1f}" for t in TECHS.values()]))

out.append("")
out.append("C. Crossover durations in hours (above this the second technology is cheaper)")
pairs = [("li-ion (LFP)", "pumped hydro"), ("li-ion (LFP)", "compressed air (cavern)"),
         ("li-ion (LFP)", "hydrogen (cavern)"), ("compressed air (cavern)", "hydrogen (cavern)")]
for a, b in pairs:
    x = crossover(TECHS[a], TECHS[b])
    out.append(f"{a} -> {b}: " + (f"{x:.1f}" if x else "none"))

out.append("")
out.append("D. Winner by duration under changed assumptions (hours: 2 4 8 24 100 500)")
sd = [2, 4, 8, 24, 100, 500]
for label, kw in [("base", {}), ("rate 3%", {"rate": 0.03}), ("rate 12%", {"rate": 0.12}),
                  ("free charging power", {"charge_price": 0.0}), ("charging $100/MWh", {"charge_price": 100.0}),
                  ("500 discharge-h/yr", {"hours_budget": 500.0}), ("4000 discharge-h/yr", {"hours_budget": 4000.0})]:
    out.append(f"{label:<22}" + " ".join(f"{short(winner(d, **kw).name):>10}" for d in sd))

out.append("")
out.append("E. Li-ion energy cost ($/kWh, power cost fixed) at which it ties the best other technology (base case 200)")
li = TECHS["li-ion (LFP)"]
out.append(row("hours", ["breakeven"]))
for d in [4, 8, 10, 24, 48]:
    target = min(lcos(t, d) for k, t in TECHS.items() if k != li.name)
    if lcos(replace(li, energy_cost=0.0), d) > target:
        out.append(row(d, ["none"]))
        continue
    lo, hi = 0.0, 1000.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if lcos(replace(li, energy_cost=mid), d) < target:
            lo = mid
        else:
            hi = mid
    out.append(row(d, [f"{lo:.0f}"]))

(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
