"""Milestone 6zk: can a causal policy that banks the pack for the payload before the dark season, from a sun climatology
built out of other years, keep a deck-solar boat's payload as lit as a vehicle that never moves, and what distance
does that cost? Checked on ten one-year missions, 2015 to 2024, with each year's climatology left out of its own test.

Why: 6zj's "Next". On one 10 kWh pack through 2024, 6zj's causal policy (Y) left the payload dark on more days than
an idle vehicle with the same panel and pack (P-30 76 against 54 days, P+30 16 against 0, P+40 121 against 102),
while its foresight plan (F) matched the idle minimum exactly at every point. The gap is a pack that enters the dark
season part-empty because (Y) keeps only a 0.5 C buffer all year. A planner cannot know next winter's sun, but can
know the climatology. This milestone tests a reservoir-style rule curve (the storage target that hydropower and water
supply reservoirs follow through the year; Loucks and van Beek 2017, Water Resource Systems Planning and
Management, Springer, open access) built from that climatology.

Data: NASA POWER daily ALLSKY_SFC_SW_DWN, public domain. 2024 transect: 6z's experiments/data/sun_flip_2024.json;
2015 to 2023 transect: experiments/data/sun_transect_2015_2023.json (fetch_sun_years.py, fetched after this file was
committed); corridor sites 2015 to 2024: milestone 5's experiments/data/daily_<site>.json. The same 30 points as 6zj
(25 transect points, A-60 left out, plus the five corridor sites); 10 years each, 300 point-years.

Rules (fixed before the 2015 to 2023 transect data were fetched and before any policy below was run):
  Boat, pack, hotel, harvest, daily step, down days and dark hours: exactly 6zj's (run_year_pack.py), one mission per
    year, launched full on 1 January. Every policy shares (Y)'s structure: hold station when the trailing 7-day mean
    harvest h7 is below the hotel load; otherwise planned power = h7 + (SOC - T(d)) / (10 days x 24 h), with the same
    within-day slowdown. Only the pack target T(d) differs.
  (Y) 6zj's policy: T = 0.5 C every day.
  (E) equinox rule (no data): T = C from the autumn to the spring equinox of the point's hemisphere (north: 22 Sep to
    19 Mar; south: 20 Mar to 21 Sep), else 0.5 C; at latitude 0, T = 0.5 C all year.
  (R) reserve curve: climatology hc(d) = mean over the other nine years of the day's harvest (Wh) at the same calendar
    day (29 Feb from the other leap years), smoothed by a 31-day centred circular moving average. Reserve
    R(d) = max(0, R(d+1) + 24 x hotel - hc(d)) on the circular year (three backward passes), the energy the pack must
    hold at the start of day d for a climatological year never to leave the payload dark. T(d) = min(C, max(0.5 C, R(d))).
  (R1) diagnostic: the same curve built from the test year's own smoothed harvest (an oracle climatology), to split
    climatology error from the rule's own structure.
  References: idle vehicle (v = 0 every day; 6zj P8 showed its dark hours equal (F)'s) and (F), 6zj's foresight DP.
  Excess dark hours = a policy's dark hours minus the idle vehicle's in the same point-year.
Predictions:
  P1  Summed over the 300 point-years, (R)'s excess dark hours are at most half of (Y)'s.
  P2  In point-years where the idle vehicle has no down day, (R) has none in at least 95% of them.
  P3  At every point within 20 degrees of the equator, (R)'s km is within 1% of (Y)'s in every year.
  P4  (E)'s summed excess dark hours are larger than (R)'s.
  P5  The median over point-years at |lat| >= 30 of (R) km / (Y) km is at least 0.90.
  P6  (R)'s summed excess dark hours are at most twice (R1)'s.
  P7  At |lat| >= 40, (R)'s dark hours are within 24 h of the idle vehicle's in at least 80% of point-years.
  P8  In 2024, (R) has fewer down days than (Y) at every point where (Y) has at least 10 more than the idle vehicle.
Descriptive (no prediction): per |lat| band, excess dark hours and km for (Y), (E), (R), (R1) and (F); the spread of
  the idle vehicle's down days over the ten years at each point (is 2024 typical?); the reserve curve's peak and the
  day it peaks.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_reserve_curve.py > experiments/results_reserve_curve.txt
(about 4 minutes; post_hoc() was added after the first run, run alone and appended, and main() now calls it)
(stdlib, deterministic)"""
import calendar
import datetime
import json
import os
import statistics as st
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_flip_map as z  # noqa: E402
import run_wave_vs_sun_sites as y  # noqa: E402
import run_year_pack as yp  # noqa: E402

