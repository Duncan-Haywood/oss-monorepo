"""How far must capital costs move to flip the sand-store vs heat-pump verdict, against how far the price year moves it?

    python experiments/run.py > experiments/results.txt     # stdlib only
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from energy_store_flip import diff, flip_multiplier, win_share, variance_split, CASES, YEARS  # noqa: E402


def fmt(x):
    return "   none" if x is None else "%7.2f" % x


print("A. Capex multiplier that flips the verdict on real prices (others at 1): store+charger (x_store) and heat pump (x_hp).")
print("   x_store < 1 means the store must get cheaper than the table to win; > 1 means it can cost that many times more and still win. 'none': no flip in [0.05, 20].")
print("%-9s %-9s %-5s %9s %8s %8s" % ("scale", "case", "year", "diff", "x_store", "x_hp"))
for scale in ("house", "district"):
    for case in CASES:
        for y in YEARS:
            print("%-9s %-9s %-5d %+9.4f %s %s" % (scale, case[3], y, diff(y, scale, case), fmt(flip_multiplier(y, scale, case, "store")),
                                                    fmt(flip_multiplier(y, scale, case, "hp"))))
print()
print("B. Weekly cycling, house: the range of x_store across the five price years, against a vintage ratio of the table itself.")
print("   v0.9.2 -> head_2030 raises Sand-store capex by 1.257x and the heat pump by 1.262x (currency-year inflation, data/params.csv).")
xs = [flip_multiplier(y, "house", CASES[1], "store") for y in YEARS]
print("   x_store over years: " + " ".join(fmt(x).strip() for x in xs) + "   (min %.2f, max %.2f)" % (min(xs), max(xs)))
print()
print("C. Share of draws in which the store wins, weekly cycling, house; m_store and m_hp independent uniform on 1 +/- h (ASSUMED range).")
print("%-6s" % "h" + "".join(" %6d" % y for y in YEARS))
for h in (0.0, 0.10, 0.25, 0.50):
    print("%-6.2f" % h + "".join(" %6.2f" % win_share(y, "house", CASES[1], h, n=1 if h == 0 else 1000) for y in YEARS))
print()
print("D. Variance of the store-minus-pump diff split into between price-year and within-year (cost draws), uniform 1 +/- h. sd in EUR/kWh.")
print("%-9s %-9s %5s %9s %9s %9s %10s" % ("scale", "case", "h", "mean", "sd_year", "sd_cost", "year_share"))
for scale in ("house", "district"):
    for case in CASES[:3]:
        for h in (0.10, 0.25):
            b, w, g = variance_split(scale, case, h)
            print("%-9s %-9s %5.2f %+9.4f %9.4f %9.4f %9.2f" % (scale, case[3], h, g, b ** .5, w ** .5, b / (b + w)))
