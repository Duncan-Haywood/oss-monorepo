"""Milestone 6y: at the five corridor sites in January and July 2024, does a deck-solar survey boat or the 2015 Wave
Glider cover more distance per day, once the solar figure is the site's own and not milestone 5c's single 86 km/day?

Why: 6x compared its ERA5 Wave Glider plan (50 to 79 km/day over open ocean at the vehicle's best month) with "the
86 km/day deck-solar ceiling", which is the 4 m monohull's 1.0 m/s best-range speed held for 24 h (LOG 5c, 6h). That
figure ignores where and when the boat sails: 5e found the same 4 m boat energy-neutral at 1 m/s in 7 months at the
equator and in none at 60 N. NASA POWER daily all-sky surface shortwave (ALLSKY_SFC_SW_DWN, kWh/m2/day; already on
disk as experiments/data/daily_<site>.json, 2015 to 2024) covers the same five sites and the same two months of 2024
as 6x's ERA5 wave plan, so the two can be compared like for like.

Rules (fixed before the first run; this docstring is committed before main() is run):
  Solar boats: the 54 boats of milestone 5e (run_solar_sites.py): length 3/4/5 m, hotel 20/30/40 W, panel efficiency
    0.15/0.20/0.23, derate 0.70/0.85; 200 kg; hull c_s 3.0, k_form 0.25, wave scale 1.0; deck area 0.6 L x 0.12 L;
    eta_prop 0.55, eta_motor 0.85 (hull.power_total defaults). Central boat: 4 m, 30 W, 0.20, 0.85. Calm water: no
    added resistance in waves (milestones 5o onwards price that separately).
  (A) Sustained speed: the highest v in [0, 3] m/s with power_total(v) <= harvest at the month's mean daily insolation
    (W/m2 = kWh/m2/day x 1000 / 24); 0 when harvest is below the hotel load. km/day = 86.4 v. This is the
    energy-neutral convention of 5c/5e (the battery covers the night).
  (B) Month campaign: the highest constant v such that a 10 kWh pack (25% of 200 kg at 200 Wh/kg, LOG 5c), starting
    full and clipped at full, never ends a day below 0 when each day adds that day's harvest and removes 24 h of load.
  (C) Worst week: (A) at the lowest 7-day running mean of daily insolation inside the month.
  Wave Glider: 6x's ERA5 plan at each site-month, km/day = 86.4 s mean (Hs/Tm)^a_e, best state s (June 2015) and
    worst (October 2015), from run_waveglider_era5_sites.py's own functions (no new fit).
Predictions:
  P1  Central boat (A) is 0 km/day in January at North-Sea and at Gulf-of-Alaska.
  P2  In July, central boat (A) beats the Wave Glider's best state at 4 or more of the 5 sites.
  P3  In January, the Wave Glider's best state beats central boat (A) at 3 or more of the 5 sites.
  P4  86 km/day lies above central boat (A) in 7 or more of the 10 site-months.
  P5  Over 54 boats x 10 site-months, the Wave Glider's best state beats (A) in 40 to 70% of cases.
  P6  No boat in any site-month has (A) above 164 km/day (1.9 m/s).
  P7  In every site-month where central (A) > 0, (B)/(A) lies in 1.05 to 1.50.
  P8  In at least half the site-months where central (A) > 0, (C) is more than 20% below (A).

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_wave_vs_sun_sites.py >
  experiments/results_wave_vs_sun_sites.txt   (seconds, stdlib, deterministic)"""
import itertools
import json
import os
import statistics as st
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from marine_hull.hull import RHO_SEA, power_total, resistance  # noqa: E402
from marine_hull.solar import deck_area, harvest_power  # noqa: E402

M = 200.0
VOL = M / RHO_SEA
C_S, K_FORM, WAVE = 3.0, 0.25, 1.0
LENGTHS, HOTELS, ETAS, DERATES = (3.0, 4.0, 5.0), (20.0, 30.0, 40.0), (0.15, 0.20, 0.23), (0.70, 0.85)
BOATS = list(itertools.product(LENGTHS, HOTELS, ETAS, DERATES))
CENTRAL = (4.0, 30.0, 0.20, 0.85)
BATTERY_WH = 0.25 * M * 200.0
VMAX = 3.0
SOLAR_5C = 86.0
CORRIDOR = ("Equator-Pacific", "Florida-Straits", "Gulf-of-Maine", "North-Sea", "Gulf-of-Alaska")
MONTHS = (1, 7)


