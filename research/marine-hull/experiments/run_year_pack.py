"""Milestone 6zj: on a year-long mission with no port call, how far does a deck-solar survey boat get, how many days is
its payload dark, and does the year still go to the boat where 6z's month-by-month map said it would?

Why: 6z's "Next". 6z ranked the 4 m deck-solar boat against the 2015 Wave Glider month by month, with (A) the
energy-neutral speed at each month's mean sun and (B) a full 10 kWh pack at the start of every month. Both hide what a
year-long line costs: (A) reports 0 km/day when harvest falls below the 30 W hotel load, but says nothing about the
payload, which then runs off the pack until the pack is empty and then goes dark; (B) hands the boat a free 10 kWh every
month, which is a monthly port call, not an autonomous year. A planner who wants a year-round line needs the year's
distance and the number of days the sensors are off, from one pack carried through all 366 days of 2024.

Data: the files 6z committed, unchanged (experiments/data/sun_flip_2024.json, NASA POWER daily all-sky surface
shortwave along 150 W and 30 W; experiments/data/daily_<site>.json at the five corridor sites; era5_flip_2024.csv for
the Wave Glider side). Points with all twelve months: 25 transect points (A-60 loses June to December to sea ice and
is left out) and the five corridor sites, 30 in all.

Rules (fixed before any year-long run):
  Boat: 6y's central boat (4 m, 30 W hotel, panel 0.20, derate 0.85, 200 kg, calm water) and its load and harvest
    functions; pack C = 10 kWh (5c's 25% of 200 kg at 200 Wh/kg); launch full on 1 January 2024; daily energy steps
    with each day's harvest = deck harvest at that day's mean insolation for 24 h. The hotel load (payload) is served
    first; a day on which the pack plus that day's harvest cannot carry the full 24 h of hotel is a "down day", the
    shortfall in hours is "dark hours", and the boat makes no way on it.
  Causal policy (Y): let h7 be the mean harvest power over days d-7..d-1 (as many as exist; on 1 January, the hotel
    load). If h7 is below the hotel load the boat holds station (v = 0) so the pack goes to the payload; otherwise
    day d's planned power is h7 + (SOC - 0.5 C) / (10 days x 24 h). Planned speed = the largest v with load(v) <= planned power, 0
    when planned power <= hotel. If the day's real harvest leaves the pack below 0 at that speed, the boat slows to
    the largest speed that keeps it at 0 or above (a controller watching the pack does this within the day); if even
    v = 0 does, it is a down day. The pack is capped at C (surplus spilled).
  Foresight plan (F): the whole year's sun known in advance. Backward dynamic programme on a 100 Wh pack grid with
    linear interpolation; action = propulsion energy per day in 50 Wh steps from 0 to 2,000 Wh; value = km minus
    1,000 per dark hour (dark hours first, then distance). The plan is executed forward on exact energies, so its km
    and dark hours are achievable, not a relaxation.
  Wave Glider: 6z's best and worst 2015 states, annual km = sum over months of days x 6z's km/day; its own payload
    power is not modelled (as in 6x to 6z).
  6z references: annual (A) = sum of days x (A) km/day; annual (B) = sum of days x (B) km/day.
Predictions:
  P1  At every point within 10 degrees of the equator (six transect points and Equator-Pacific), (Y)'s annual km is at
      least 1.3 times the Wave Glider's best-state annual km.
  P2  (F) has at least 30 down days at every kept point at 40 degrees or more (nine transect points).
  P3  (Y) has no down day at any point within 10 degrees of the equator.
  P4  (Y)'s annual km is at least 85% of (F)'s at every point where (F) has no down day.
  P5  (Y)'s annual km beats the Wave Glider's best state at every point at 20 degrees or less, and loses to it at
      every point at 50 degrees or more.
  P6  (F)'s annual km is at most 6z's annual (B) at every point.
  P7  (Y)'s annual km is at least 0.95 times 6z's annual (A) at 90% or more of the 30 points.
  P8  A zero-propulsion vehicle with the same panel, pack and 30 W hotel (v = 0 every day) has within 3 down days of
      (F) at every point: the payload goes dark for want of sun, not because the boat moved.
  P9  Corridor: (Y) has at least 60 down days at North-Sea and at Gulf-of-Alaska, and at most 10 at Florida-Straits.
Descriptive (no prediction): pack 5 and 20 kWh for (Y); a 1 July launch (July to December, then January to June);
  the largest hotel load (W, 1 W steps) with no (F) down day at each point.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_year_pack.py > experiments/results_year_pack.txt
(about a minute, stdlib, deterministic)"""
import calendar
import os
import statistics as st
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_flip_map as z  # noqa: E402
import run_wave_vs_sun_sites as y  # noqa: E402
from marine_hull.solar import deck_area, harvest_power  # noqa: E402

