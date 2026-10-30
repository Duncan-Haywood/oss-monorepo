"""Milestone 5f: daily NASA POWER insolation, 2015 to 2024: pack drawdown of the central deck-solar boat at 1 m/s.

    PYTHONPATH=src python3 experiments/run_solar_storm.py > experiments/results_solar_storm.txt
"""
import json
import os
import statistics
from marine_hull.hull import power_total, resistance, RHO_SEA
from marine_hull.solar import deck_area, harvest_power

M = 200.0
VOL = M / RHO_SEA
C_S, K_FORM, WAVE, HOTEL, ETA, DERATE = 3.0, 0.25, 1.0, 30.0, 0.20, 0.85
PACK_WH = 0.25 * M * 200.0
MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
ORDER = ["Equator-Pacific", "Florida-Straits", "Gulf-of-Maine", "North-Sea", "Gulf-of-Alaska"]
here = os.path.dirname(os.path.abspath(__file__))


def load_w(L):
    return power_total(1.0, resistance(1.0, L, VOL, C_S, K_FORM, wave_scale=WAVE), p_hotel=HOTEL)


def max_drawdown(net):
    s = peak = dd = 0.0
    for x in net:
        s += x
        peak = max(peak, s)
        dd = max(dd, peak - s)
    return dd


def window_stats(days, net_by_day, ok):
    """Split into contiguous runs of operating days; start each run with a full pack."""
    runs, cur = [], []
    for d in days:
        if ok(d):
            cur.append(d)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    empty = 0
    worst = 0.0
    for r in runs:
        soc = PACK_WH
        for d in r:
            soc = min(PACK_WH, soc + net_by_day[d])
            if soc <= 0:
                empty += 1
                soc = 0.0
        worst = max(worst, max_drawdown([net_by_day[d] for d in r]))
    return len(runs), empty, worst


for site in ORDER:
    mean = json.load(open(os.path.join(here, "data", f"power_{site}.json")))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    daily = json.load(open(os.path.join(here, "data", f"daily_{site}.json")))["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    days = sorted(k for k, v in daily.items() if v > -900)
    print(f"{site}: {len(days)} valid days of {len(daily)}")
    for L in (4.0, 5.0):
        p_load = load_w(L)
        A = deck_area(L)
        net = {d: (harvest_power(A, ETA, DERATE, daily[d] * 1000.0 / 24.0) - p_load) * 24.0 for d in days}
        neutral = {i for i, m in enumerate(MONTHS) if harvest_power(A, ETA, DERATE, mean[m] * 1000.0 / 24.0) >= p_load}
        nruns, empty, worst = window_stats(days, net, lambda d: int(d[4:6]) - 1 in neutral)
        n_op = sum(int(d[4:6]) - 1 in neutral for d in days)
        line = f"  {L:.0f} m (load {p_load:.1f} W, daily load {p_load * 24:.0f} Wh): monthly-neutral months {sorted(m + 1 for m in neutral)}; "
        if n_op:
            line += f"{n_op} operating days in {nruns} runs, empty days {empty}, worst drawdown {worst:.0f} Wh ({100 * worst / PACK_WH:.0f}% of pack, {worst / (p_load * 24):.1f} days of load)"
        else:
            line += "no neutral month"
        print(line)
        dds = []
        for y in sorted({d[:4] for d in days}):
            dds.append(max_drawdown([net[d] for d in days if d[:4] == y]))
        print(f"    year-round per-year drawdown: median {statistics.median(dds):.0f} Wh, worst {max(dds):.0f} Wh; "
              f"years within the 10 kWh pack: {sum(x <= PACK_WH for x in dds)} of {len(dds)}")