C = yp.C
HOTEL = yp.HOTEL
YEARS = tuple(range(2015, 2025))
SMOOTH = 31
EQUINOX = {"N": ((9, 22), (3, 20)), "S": ((3, 20), (9, 22))}
DATA = os.path.join(HERE, "data")


def dates(year):
    d0 = datetime.date(year, 1, 1)
    return [d0 + datetime.timedelta(days=i) for i in range(366 if calendar.isleap(year) else 365)]


_SERIES = {}


def series(point):
    """{YYYYMMDD: kWh/m2/day} for 2015 to 2024 at a point."""
    if point in _SERIES:
        return _SERIES[point]
    if point in y.CORRIDOR:
        d = json.load(open(os.path.join(DATA, f"daily_{point}.json")))
        out = dict(d["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"])
    else:
        if not z.SUN:
            z.load_sun()
        out = {k: v for k, v in z.SUN[point]["daily"].items() if k.startswith("2024")}
        old = _old()[point]
        d0 = datetime.date(2015, 1, 1)
        for i, v in enumerate(old["values"]):
            out[(d0 + datetime.timedelta(days=i)).strftime("%Y%m%d")] = v
    _SERIES[point] = out
    return out


_OLD = {}


def _old():
    if not _OLD:
        _OLD.update(json.load(open(os.path.join(DATA, "sun_transect_2015_2023.json"))))
    return _OLD


def year_sun(point, year):
    s = series(point)
    vals = [s[d.strftime("%Y%m%d")] for d in dates(year)]
    if any(v < 0 for v in vals):
        raise ValueError(f"fill value at {point} {year}")
    return vals


def smooth(xs, w=SMOOTH):
    n, h = len(xs), w // 2
    return [st.fmean(xs[(i + j) % n] for j in range(-h, h + 1)) for i in range(n)]


def climatology_wh(point, year, years=YEARS):
    """Smoothed mean daily harvest (Wh) by calendar day of `year`, from the other years."""
    other = [yy for yy in years if yy != year]
    by_day = {}
    for yy in other:
        for d, k in zip(dates(yy), year_sun(point, yy)):
            by_day.setdefault((d.month, d.day), []).append(yp.harvest_wh(k))
    raw = [st.fmean(by_day.get((d.month, d.day)) or by_day[(2, 28)]) for d in dates(year)]
    return smooth(raw)


def reserve(hc, hotel=HOTEL):
    """Circular backward recursion R(d) = max(0, R(d+1) + 24 hotel - hc(d)), three passes."""
    n = len(hc)
    R = [0.0] * n
    for _ in range(3):
        for d in range(n - 1, -1, -1):
            R[d] = max(0.0, R[(d + 1) % n] + hotel * 24.0 - hc[d])
    return R


def target_from_reserve(R, cap=C):
    return [min(cap, max(0.5 * cap, r)) for r in R]


def target_equinox(lat, year, cap=C):
    if lat == 0:
        return [0.5 * cap] * len(dates(year))
    (m0, d0), (m1, d1) = EQUINOX["N" if lat > 0 else "S"]
    a, b = (m0, d0), (m1, d1)
    out = []
    for d in dates(year):
        md = (d.month, d.day)
        bank = (md >= a or md < b) if a > b else (a <= md < b)
        out.append(cap if bank else 0.5 * cap)
    return out


def causal_target(sun, target, cap=C, hotel=HOTEL):
    """6zj's (Y) with a day-varying pack target T(d). (km, down days, dark hours)."""
    h = [yp.harvest_wh(k) for k in sun]
    soc, km, down, dark = cap, 0.0, 0, 0.0
    for d, e in enumerate(h):
        past = h[max(0, d - 7):d]
        h7 = st.fmean(past) / 24.0 if past else hotel
        p = hotel if h7 < hotel else h7 + (soc - target[d]) / (10 * 24.0)
        soc, v, dh = yp.step(soc, e, yp.speed_for_power(p, hotel), cap, hotel)
        km += 86.4 * v
        down += dh > 0
        dark += dh
    return km, down, dark