C = y.BATTERY_WH
LENGTH, HOTEL, ETA, DERATE = y.CENTRAL
AREA = deck_area(LENGTH)
DARK_PENALTY = 1000.0
GRID_WH = 100.0
STEP_WH = 50.0
MAX_PROP_WH = 2000.0
YEAR = 2024
DAYS = [calendar.monthrange(YEAR, m)[1] for m in range(1, 13)]


def harvest_wh(kwh_m2):
    """Wh harvested in a day at daily insolation kwh_m2 (kWh/m2/day)."""
    return harvest_power(AREA, ETA, DERATE, kwh_m2 * 1000.0 / 24.0) * 24.0


def load_w(v, hotel=HOTEL):
    return y.load_w(v, LENGTH, hotel)


def speed_for_power(p, hotel=HOTEL):
    """Largest v (m/s) with load(v) <= p W; 0 when p <= hotel."""
    if p <= hotel:
        return 0.0
    return y.bisect(lambda v: load_w(v, hotel) <= p) or 0.0


def speed_for_prop_wh(e, hotel=HOTEL):
    """Speed whose propulsion energy (load minus hotel) over 24 h is e Wh."""
    return speed_for_power(hotel + e / 24.0, hotel)


def year_sun(point, start_month=1):
    """Daily kWh/m2 for 2024 in date order, starting at start_month and wrapping."""
    order = list(range(start_month, 13)) + list(range(1, start_month))
    out = []
    for m in order:
        out += z.daily_sun(point, m)
    return out


def step(soc, harvest, v_plan, cap, hotel=HOTEL):
    """One day: (new soc, realised v, dark hours)."""
    avail = soc + harvest
    if avail < hotel * 24.0:
        return 0.0, 0.0, (hotel * 24.0 - avail) / hotel
    v = v_plan
    if avail - load_w(v, hotel) * 24.0 < 0:
        v = y.bisect(lambda x: avail - load_w(x, hotel) * 24.0 >= 0) or 0.0
    return min(cap, avail - load_w(v, hotel) * 24.0), v, 0.0


def causal(sun, cap=C, hotel=HOTEL):
    """Policy (Y): returns (km, down days, dark hours, daily v list)."""
    h = [harvest_wh(k) for k in sun]
    soc, km, down, dark, vs = cap, 0.0, 0, 0.0, []
    for d, e in enumerate(h):
        past = h[max(0, d - 7):d]
        h7 = st.fmean(past) / 24.0 if past else hotel
        p = hotel if h7 < hotel else h7 + (soc - 0.5 * cap) / (10 * 24.0)
        soc, v, dh = step(soc, e, speed_for_power(p, hotel), cap, hotel)
        km += 86.4 * v
        down += dh > 0
        dark += dh
        vs.append(v)
    return km, down, dark, vs


_PROP = None


def prop_table(hotel=HOTEL):
    """[(propulsion Wh/day, km/day)] for the action grid."""
    out = []
    e = 0.0
    while e <= MAX_PROP_WH + 1e-9:
        out.append((e, 86.4 * speed_for_prop_wh(e, hotel)))
        e += STEP_WH
    return out


