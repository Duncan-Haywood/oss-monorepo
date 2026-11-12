"""Milestone 6z: month by month and latitude by latitude, where does a deck-solar survey boat go further per day than
the 2015 Wave Glider, and where does the ranking flip?

Why: 6y compared the two at five corridor sites in January and July 2024 only and found the ranking flips by season
and latitude, not by vehicle: in July the 4 m deck-solar boat beat the Wave Glider's best state at all five sites, in
January the Wave Glider won at four of five. Its "Next" asked to extend both plans to all twelve months with ERA5 and
NASA POWER to map the flip latitude by month. Two months and five sites cannot say where the flip sits, whether it
moves smoothly with the sun, or how many months a year each vehicle leads at a given latitude, which is what a
survey planner choosing a platform for a year-round line needs.

Data (experiments/fetch_flip_map.py, fetched after this docstring and main() were committed): 2024 ERA5 swh and mwp
(Open-Meteo `era5_ocean`, CC BY 4.0) and NASA POWER daily ALLSKY_SFC_SW_DWN at the five corridor sites and along
150 W and 30 W, 60 S to 60 N every 10 degrees (26 transect points; land and sea-ice point-months dropped, reported).

Rules (fixed before the data were fetched):
  Solar boats: 6y's 54 boats and its functions, unchanged (5e's sweep; central boat 4 m, 30 W, panel 0.20, derate
    0.85; calm water). (A) sustained energy-neutral speed at the month's mean insolation, 0 below the hotel load;
    (B) highest constant speed a full 10 kWh pack carries through the month's days. km/day = 86.4 v.
  Wave Glider: 6x's ERA5 law, unchanged: a_e and the monthly state index s from run_waveglider_era5_sites.vehicle();
    best state = June 2015, worst = October 2015; km/day = 86.4 s mean(q^a_e) over the point-month's 20 quantiles of
    q = Hs/Tm (6x's grid method, max error 0.29% on 32 site-months).
  Winner of a point-month: central (A) against the Wave Glider's best state (ties go to neither).
  Flip latitude (per meridian, month and hemisphere): the smallest |lat| on that meridian and side of the equator
    (the equator point counts for both sides) at which the Wave Glider's best state beats central (A); "none" when
    the boat wins at every kept latitude.
  Winter hemisphere: north in December, January, February; south in June, July, August.
Predictions:
  P1  Central (A) is 0 at every kept transect point at 40 degrees or more in the winter hemisphere's January (north)
      and July (south).
  P2  Central (A) > 0 in at least 90% of the kept point-months within 10 degrees of the equator.
  P3  Spearman between |lat| and the number of 2024 months the Wave Glider's best state wins, over the kept transect
      points, is at least 0.7.
  P4  The winter flip latitude lies at 20 to 40 degrees in all four cases (P and A meridians; north in January,
      south in July).
  P5  In the summer hemisphere's peak month (north in July, south in January), central (A) beats the Wave Glider's
      best state at 8 or more of the 10 transect points at 10 to 50 degrees.
  P6  Over all kept transect point-months, the Wave Glider's best state wins in 35 to 65%.
  P7  Corridor sites, months of 2024 the central boat (A) wins: Equator-Pacific 9 or more; North-Sea 5 or fewer;
      Gulf-of-Alaska 4 or fewer.
  P8  Replacing (A) by (B) moves 3 to 15 percentage points of the transect point-months from the Wave Glider to the
      boat.
  P9  Dividing the Wave Glider plan by 6x's median ERA5/buoy ratio 1.101 changes the winner in at most 10% of the
      transect point-months and moves no winter flip latitude by more than 10 degrees.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_flip_map.py > experiments/results_flip_map.txt
(seconds, stdlib, deterministic)"""
import csv
import json
import os
import statistics as st
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_wave_vs_sun_sites as y  # noqa: E402

D = os.path.join(HERE, "data") + os.sep
ERA5_BUOY = 1.101
MERIDIANS = ("P", "A")
LATS = tuple(range(-60, 61, 10))
WINTER = {"N": (12, 1, 2), "S": (6, 7, 8)}
MON = "JFMAMJJASOND"


def vehicle():
    """(a_e, best s, worst s) from 6x's own functions."""
    import run_waveglider_era5_sites as x
    cwd = os.getcwd()
    os.chdir(os.path.join(HERE, ".."))
    try:
        a, s, _ = x.vehicle()
    finally:
        os.chdir(cwd)
    return a, max(s.values()), min(s.values())


def km_quant(s, a, q):
    return 86.4 * s * st.fmean(v ** a for v in q)


def waves():
    """{(point, month): {"lat", "lon", "q"}} from the committed ERA5 file."""
    out = {}
    for r in csv.DictReader(open(D + "era5_flip_2024.csv")):
        out[(r["point"], int(r["month"]))] = {"lat": float(r["lat"]), "lon": float(r["lon"]),
                                               "q": [float(r[f"q{j + 1:02d}"]) for j in range(20)]}
    return out


