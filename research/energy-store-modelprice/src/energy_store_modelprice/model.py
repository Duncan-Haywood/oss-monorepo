"""Run the sand-store vs heat-pump comparison of energy-thermal-real on a modelled price.

The modelled price is the leave-one-year-out residual-load fit of energy-price-residual. Stdlib only.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
for p in ("energy-price-residual", "energy-thermal-real", "energy-thermal-hourly", "energy-thermal-cost", "energy-thermal"):
    sys.path.insert(0, str(ROOT / p / "src"))
from energy_price_residual import isotonic_fit, predict, load_year_rows, YEARS  # noqa: E402
from energy_thermal_cost import load, store_lcoh, hp_lcoh  # noqa: E402
from energy_thermal_hourly import load_year, cheapest_mean, heating_season_mean  # noqa: E402
from energy_thermal_real import load_prices  # noqa: E402

SCALES = {"house": 1.0e4, "district": 5.0e6}
CASES = [(1, 300, 365, "daily"), (7, 52, 52, "weekly"), (30, 12, 12, "monthly"), (120, 1, 1, "seasonal")]
TD = load("head_2030")


def price_sources(test_year):
    """EUR/kWh series for `test_year`: real, resid (fit on the other years), resid+ (oracle mean), merit (flat 54.6)."""
    rows = {y: load_year_rows(y) for y in YEARS}
    tr = [r for y in YEARS if y != test_year for r in rows[y]]
    fit = isotonic_fit([r[0] for r in tr], [r[1] for r in tr])
    real = load_prices(test_year)
    resid = [predict(fit, r[0]) / 1000.0 for r in rows[test_year]]
    shift = sum(real) / len(real) - sum(resid) / len(resid)
    return {"real": real, "resid": resid, "resid+": [p + shift for p in resid], "merit": [0.0546] * len(real)}


def executed_cheapest_mean(plan, actual, windows, frac):
    """Mean *actual* price paid when the charge hours are the cheapest `frac` of each window by the `plan` series.
    Ties in `plan` break by hour order."""
    n = len(plan)
    size = n // windows
    k = max(1, round(size * frac))
    total = 0.0
    for i in range(windows):
        idx = sorted(range(i * size, (i + 1) * size), key=lambda j: plan[j])[:k]
        total += sum(actual[j] for j in idx) / k
    return total / windows


def case_costs(store_price, hp_price, scale, case, frac=0.25):
    """(store, heat pump) levelised cost of heat in EUR/kWh at the given electricity prices."""
    s, n, _w, _name = case
    r = store_lcoh(TD, "sand", scale, SCALES[scale], n, s, store_price, charge_frac=frac)
    hc, he = hp_lcoh(TD, scale, SCALES[scale], hp_price)
    return r["total"], hc + he


def verdict(store, hp, tol=0.002):
    """'store' / 'pump' / 'tie' (within `tol` EUR/kWh)."""
    d = store - hp
    return "tie" if abs(d) <= tol else ("store" if d < 0 else "pump")