def foresight(sun, cap=C, hotel=HOTEL, table=None, penalty=None):
    """Plan (F): backward DP on a GRID_WH pack grid, executed forward on exact energies. (km, down, dark)."""
    table = table or prop_table(hotel)
    pen = DARK_PENALTY if penalty is None else penalty
    h = [harvest_wh(k) for k in sun]
    n = int(round(cap / GRID_WH))
    hd = hotel * 24.0

    def interp(V, s):
        x = s / GRID_WH
        i = min(int(x), n - 1)
        f = x - i
        return V[i] * (1 - f) + V[i + 1] * f

    def best(V, soc, e):
        avail = soc + e
        if avail < hd:
            return (-(hd - avail) / hotel * pen + V[0], 0.0, 0.0, (hd - avail) / hotel)
        top = None
        for pe, km in table:
            left = avail - hd - pe
            if left < 0:
                break
            val = km + interp(V, min(cap, left))
            if top is None or val > top[0]:
                top = (val, pe, km, 0.0)
        return top

    Vs = [None] * (len(h) + 1)
    Vs[-1] = [0.0] * (n + 1)
    for d in range(len(h) - 1, -1, -1):
        Vs[d] = [best(Vs[d + 1], i * GRID_WH, h[d])[0] for i in range(n + 1)]
    soc, km, down, dark = cap, 0.0, 0, 0.0
    for d, e in enumerate(h):
        _, pe, k, dh = best(Vs[d + 1], soc, e)
        if dh > 0:
            soc = 0.0
            down += 1
            dark += dh
        else:
            soc = min(cap, soc + e - hd - pe)
            km += k
    return km, down, dark


def idle(sun, cap=C, hotel=HOTEL):
    """Zero-propulsion vehicle with the same panel, pack and hotel: (down days, dark hours)."""
    soc, down, dark = cap, 0, 0.0
    for k in sun:
        soc, _, dh = step(soc, harvest_wh(k), 0.0, cap, hotel)
        down += dh > 0
        dark += dh
    return down, dark


def max_dark_free_hotel(sun, cap=C):
    """Largest hotel load (W, 1 W steps, 1 to 60) with no down day for a zero-propulsion vehicle; 0 if none.
    For (F) no down day is possible exactly when the idle vehicle has none, since (F) can always choose v = 0."""
    best = 0
    for w in range(1, 61):
        if idle(sun, cap, float(w))[0] == 0:
            best = w
        else:
            break
    return best


def points():
    tr = [z.name(m, la) for m in z.MERIDIANS for la in z.LATS]
    return [p for p in tr if p != "A-60"] + list(y.CORRIDOR)


def lat_of(p):
    return {"Equator-Pacific": 0, "Florida-Straits": 25, "Gulf-of-Maine": 42, "North-Sea": 55,
            "Gulf-of-Alaska": 60}.get(p, None) if p in y.CORRIDOR else int(p[1:])


def evaluate():
    z.load_sun()
    a, best, worst = z.vehicle()
    rows6z = z.evaluate(a, best, worst)
    table = prop_table()
    out = {}
    for p in points():
        sun = year_sun(p)
        assert len(sun) == 366, (p, len(sun))
        r = {"lat": lat_of(p)}
        r["Y"] = causal(sun)[:3]
        r["F"] = foresight(sun, table=table)
        r["idle"] = idle(sun)
        r["A"] = sum(DAYS[m - 1] * rows6z[(p, m)]["A"] for m in range(1, 13))
        r["B"] = sum(DAYS[m - 1] * rows6z[(p, m)]["B"] for m in range(1, 13))
        r["wg"] = sum(DAYS[m - 1] * rows6z[(p, m)]["wg"] for m in range(1, 13))
        r["wgw"] = sum(DAYS[m - 1] * rows6z[(p, m)]["wgw"] for m in range(1, 13))
        r["Y5"] = causal(sun, cap=5000.0)[:3]
        r["Y20"] = causal(sun, cap=20000.0)[:3]
        r["Yjul"] = causal(year_sun(p, 7))[:3]
        r["hotel_max"] = max_dark_free_hotel(sun)
        out[p] = r
    return out