def daily_sun(point, month):
    """Daily kWh/m2 for one 2024 month, date order: transect from power_flip_2024.json, corridor from 5's files."""
    if point in y.CORRIDOR:
        return y.insolation(point, month)
    p = SUN[point]["daily"]
    pre = f"2024{month:02d}"
    vals = [p[k] for k in sorted(p) if k.startswith(pre)]
    if any(v < 0 for v in vals):
        raise ValueError(f"fill value in {point} {pre}")
    return vals


SUN = {}


def load_sun():
    SUN.update(json.load(open(D + "power_flip_2024.json")))


def name(mer, lat):
    return f"{mer}{lat:+d}"


def evaluate(a, best, worst):
    """Rows per kept point-month: insolation, central (A) and (B), 54-boat (A), Wave Glider best and worst."""
    W = waves()
    rows = {}
    for (pt, m), wv in sorted(W.items()):
        daily = daily_sun(pt, m)
        w = st.fmean(daily) * 1000.0 / 24.0
        rows[(pt, m)] = {"w": w, "A": 86.4 * y.sustained(y.CENTRAL, w), "B": 86.4 * y.campaign(y.CENTRAL, daily),
                         "all": [86.4 * y.sustained(b, w) for b in y.BOATS],
                         "wg": km_quant(best, a, wv["q"]), "wgw": km_quant(worst, a, wv["q"])}
    return rows


def flip(rows, mer, month, side, scale=1.0, key="A"):
    lats = [la for la in LATS if (la >= 0 if side == "N" else la <= 0)]
    for la in sorted(lats, key=abs):
        r = rows.get((name(mer, la), month))
        if r is not None and r["wg"] / scale > r[key]:
            return abs(la)
    return None


def spearman(x, y_):
    import run_waveglider_era5_sites as x6
    return x6.spearman(x, y_)


def fmt(v):
    return "none" if v is None else f"{v:d}"


