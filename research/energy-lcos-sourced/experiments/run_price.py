"""Charging price from real day-ahead prices instead of a flat $30/MWh. Deterministic. Writes results_price.txt.
Run: python experiments/run_price.py   (needs ../energy-lcos/src and ../energy-thermal-real/data/price20XX.csv)

A store of duration D cycles min(365, 2000/D) times a year (the energy-lcos use budget), so each cycle
owns a window of 8760/cycles hours and charges in the D cheapest hours of that window (perfect foresight
within the window: a best case for the store). Charging price = mean of those hours, converted at the
same EUR/USD rate as the costs."""
import csv
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src"), str(HERE.parents[1] / "energy-lcos" / "src")]
from energy_lcos import lcos  # noqa: E402
from energy_lcos_sourced import EUR_USD, SPECS, build, load  # noqa: E402

YEARS = range(2015, 2020)
DURS = [1, 2, 4, 6, 8, 10, 12, 24, 48, 100, 168, 500]
short = lambda n: n.split(" (")[0][:10]


def prices(year):
    with open(HERE.parents[1] / "energy-thermal-real" / "data" / f"price{year}.csv") as f:
        return [float(r["price_eur_mwh"]) for r in csv.DictReader(f)][:8760]


def charge_price(p, d):
    """Mean EUR/MWh over the d cheapest hours of each window, windows tiling the year."""
    cycles = min(365, 2000 / d)
    w = max(d, round(8760 / cycles))
    tot = n = 0
    for i in range(0, len(p) - w + 1, w):
        c = sorted(p[i:i + w])[:d]
        tot += sum(c)
        n += len(c)
    return tot / n


td, _ = load()
names = list(SPECS)
P = {y: prices(y) for y in YEARS}
out = ["A. Charging price (EUR/MWh) from German day-ahead prices: mean of the D cheapest hours per cycle window; all-hours mean last",
       f"{'hours':>6} " + " ".join(f"{y:>8}" for y in YEARS) + f" {'mean':>8}"]
CP = {}
for d in DURS:
    v = [charge_price(P[y], d) for y in YEARS]
    CP[d] = v
    out.append(f"{d:>6} " + " ".join(f"{x:8.1f}" for x in v) + f" {sum(v) / len(v):8.1f}")
allmean = [sum(P[y]) / len(P[y]) for y in YEARS]
out.append(f"{'all':>6} " + " ".join(f"{x:8.1f}" for x in allmean) + f" {sum(allmean) / len(allmean):8.1f}")

out += ["", "B. LCOS ($/MWh, 7%) with the realised charging price (5-year mean, USD) and winner; flat-$30 winner for comparison",
        f"{'hours':>6} " + " ".join(f"{short(n):>10}" for n in names) + f" {'winner':>10} {'flat30':>10} {'charge$':>8}"]
chg = lambda d: sum(CP[d]) / len(CP[d]) * EUR_USD
for d in DURS:
    v = {n: lcos(build(n, td)(d), d, charge_price=chg(d)) for n in names}
    f30 = min(names, key=lambda n: lcos(build(n, td)(d), d, charge_price=30.0))
    out.append(f"{d:>6} " + " ".join(f"{v[n]:10.0f}" for n in names) + f" {short(min(v, key=v.get)):>10} {short(f30):>10} {chg(d):8.1f}")

out += ["", "C. Winner in each single year (that year's charging price), by duration"]
out.append(f"{'hours':>6} " + " ".join(f"{y:>10}" for y in YEARS))
for d in DURS:
    row = []
    for i, y in enumerate(YEARS):
        c = CP[d][i] * EUR_USD
        row.append(short(min(names, key=lambda n: lcos(build(n, td)(d), d, charge_price=c))))
    out.append(f"{d:>6} " + " ".join(f"{x:>10}" for x in row))

(HERE / "results_price.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
