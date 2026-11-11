"""Milestone 6r: at the programme's 2024 buoys, how much of a Wave Glider's planned km/day is set by the site's sea
state, and how much by the vehicle state (6p's 30% mission drift)?

Why: 6p's P5 rows (36.5 to 50.1 km/day) used a foil model refuted in shape and a pooled power law U = 0.387 Hs^0.669
fitted on pooled hours, where the mission drift is mixed into the sea-state response. 6q measured the response at a fixed vehicle
state, U proportional to Hs^b with b = 0.218 (training hours), and found the vehicle's own recent speed carries most of
the forecastable signal. 6q's reading guessed, by arithmetic only, that site differences (about 8% for 50% more Hs)
are smaller than the drift (30%). This run does that comparison on the real 2024 hourly buoy records.

Model (fixed before the first run): U = s_m * Hs^b. The vehicle-state index of 2015 mission month m is
s_m = median over that month's hours of u / Hs^b (speed >= 0.1 m/s, any buoy distance, months with >= 100 hours),
b = 0.218 from 6q (sensitivity: 0.188 and 0.248, 6q's other two fits). At each 2024 buoy-month (January and July,
>= 500 hourly WVHT values, as 6p) the planned distance is 86.4 * mean over hours of s * Hs^b km/day.
Two states are carried: "best" = max s_m, "worst" = min s_m.
  site ratio  = within one 2024 month and one state, max over buoys / min over buoys of km/day.
  state ratio = s_best / s_worst (the same at every buoy, since s multiplies).
Predictions:
  P1  In both January and July the site ratio is smaller than the state ratio.
  P2  The fleet median (median over buoys) of January km/day over July km/day, at a fixed state, is below 1.15.
  P3  Every buoy-month at the best state is below the 86 km/day solar ceiling (milestone 5c).
  P4  Changing b from 0.218 to 0.188 or 0.248 moves each month's fleet median km/day (best state) by under 5%.
  P5  The fleet median at the worst state lies inside 6p's P5 power-law range of fleet medians (32.9 to 42.5 km/day)
      widened by 10% (29.6 to 46.8).
Also reported (descriptive): the per-buoy table, the share of the variance in log km/day over the
{buoy x month x state} grid that is between states.

Run: python3 experiments/run_waveglider_site.py > experiments/results_waveglider_site.txt   (under 1 s, stdlib)"""
import csv
import math
import statistics as st

D = "experiments/data/"
B = 0.218
B_SENS = (0.188, 0.248)
SOLAR = 86.0


def mission_states(b):
    by = {}
    for r in csv.DictReader(open(D + "waveglider_hourly.csv")):
        u = float(r["speed"])
        if u < 0.1:
            continue
        by.setdefault(r["hour"][:7], []).append(u / float(r["wvht"]) ** b)
    return {m: st.median(v) for m, v in sorted(by.items()) if len(v) >= 100}


def buoy_hs():
    by = {}
    for x in csv.DictReader(open(D + "ndbc_waves_2024.csv")):
        by.setdefault((x["buoy"], int(x["month"])), []).append(float(x["wvht"]))
    return {k: v for k, v in by.items() if len(v) >= 500}


def km_day(s, hs, b):
    return 86.4 * st.fmean(s * h ** b for h in hs)


def plan(b):
    s = mission_states(b)
    hs = buoy_hs()
    best, worst = max(s.values()), min(s.values())
    tab = {}
    for (buoy, m), v in hs.items():
        tab[(buoy, m)] = (km_day(best, v, b), km_day(worst, v, b), st.median(v))
    return s, best, worst, tab


def main():
    s, best, worst, tab = plan(B)
    print(f"b = {B}; 2015 mission vehicle-state index s_m = median(u / Hs^b), m/s per m^b:")
    for m, v in s.items():
        print(f"  {m}  {v:.3f}")
    ratio_state = best / worst
    print(f"  best {best:.3f}, worst {worst:.3f}; state ratio {ratio_state:.3f}\n")
    print("2024 buoy-months (km/day at best / worst state; median WVHT m):")
    med = {}
    ok1 = True
    ok3 = True
    for mon in (1, 7):
        rows = sorted((k[0], v) for k, v in tab.items() if k[1] == mon)
        for buoy, (kb, kw, h) in rows:
            print(f"  {mon:2d} {buoy}  {kb:5.1f}  {kw:5.1f}  {h:.2f}")
            ok3 = ok3 and kb < SOLAR
        kbs = [v[0] for _, v in rows]
        kws = [v[1] for _, v in rows]
        site = max(kbs) / min(kbs)
        med[mon] = (st.median(kbs), st.median(kws))
        print(f"  month {mon}: {len(rows)} buoys, fleet median {med[mon][0]:.1f} (best) / {med[mon][1]:.1f} (worst) "
              f"km/day; site ratio {site:.3f} against state ratio {ratio_state:.3f}")
        ok1 = ok1 and site < ratio_state
    print()
    print(f"P1 site ratio < state ratio in both months: {'held' if ok1 else 'refuted'}")
    jj = med[1][0] / med[7][0]
    print(f"P2 fleet median Jan / Jul at a fixed state = {jj:.3f}: {'held' if jj < 1.15 else 'refuted'} (< 1.15)")
    print(f"P3 every buoy-month below {SOLAR:.0f} km/day at the best state: {'held' if ok3 else 'refuted'}")
    ok4 = True
    for b in B_SENS:
        _, _, _, t2 = plan(b)
        for mon in (1, 7):
            m2 = st.median(v[0] for k, v in t2.items() if k[1] == mon)
            d = m2 / med[mon][0] - 1
            print(f"  b = {b}: month {mon} fleet median (best) {m2:.1f} km/day ({d:+.1%})")
            ok4 = ok4 and abs(d) < 0.05
    print(f"P4 fleet medians move under 5% over b 0.188 to 0.248: {'held' if ok4 else 'refuted'}")
    ok5 = all(29.6 <= med[mon][1] <= 46.8 for mon in (1, 7))
    print(f"P5 worst-state fleet medians {med[1][1]:.1f} (Jan) and {med[7][1]:.1f} (Jul) inside 29.6 to 46.8: "
          f"{'held' if ok5 else 'refuted'}")

    print("\nDescriptive: variance of log km/day over the buoy x month x state grid")
    cells = [(k[0], k[1], j, math.log(v[j])) for k, v in tab.items() for j in (0, 1)]
    mu = st.fmean(c[3] for c in cells)
    tot = sum((c[3] - mu) ** 2 for c in cells)

    def between(key):
        g = {}
        for c in cells:
            g.setdefault(key(c), []).append(c[3])
        return sum(len(v) * (st.fmean(v) - mu) ** 2 for v in g.values()) / tot

    print(f"  share between states {between(lambda c: c[2]):.3f}; between months {between(lambda c: c[1]):.3f}; "
          f"between buoys {between(lambda c: c[0]):.3f} (one-way shares, unbalanced grid, need not sum to 1)")


if __name__ == "__main__":
    main()
