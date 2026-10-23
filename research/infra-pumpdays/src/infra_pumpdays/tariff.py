"""PG&E Electric Schedule B-19 (Medium General Demand-Metered TOU Service), Secondary voltage, total bundled rates.

Source: PG&E tariff book, ELEC_SCHEDS_B-19.pdf (https://www.pge.com/tariffs/assets/pdf/tariffbook/ELEC_SCHEDS_B-19.pdf):
Sheet 4 "Total bundled time-of-use rates" (effective March 1, 2026 on the sheet read; this is a published list price,
before riders and taxes) and Section 6 "Definition of time periods". Retrieved 2026-10-23. The customer charge is flat and
left out. Demand is the highest 15-minute average (Sheet 2, "Definition of Maximum Demand"). Mandatory B-19 applies above
499 kW; below it the schedule is voluntary, and Net3's pumps peak well under that, so this is "what B-19 would charge",
not a claim that a utility of Net3's size is on it.

Each season gives, per hour of the day: the energy price in $/kWh and the period (P peak, PP part-peak, O off-peak,
S super off-peak); and the demand charges in $/kW-month: on the highest 15-minute demand in the peak period, in the
part-peak period, and at any time.
"""
import numpy as np

# hour -> period; both seasons: peak 16:00-21:00 every day (Section 6)
_PEAK = range(16, 21)


def _periods(summer, spring):
    p = ["O"] * 24
    if summer:  # Jun 1 - Sep 30: part-peak 14-16 and 21-23
        for h in (14, 15, 21, 22):
            p[h] = "PP"
    if spring:  # Mar - May: super off-peak 09-14
        for h in range(9, 14):
            p[h] = "S"
    for h in _PEAK:
        p[h] = "P"
    return p


SEASONS = {
    # months in the season: Jun-Sep 4, Oct-Feb 5, Mar-May 3 (12 in all)
    "summer": dict(months=4, periods=_periods(True, False),
                   energy={"P": 0.18648, "PP": 0.14775, "O": 0.12037},
                   demand={"P": 46.16, "PP": 10.52, "ANY": 37.37}),
    "winter": dict(months=5, periods=_periods(False, False),
                   energy={"P": 0.16188, "O": 0.12026},
                   demand={"P": 2.31, "PP": 0.0, "ANY": 37.37}),
    "spring": dict(months=3, periods=_periods(False, True),
                   energy={"P": 0.16188, "O": 0.12026, "S": 0.06442},
                   demand={"P": 2.31, "PP": 0.0, "ANY": 37.37}),
}
DAYS_PER_MONTH = 365.0 / 12


def hourly_price(season):
    s = SEASONS[season]
    return np.array([s["energy"][p] for p in s["periods"]])


def month_bill(kw, season, demand=True):
    """Monthly energy (+ demand) charge in dollars for a day's quarter-hour power `kw` (96 values) repeated every day.

    energy = DAYS_PER_MONTH x sum(kW x 0.25 h x price of that hour); demand = sum over {peak, part-peak, any hour} of
    rate x highest quarter-hour kW inside that period.
    """
    s = SEASONS[season]
    hour = np.arange(len(kw)) // 4
    per = np.array(s["periods"])[hour]
    price = hourly_price(season)[hour]
    energy = DAYS_PER_MONTH * float((kw * 0.25 * price).sum())
    if not demand:
        return energy, 0.0
    d = s["demand"]
    dem = d["ANY"] * float(kw.max())
    for code in ("P", "PP"):
        sel = per == code
        if sel.any():
            dem += d[code] * float(kw[sel].max())
    return energy, dem