def evaluate(points=None, years=YEARS, with_f=True):
    table = yp.prop_table()
    out = {}
    for p in points or yp.points():
        lat = yp.lat_of(p)
        for yr in years:
            sun = year_sun(p, yr)
            n = len(sun)
            R = reserve(climatology_wh(p, yr))
            R1 = reserve(smooth([yp.harvest_wh(k) for k in sun]))
            r = {"lat": lat,
                 "Y": causal_target(sun, [0.5 * C] * n),
                 "E": causal_target(sun, target_equinox(lat, yr)),
                 "R": causal_target(sun, target_from_reserve(R)),
                 "R1": causal_target(sun, target_from_reserve(R1)),
                 "idle": yp.idle(sun),
                 "Rpeak": max(R), "Rday": R.index(max(R)) + 1}
            if with_f:
                r["F"] = yp.foresight(sun, table=table)
            out[(p, yr)] = r
    return out


def excess(r, k):
    return r[k][2] - r["idle"][1]


def main():
    R = evaluate()
    pts = yp.points()
    print("Milestone 6zk: a climatology reserve curve for a deck-solar boat's pack, ten one-year missions 2015 to 2024")
    print(f"central boat {y.CENTRAL}, pack {C:.0f} Wh, hotel {HOTEL:.0f} W, launch full on 1 January each year; "
          f"{len(pts)} points x {len(YEARS)} years = {len(R)} point-years\n")

    print("A  per point, sums over ten years: excess dark hours over the idle vehicle (Y, E, R, R1) and km (Y, R, F);"
          "\n   idle down days per year (min / median / max, and 2024); reserve-curve peak (Wh, 2024 test year) and day")
    print("   point             lat | excess dark h:   (Y)    (E)    (R)   (R1) |   (Y) km   (R) km   (F) km | "
          "idle dn min med max 2024 | R peak day")
    for p in pts:
        rs = [R[(p, yr)] for yr in YEARS]
        idl = [r["idle"][0] for r in rs]
        r24 = R[(p, 2024)]
        print(f"   {p:16s} {rs[0]['lat']:4d} | {'':14s}"
              + " ".join(f"{sum(excess(r, k) for r in rs):6.0f}" for k in ("Y", "E", "R", "R1"))
              + f" | {sum(r['Y'][0] for r in rs):8.0f} {sum(r['R'][0] for r in rs):8.0f} {sum(r['F'][0] for r in rs):8.0f} | "
              f"{min(idl):11d} {st.median(idl):4.0f} {max(idl):4d} {r24['idle'][0]:4d} | {r24['Rpeak']:6.0f} {r24['Rday']:3d}")

    print("\nB  by |lat| band (all point-years in the band): mean excess dark hours per year, and km relative to (Y)")
    for lo, hi in ((0, 20), (25, 35), (40, 45), (50, 55), (60, 60)):
        ks = [k for k in R if lo <= abs(R[k]["lat"]) <= hi]
        if not ks:
            continue
        ex = {m: st.fmean(excess(R[k], m) for k in ks) for m in ("Y", "E", "R", "R1")}
        km = {m: sum(R[k][m][0] for k in ks) / sum(R[k]["Y"][0] for k in ks) for m in ("E", "R", "R1", "F")}
        print(f"   |lat| {lo:2d}-{hi:2d} ({len(ks):3d} point-years): excess dark h/yr "
              + ", ".join(f"({m}) {ex[m]:6.1f}" for m in ex)
              + " | km / (Y) km " + ", ".join(f"({m}) {km[m]:5.3f}" for m in km))

    print("\nPredictions")
    tot = {m: sum(excess(r, m) for r in R.values()) for m in ("Y", "E", "R", "R1")}
    print(f"P1 (R) summed excess dark h <= 0.5 x (Y)'s: {'held' if tot['R'] <= 0.5 * tot['Y'] else 'refuted'} "
          f"((R) {tot['R']:.0f}, (Y) {tot['Y']:.0f}, ratio {tot['R'] / tot['Y']:.3f})")
    z0 = [k for k in R if R[k]["idle"][0] == 0]
    ok = [k for k in z0 if R[k]["R"][1] == 0]
    bad = sorted({k[0] for k in z0 if R[k]["R"][1] > 0})
    print(f"P2 (R) no down day where idle has none, in >= 95% of {len(z0)} point-years: "
          f"{'held' if len(ok) >= 0.95 * len(z0) else 'refuted'} ({len(ok)} of {len(z0)}; points with a miss: {bad or 'none'})")
    eq = [k for k in R if abs(R[k]["lat"]) <= 20]
    dev = [abs(R[k]["R"][0] / R[k]["Y"][0] - 1) for k in eq]
    print(f"P3 (R) km within 1% of (Y) within 20 deg, every year ({len(eq)} point-years): "
          f"{'held' if max(dev) <= 0.01 else 'refuted'} (max deviation {max(dev):.4f})")
    print(f"P4 (E) summed excess dark h > (R)'s: {'held' if tot['E'] > tot['R'] else 'refuted'} "
          f"((E) {tot['E']:.0f}, (R) {tot['R']:.0f})")
    hi30 = [k for k in R if abs(R[k]["lat"]) >= 30 and R[k]["Y"][0] > 0]
    med = st.median(R[k]["R"][0] / R[k]["Y"][0] for k in hi30)
    print(f"P5 median (R) km / (Y) km at |lat| >= 30 ({len(hi30)} point-years) >= 0.90: "
          f"{'held' if med >= 0.90 else 'refuted'} (median {med:.3f})")
    print(f"P6 (R) summed excess <= 2 x (R1)'s: {'held' if tot['R'] <= 2 * tot['R1'] else 'refuted'} "
          f"((R) {tot['R']:.0f}, (R1) {tot['R1']:.0f})")
    h40 = [k for k in R if abs(R[k]["lat"]) >= 40]
    w24 = [k for k in h40 if excess(R[k], "R") <= 24.0]
    print(f"P7 (R) within 24 dark h of idle at |lat| >= 40 in >= 80% of {len(h40)} point-years: "
          f"{'held' if len(w24) >= 0.8 * len(h40) else 'refuted'} ({len(w24)} of {len(h40)})")
    gap = [p for p in pts if R[(p, 2024)]["Y"][1] - R[(p, 2024)]["idle"][0] >= 10]
    miss = [p for p in gap if not R[(p, 2024)]["R"][1] < R[(p, 2024)]["Y"][1]]
    print(f"P8 2024: (R) fewer down days than (Y) wherever (Y) has >= 10 more than idle ({len(gap)} pts): "
          f"{'held' if not miss else 'refuted'} (exceptions: {miss or 'none'}; "
          + ", ".join(f"{p} {R[(p, 2024)]['Y'][1]}->{R[(p, 2024)]['R'][1]} (idle {R[(p, 2024)]['idle'][0]})" for p in gap)
          + ")")
    post_hoc()
    return R


def post_hoc(year=2024):
    """Written after reading P1 to P8: (R) and (R1) give the same km and dark hours at every point at 40 degrees or more,
    and the reserve peaks there run to 45 to 340 kWh against a 10 kWh pack. Is the curve then just "keep the pack
    full"? For each point, the climatological mean harvest (W) of the `year` test, the deepest winter deficit the pack
    would have to bridge (the largest run of cumulative shortfall below the hotel load, one pass, kWh), and the share
    of days on which (R)'s target is the full pack."""
    print("\nPost hoc (after reading the predictions): when the reserve curve is simply 'keep the pack full'")
    print("   point             lat | clim mean harvest W | winter shortfall kWh | days at T = C")
    for p in yp.points():
        hc = climatology_wh(p, year)
        run, worst = 0.0, 0.0
        for e in hc + hc:
            run = max(0.0, run + HOTEL * 24.0 - e)
            worst = max(worst, run)
        T = target_from_reserve(reserve(hc))
        print(f"   {p:16s} {yp.lat_of(p):4d} | {st.fmean(hc) / 24.0:19.1f} | {worst / 1000.0:20.1f} | "
              f"{sum(t >= C for t in T):4d} of {len(T)}")


if __name__ == "__main__":
    main()