def main():
    R = evaluate()
    print("Milestone 6zj: a year-long deck-solar mission with one 10 kWh pack and no port call, 2024, against the "
          "2015 Wave Glider")
    print(f"central boat {y.CENTRAL}, deck {AREA:.3f} m2, pack {C:.0f} Wh, launch full on 1 January; "
          f"{len(R)} points with all twelve months\n")
    print("A  annual km and payload: (Y) causal policy, (F) foresight plan, 6z's monthly (A) and (B) summed, Wave Glider "
          "best and worst state;\n   down days and dark hours for (Y), (F) and an idle vehicle (same panel, pack, "
          "hotel, v = 0); largest dark-free hotel load")
    print("   point             lat    (Y) km  (F) km   6z(A)   6z(B)  WG best WG worst | (Y) dn  dark  (F) dn  dark "
          "idle dn | max W")
    for p, r in R.items():
        print(f"   {p:16s} {r['lat']:4d} {r['Y'][0]:9.0f} {r['F'][0]:7.0f} {r['A']:7.0f} {r['B']:7.0f} {r['wg']:8.0f} "
              f"{r['wgw']:8.0f} | {r['Y'][1]:6d} {r['Y'][2]:5.0f} {r['F'][1]:7d} {r['F'][2]:5.0f} {r['idle'][0]:7d} | "
              f"{r['hotel_max']:5d}")

    print("\nB  by |lat| band, transect points only (means): (Y) km / WG best km, (Y) down days, (F) down days")
    for band in (0, 10, 20, 30, 40, 50, 60):
        ps = [p for p in R if p not in y.CORRIDOR and abs(R[p]["lat"]) == band]
        print(f"   |lat| {band:2d} ({len(ps)} pts): ratio {st.fmean(R[p]['Y'][0] / R[p]['wg'] for p in ps):5.2f}, "
              f"(Y) down {st.fmean(R[p]['Y'][1] for p in ps):5.1f}, (F) down {st.fmean(R[p]['F'][1] for p in ps):5.1f}, "
              f"payload uptime (Y) {1 - st.fmean(R[p]['Y'][2] for p in ps) / (366 * 24):6.1%}")

    print("\nC  sensitivity of (Y): pack 5 / 10 / 20 kWh and a 1 July launch (km; down days)")
    for p, r in R.items():
        print(f"   {p:16s} 5 kWh {r['Y5'][0]:6.0f} {r['Y5'][1]:4d} | 10 kWh {r['Y'][0]:6.0f} {r['Y'][1]:4d} | "
              f"20 kWh {r['Y20'][0]:6.0f} {r['Y20'][1]:4d} | July launch {r['Yjul'][0]:6.0f} {r['Yjul'][1]:4d}")

    print("\nPredictions")
    eq = [p for p in R if abs(R[p]["lat"]) <= 10]
    ratios = [R[p]["Y"][0] / R[p]["wg"] for p in eq]
    print(f"P1 (Y) >= 1.3 x WG best annual km within 10 deg ({len(eq)} pts): {'held' if min(ratios) >= 1.3 else 'refuted'}"
          f" (min {min(ratios):.2f}, max {max(ratios):.2f})")
    hi = [p for p in R if p not in y.CORRIDOR and abs(R[p]["lat"]) >= 40]
    fd = [R[p]["F"][1] for p in hi]
    print(f"P2 (F) >= 30 down days at every transect point at >= 40 deg ({len(hi)} pts): "
          f"{'held' if min(fd) >= 30 else 'refuted'} (min {min(fd)}, at {hi[fd.index(min(fd))]}; max {max(fd)})")
    yd = [R[p]["Y"][1] for p in eq]
    print(f"P3 (Y) no down day within 10 deg: {'held' if max(yd) == 0 else 'refuted'} (max {max(yd)})")
    nf = [p for p in R if R[p]["F"][1] == 0]
    sh = [R[p]["Y"][0] / R[p]["F"][0] for p in nf]
    print(f"P4 (Y) >= 85% of (F) km where (F) has no down day ({len(nf)} pts): "
          f"{'held' if min(sh) >= 0.85 else 'refuted'} (min {min(sh):.3f} at {nf[sh.index(min(sh))]}, "
          f"median {st.median(sh):.3f})")
    lo = [p for p in R if abs(R[p]["lat"]) <= 20]
    far = [p for p in R if abs(R[p]["lat"]) >= 50]
    lw = [p for p in lo if not R[p]["Y"][0] > R[p]["wg"]]
    fw = [p for p in far if not R[p]["Y"][0] < R[p]["wg"]]
    print(f"P5 (Y) beats WG best at all {len(lo)} pts <= 20 deg and loses at all {len(far)} pts >= 50 deg: "
          f"{'held' if not lw and not fw else 'refuted'} (exceptions <= 20: {lw or 'none'}; >= 50: {fw or 'none'})")
    p6 = [p for p in R if R[p]["F"][0] > R[p]["B"] + 1e-6]
    print(f"P6 (F) <= 6z annual (B) at every point: {'held' if not p6 else 'refuted'} (exceptions: {p6 or 'none'})")
    p7 = [p for p in R if R[p]["Y"][0] >= 0.95 * R[p]["A"]]
    print(f"P7 (Y) >= 0.95 x 6z annual (A) at >= 90% of points: {'held' if len(p7) >= 0.9 * len(R) else 'refuted'} "
          f"({len(p7)} of {len(R)}; min ratio {min(R[p]['Y'][0] / R[p]['A'] for p in R):.3f})")
    gap = [abs(R[p]["idle"][0] - R[p]["F"][1]) for p in R]
    print(f"P8 idle vehicle within 3 down days of (F) at every point: {'held' if max(gap) <= 3 else 'refuted'} "
          f"(max gap {max(gap)})")
    c = {p: R[p]["Y"][1] for p in ("North-Sea", "Gulf-of-Alaska", "Florida-Straits")}
    p9 = c["North-Sea"] >= 60 and c["Gulf-of-Alaska"] >= 60 and c["Florida-Straits"] <= 10
    print(f"P9 (Y) down days North-Sea >= 60, Gulf-of-Alaska >= 60, Florida-Straits <= 10: "
          f"{'held' if p9 else 'refuted'} ({', '.join(f'{k} {v}' for k, v in c.items())})")
    post_hoc(R)
    return R