def load_w(v, length, hotel):
    """Electrical load (W) of the 200 kg boat at speed v (m/s)."""
    if v <= 0:
        return hotel
    return power_total(v, resistance(v, length, VOL, C_S, K_FORM, wave_scale=WAVE), p_hotel=hotel)


def harvest_w(boat, w_m2):
    length, _, eta, der = boat
    return harvest_power(deck_area(length), eta, der, w_m2)


def bisect(ok, lo=0.0, hi=VMAX, n=50):
    """Largest v in [lo, hi] with ok(v), assuming ok is monotone (true below, false above); lo if ok(lo) fails."""
    if not ok(lo):
        return None
    if ok(hi):
        return hi
    for _ in range(n):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if ok(mid) else (lo, mid)
    return lo


def sustained(boat, w_m2):
    """(A) highest energy-neutral speed (m/s) at mean insolation w_m2; 0 when harvest < hotel."""
    length, hotel, _, _ = boat
    p = harvest_w(boat, w_m2)
    v = bisect(lambda x: load_w(x, length, hotel) <= p)
    return v or 0.0


def campaign(boat, daily_kwh, battery_wh=BATTERY_WH):
    """(B) highest constant speed (m/s) a full pack sustains through the month's days without ending a day below 0."""
    length, hotel, eta, der = boat
    area = deck_area(length)

    def ok(v):
        e = battery_wh
        need = load_w(v, length, hotel) * 24.0
        for k in daily_kwh:
            e = min(battery_wh, e + harvest_power(area, eta, der, k * 1000.0 / 24.0) * 24.0 - need)
            if e < 0:
                return False
        return True

    v = bisect(ok)
    return v or 0.0


def worst_week(daily_kwh):
    return min(st.fmean(daily_kwh[i:i + 7]) for i in range(len(daily_kwh) - 6))