def main():
    load_sun()
    a, best, worst = vehicle()
    rows = evaluate(a, best, worst)
    print("Milestone 6z: deck-solar boat against the 2015 Wave Glider, every month of 2024, along 150 W and 30 W")
    print(f"Wave Glider law a_e {a:.3f}, best state s {best:.3f}, worst {worst:.3f}; central boat {y.CENTRAL}\n")
    tr = [name(m, la) for m in MERIDIANS for la in LATS]
    kept = [k for k in rows if k[0] in tr]
    allpm = len(tr) * 12
    print(f"Kept transect point-months: {len(kept)} of {allpm}")
    for p in tr:
        miss = [m for m in range(1, 13) if (p, m) not in rows]
        if miss:
            print(f"  {p}: dropped months {''.join(MON[m - 1] for m in miss) if len(miss) < 12 else 'all (land)'}")

    print("\nA  winner by point and month: B = central boat (A) faster, W = Wave Glider best state faster, . = no data;"
          "\n   then months won by the boat, and 2024 mean km/day of central (A), (B), Wave Glider best, worst")
    print("   point   " + MON + "   boat  (A)   (B)   WGb   WGw")
    won = {}
    for p in tr + list(y.CORRIDOR):
        s = ""
        rs = []
        for m in range(1, 13):
            r = rows.get((p, m))
            if r is None:
                s += "."
                continue
            rs.append(r)
            s += "B" if r["A"] > r["wg"] else ("W" if r["wg"] > r["A"] else "=")
        if not rs:
            continue
        won[p] = (s.count("B"), s.count("W"))
        print(f"  {p:16s} {s} {s.count('B'):5d} {st.fmean(r['A'] for r in rs):5.1f} {st.fmean(r['B'] for r in rs):5.1f} "
              f"{st.fmean(r['wg'] for r in rs):5.1f} {st.fmean(r['wgw'] for r in rs):5.1f}")

    print("\nB  central (A) km/day and Wave Glider best-state km/day by point and month")
    for p in tr + list(y.CORRIDOR):
        cells = []
        for m in range(1, 13):
            r = rows.get((p, m))
            cells.append("    .    " if r is None else f"{r['A']:4.0f}/{r['wg']:<4.0f}")
        print(f"  {p:16s} " + " ".join(cells))

    print("\nC  flip latitude (smallest |lat| where the Wave Glider's best state wins), by month; none = boat wins at all")
    print("   meridian side " + " ".join(f"{c:>4s}" for c in MON))
    for mer in MERIDIANS:
        for side in ("N", "S"):
            print(f"   {mer}        {side}    " + " ".join(f"{fmt(flip(rows, mer, m, side)):>4s}" for m in range(1, 13)))

    print("\nD  share of the 54 boats whose (A) beats the Wave Glider's best state, by |lat| band, all months and meridians")
    for band in (0, 10, 20, 30, 40, 50, 60):
        ks = [k for k in kept if abs(int(k[0][1:])) == band]
        if ks:
            sh = st.fmean(sum(x > rows[k]["wg"] for x in rows[k]["all"]) / len(y.BOATS) for k in ks)
            print(f"   |lat| {band:2d}: {sh:5.1%} of boats over {len(ks)} point-months")

    print("\nPredictions")
    z = []
    for mer in MERIDIANS:
        z += [(name(mer, la), 1) for la in (40, 50, 60)] + [(name(mer, -la), 7) for la in (40, 50, 60)]
    z = [k for k in z if k in rows]
    p1 = all(rows[k]["A"] == 0 for k in z)
    print(f"P1 central (A) 0 at |lat| >= 40 in the winter hemisphere (Jan N, Jul S): {'held' if p1 else 'refuted'} "
          f"({sum(rows[k]['A'] == 0 for k in z)} of {len(z)} zero; max {max(rows[k]['A'] for k in z):.1f} km/day)")
    eq = [k for k in kept if abs(int(k[0][1:])) <= 10]
    pos = sum(rows[k]["A"] > 0 for k in eq) / len(eq)
    print(f"P2 central (A) > 0 in >= 90% of point-months within 10 deg of the equator: "
          f"{'held' if pos >= 0.9 else 'refuted'} ({pos:.1%} of {len(eq)})")
    tw = [p for p in tr if p in won]
    rho = spearman([abs(int(p[1:])) for p in tw], [won[p][1] for p in tw])
    print(f"P3 Spearman(|lat|, months the Wave Glider wins) >= 0.7: {'held' if rho >= 0.7 else 'refuted'} "
          f"({rho:.3f}, {len(tw)} points)")
    wf = [flip(rows, mer, m, side) for mer in MERIDIANS for side, m in (("N", 1), ("S", 7))]
    p4 = all(v is not None and 20 <= v <= 40 for v in wf)
    print(f"P4 winter flip latitude in 20 to 40 (P N Jan, P S Jul, A N Jan, A S Jul): {'held' if p4 else 'refuted'} "
          f"({', '.join(fmt(v) for v in wf)})")
    sk = [(name(mer, la), 7) for mer in MERIDIANS for la in (10, 20, 30, 40, 50)] + \
         [(name(mer, -la), 1) for mer in MERIDIANS for la in (10, 20, 30, 40, 50)]
    sk = [k for k in sk if k in rows]
    sw = sum(rows[k]["A"] > rows[k]["wg"] for k in sk)
    print(f"P5 summer peak month: central (A) wins at >= 8 of 10 points at 10 to 50 deg, per hemisphere: "
          f"{'held' if all(sum(rows[k]['A'] > rows[k]['wg'] for k in sk if (k[1] == 7) == (h == 'N')) >= 8 for h in 'NS') else 'refuted'}"
          f" (north July {sum(rows[k]['A'] > rows[k]['wg'] for k in sk if k[1] == 7)} of "
          f"{sum(1 for k in sk if k[1] == 7)}, south January {sum(rows[k]['A'] > rows[k]['wg'] for k in sk if k[1] == 1)}"
          f" of {sum(1 for k in sk if k[1] == 1)}; {sw} of {len(sk)} in all)")
    wgsh = sum(rows[k]["wg"] > rows[k]["A"] for k in kept) / len(kept)
    print(f"P6 Wave Glider best wins in 35 to 65% of transect point-months: {'held' if 0.35 <= wgsh <= 0.65 else 'refuted'}"
          f" ({wgsh:.1%})")
    c = {p: won[p][0] for p in y.CORRIDOR if p in won}
    p7 = c["Equator-Pacific"] >= 9 and c["North-Sea"] <= 5 and c["Gulf-of-Alaska"] <= 4
    print(f"P7 corridor months won by the boat (Equator-Pacific >= 9, North-Sea <= 5, Gulf-of-Alaska <= 4): "
          f"{'held' if p7 else 'refuted'} ({', '.join(f'{k} {v}' for k, v in c.items())})")
    moved = sum(rows[k]["wg"] > rows[k]["A"] and not rows[k]["wg"] > rows[k]["B"] for k in kept) / len(kept)
    back = sum(not rows[k]["wg"] > rows[k]["A"] and rows[k]["wg"] > rows[k]["B"] for k in kept)
    print(f"P8 (B) in place of (A) moves 3 to 15 pp of point-months to the boat: "
          f"{'held' if 0.03 <= moved <= 0.15 else 'refuted'} ({moved:.1%}; {back} moved the other way)")
    ch = sum((rows[k]["wg"] > rows[k]["A"]) != (rows[k]["wg"] / ERA5_BUOY > rows[k]["A"]) for k in kept) / len(kept)
    shifts = []
    for mer in MERIDIANS:
        for side in ("N", "S"):
            for m in WINTER[side]:
                f0, f1 = flip(rows, mer, m, side), flip(rows, mer, m, side, ERA5_BUOY)
                shifts.append(0 if f0 == f1 else (99 if None in (f0, f1) else abs(f1 - f0)))
    p9 = ch <= 0.10 and max(shifts) <= 10
    print(f"P9 Wave Glider / 1.101 changes <= 10% of winners and no winter flip by > 10 deg: {'held' if p9 else 'refuted'}"
          f" ({ch:.1%} changed; largest winter flip shift {max(shifts) if max(shifts) < 99 else 'to or from none'})")
    return rows


if __name__ == "__main__":
    main()