def post_hoc(R):
    """Written after reading P1 to P9: at P+50, A+60 and Gulf-of-Alaska (F) covers fewer km than (Y). (F) puts dark
    hours first, and there it already reaches the idle vehicle's minimum dark hours exactly, so any metre it moves
    costs payload time later in the year. The other end of the trade-off: the same DP with no dark-hour penalty
    (distance only, the payload still served whenever the pack can carry it that day)."""
    print("\nPost hoc (after reading the predictions): the two ends of the dark-hours / distance trade-off")
    print("   point             lat  (F) km  dark h | km-only km  dark h | (Y) km  dark h")
    table = prop_table()
    worse = 0
    for p, r in R.items():
        k0 = foresight(year_sun(p), table=table, penalty=0.0)
        worse += k0[0] + 1e-6 < r["Y"][0]
        if r["F"][1] or r["Y"][1]:
            print(f"   {p:16s} {r['lat']:4d} {r['F'][0]:7.0f} {r['F'][2]:7.0f} | {k0[0]:10.0f} {k0[2]:7.0f} | "
                  f"{r['Y'][0]:6.0f} {r['Y'][2]:7.0f}")
    print(f"   (points with no down day in (F) or (Y) omitted; km-only foresight below (Y)'s km at {worse} of {len(R)} points)")


if __name__ == "__main__":
    main()