def insolation(site, month, year=2024):
    """Daily kWh/m2 for the month, in date order, from the committed NASA POWER file."""
    d = json.load(open(os.path.join(HERE, "data", f"daily_{site}.json")))
    p = d["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]
    pre = f"{year}{month:02d}"
    vals = [p[k] for k in sorted(p) if k.startswith(pre)]
    if any(x < 0 for x in vals):
        raise ValueError(f"fill value in {site} {pre}")
    return vals


def wave_plan():
    """6x's ERA5 Wave Glider plan (best, worst state km/day) at each corridor site-month."""
    import run_waveglider_era5_sites as x
    cwd = os.getcwd()
    os.chdir(os.path.join(HERE, ".."))
    try:
        a, s, _ = x.vehicle()
        S = x.sites()
    finally:
        os.chdir(cwd)
    best, worst = max(s.values()), min(s.values())
    return {k: (x.km_exact(best, a, S[k]["h"]), x.km_exact(worst, a, S[k]["h"])) for k in S if k[0] in CORRIDOR}


def main():
    wg = wave_plan()
    print("Milestone 6y: deck-solar boat against the 2015 Wave Glider at the five corridor sites, January and July 2024")
    print("Solar: NASA POWER daily ALLSKY_SFC_SW_DWN; 54 boats of 5e; Wave Glider: 6x ERA5 plan (best / worst state)\n")
    print("A  site-month: mean / worst-week insolation (W/m2); central 4 m boat km/day (A) sustained, (B) month from full "
          "pack, (C) worst week; Wave Glider best / worst; 54-boat (A) median and max")
    rows = {}
    for mon in MONTHS:
        for site in CORRIDOR:
            daily = insolation(site, mon)
            w = st.fmean(daily) * 1000.0 / 24.0
            ww = worst_week(daily) * 1000.0 / 24.0
            a_all = [86.4 * sustained(b, w) for b in BOATS]
            ca, cb, cc = (86.4 * sustained(CENTRAL, w), 86.4 * campaign(CENTRAL, daily), 86.4 * sustained(CENTRAL, ww))
            gb, gw = wg[(site, mon)]
            rows[(site, mon)] = {"w": w, "ww": ww, "A": ca, "B": cb, "C": cc, "wg": (gb, gw), "all": a_all}
            print(f"  {mon:2d} {site:16s} {w:5.0f} {ww:5.0f} | {ca:5.1f} {cb:5.1f} {cc:5.1f} | {gb:5.1f} {gw:5.1f} | "
                  f"{st.median(a_all):5.1f} {max(a_all):5.1f}")

    print("\nB  share of the 54 boats whose (A) beats the Wave Glider (best state / worst state)")
    cases_best = 0
    n = 0
    for (site, mon), r in rows.items():
        gb, gw = r["wg"]
        sb = sum(x > gb for x in r["all"]) / len(BOATS)
        sw = sum(x > gw for x in r["all"]) / len(BOATS)
        cases_best += sum(gb > x for x in r["all"])
        n += len(BOATS)
        print(f"  {mon:2d} {site:16s} {sb:5.1%} {sw:5.1%}")

    print("\nC  which boats beat the best-state Wave Glider, share of the 10 site-months by length and hotel load")
    for L in LENGTHS:
        for h in HOTELS:
            idx = [i for i, b in enumerate(BOATS) if b[0] == L and b[1] == h]
            share = st.fmean(sum(rows[k]["all"][i] > rows[k]["wg"][0] for i in idx) / len(idx) for k in rows)
            print(f"  L {L:.0f} m, hotel {h:.0f} W: {share:5.1%}")

    print("\nPredictions")
    p1 = rows[("North-Sea", 1)]["A"] == 0 and rows[("Gulf-of-Alaska", 1)]["A"] == 0
    print(f"P1 central (A) 0 in January at North-Sea and Gulf-of-Alaska: {'held' if p1 else 'refuted'} "
          f"({rows[('North-Sea', 1)]['A']:.1f}, {rows[('Gulf-of-Alaska', 1)]['A']:.1f})")
    j = sum(rows[(s, 7)]["A"] > rows[(s, 7)]["wg"][0] for s in CORRIDOR)
    print(f"P2 July: central (A) beats Wave Glider best at >= 4 of 5 sites: {'held' if j >= 4 else 'refuted'} ({j})")
    k = sum(rows[(s, 1)]["wg"][0] > rows[(s, 1)]["A"] for s in CORRIDOR)
    print(f"P3 January: Wave Glider best beats central (A) at >= 3 of 5 sites: {'held' if k >= 3 else 'refuted'} ({k})")
    a86 = sum(SOLAR_5C > r["A"] for r in rows.values())
    print(f"P4 86 km/day above central (A) in >= 7 of 10 site-months: {'held' if a86 >= 7 else 'refuted'} ({a86})")
    sh = cases_best / n
    print(f"P5 Wave Glider best beats (A) in 40 to 70% of boat-site-months: {'held' if 0.4 <= sh <= 0.7 else 'refuted'} "
          f"({sh:.1%})")
    mx = max(max(r["all"]) for r in rows.values())
    print(f"P6 no (A) above 164 km/day: {'held' if mx <= 164 else 'refuted'} (max {mx:.1f})")
    pos = [r for r in rows.values() if r["A"] > 0]
    ratios = [r["B"] / r["A"] for r in pos]
    p7 = all(1.05 <= x <= 1.5 for x in ratios)
    print(f"P7 (B)/(A) in 1.05 to 1.50 wherever (A) > 0: {'held' if p7 else 'refuted'} "
          f"(range {min(ratios):.3f} to {max(ratios):.3f}, {len(pos)} site-months)")
    drop = sum(r["C"] < 0.8 * r["A"] for r in pos)
    print(f"P8 (C) more than 20% below (A) in at least half of those: {'held' if 2 * drop >= len(pos) else 'refuted'} "
          f"({drop} of {len(pos)})")
    return rows


if __name__ == "__main__":
    main()
