"""Milestone 6zu: does 6zt's pack-scaled blend rule hold when time runs the other way?

Why: 6zt's "Next". 6zt read a pack-scaled rule for a 50 W payload off its test tables (2020 to 2024): plan speed from
W(a) = a L + (1 - a) K (L: the vehicle's 7-day trailing mean harvest, K: the day-of-year climatology) with
  PS: 2.5 kWh -> W(0.5) at tau 60; 5 kWh -> W(0.5) at tau 30; 10 and 20 kWh -> W(0.375) at tau 30.
It dominated the trailing-mean rule B in 12 of 12 (split x pack) 50 W cells, but in sample: the rule was chosen by
looking at those same cells. This milestone scores PS, unchanged, on years it was not read from.

Split R (reversed time): the climatology is built from 2020 to 2024 only, and the test years are 2015 to 2019.
  Selection years 2020-2024: each year's climatology from the other four of 2020 to 2024 (strict history, as before).
  Test years 2015-2019: climatology from all five of 2020 to 2024, so no test-year data enters the climatology,
  the target or any choice. (The climatology then comes from later calendar years; that is a robustness check on
  a stationary-climate assumption every split here already makes, not a causal forecast.)
  2015-2019 were 6zt's *selection* years, with a climatology built from 2015-2019; here they are scored with a
  different climatology and no tuning, and PS was read from 2020-2024 test tables, so the pairing is fresh but the
  weather is not unseen by the programme. Disclosed, not hidden.
Test regions (fixed rule, so regions are only aggregations): All (30 points), AtlC (12 Atlantic + 5 corridor, 6zt's
  S1 test set), PacC (13 Pacific + 5 corridor, 6zt's S2 test set).

Everything else is 6zt's (boat, harvest, daily step, launch full each 1 January, the 30 points, target
T = lead(max(0.5 C, Rc), 45 days) built from that year's climatology, gate dropped, speed rule
p = f(d) + (SOC - T(d)) / (tau 24), 6zt's 36-variant grid of a in {0, 0.125, ..., 1} x tau {10, 20, 30, 60},
B = (L, 10, theta 1), selection rule S, "dominates B" = test km >= B's and test excess dark hours <= B's).
"R pick" = rule S over the 36 variants on all 30 points, selection years 2020-2024.

Predictions (fixed here and committed before any configuration below was run):
  P1  PS dominates B on split R's test years, all 30 points, at at least 3 of the 4 50 W packs.
  P2  PS dominates B in at least 9 of the 12 (region x pack) 50 W cells.
  P3  PS's test km / B is at least 1.0 in 12 of 12 (region x pack) 50 W cells.
  P4  The R pick's weight a* at 50 W is within 0.125 of 6zt's split-T a* (0.5, 0.5, 0.375, 0.5 for 2.5 to 20 kWh)
      at at least 3 of the 4 packs.
  P5  PS's test km / B is within 0.02 of the R pick's (all points) at at least 3 of the 4 50 W packs.
  P6  PS dominates B in at least as many of the 12 50 W cells as 6zt's fixed default W(0.5) at tau 30.
  P7  6zt's P5 replicates on R: the R pick's mean a* over the 4 packs is non-decreasing from 10 to 30 to 50 W and
      at most 0.25 at 10 W.
Descriptive: per (region, 50 W pack), test km / B and excess / B for PS, the default, the R pick and best-on-test.

Data: as 6zk to 6zt (NASA POWER daily ALLSKY_SFC_SW_DWN, public domain; experiments/data/). No new data.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_reverse_split.py > experiments/results_reverse_split.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import statistics as st
import sys
from functools import lru_cache
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_blend_transfer as bt  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_year_pack as yp  # noqa: E402

CONFIGS, PACKS, HOTELS = bt.CONFIGS, bt.PACKS, bt.HOTELS
GRID, BASE, DEFAULT = bt.GRID, bt.BASE, bt.DEFAULT
YEARS = bt.YEARS
SEL = tuple(y for y in YEARS if y >= 2020)
TEST = tuple(y for y in YEARS if y <= 2019)
PS = {2500.0: (0.5, 60), 5000.0: (0.5, 30), 10000.0: (0.375, 30), 20000.0: (0.375, 30)}
T_ASTAR = {2500.0: 0.5, 5000.0: 0.5, 10000.0: 0.375, 20000.0: 0.5}  # 6zt split T picks at 50 W
REGIONS = {"All": bt.PTS, "AtlC": bt.ATLANTIC + bt.CORRIDOR, "PacC": bt.PACIFIC + bt.CORRIDOR}


@lru_cache(maxsize=None)
def _clim(p, yr):
    """Climatology for (point, year) from 2020-2024 only, excluding the year itself."""
    return tuple(rc.climatology_wh(p, yr, years=SEL))


def score(key):
    """6zt's score with split R's climatology: ((cap, hotel, point, year), {variant: (km, excess dark h, moved)})."""
    cap, hotel, p, yr = key
    sun = rc.year_sun(p, yr)
    hc = list(_clim(p, yr))
    T = pt.target(hc, cap, hotel)
    idle_dark = yp.idle(sun, cap, hotel)[1]
    b = sw.run(sun, T, hc, *sw.BASE, cap, hotel)
    out = {BASE: (b["km"], b["dark"] - idle_dark, b["moved"])}
    h = [yp.harvest_wh(k) for k in sun]
    for a, tau in GRID:
        km, dark, moved = bt.run(h, T, hc, a, tau, cap, hotel)
        out[(a, tau)] = (km, dark - idle_dark, moved)
    return key, out


def evaluate(configs=CONFIGS, points=bt.PTS, procs=4):
    keys = [(c, h, p, yr) for c, h in configs for p in points for yr in YEARS]
    with Pool(procs) as pool:
        return dict(pool.map(score, keys, chunksize=5))


def summarise(cells, configs=CONFIGS):
    out = {}
    for c, h in configs:
        sel = bt.total(cells, [(c, h, p, yr) for p in bt.PTS for yr in SEL])
        pick = bt.select(sel)
        for name, pts in REGIONS.items():
            test = bt.total(cells, [(c, h, p, yr) for p in pts for yr in TEST])
            out[(name, c, h)] = {"sel": sel, "test": test, "pick": pick, "best_test": bt.select(test)}
    return out


def row(t, g):
    b = t[BASE]
    return t[g][0] / b[0], bt.ratio(t[g][1], b[1]), bt.dominates(t, g)


def main():
    cells = evaluate()
    S = summarise(cells)
    print("Milestone 6zu: 6zt's pack-scaled blend rule PS on a reversed time split")
    print(f"split R: climatology from {SEL[0]}-{SEL[-1]} (strict history in those years), test {TEST[0]}-{TEST[-1]}; "
          f"grid weights {bt.WEIGHTS} x tau {bt.TAUS}, gate theta 0; B = {sw.BASE}; target lead 45 days")
    print("PS: " + ", ".join(f"{c / 1000:g} kWh -> W({a}) tau {t}" for c, (a, t) in PS.items()))

    print("\nPer configuration (test years; R pick chosen on all 30 points, 2020-2024)")
    for (name, c, h), s in S.items():
        if name != "All":
            continue
        t, b = s["test"], s["test"][BASE]
        print(f"\n[R] C {c / 1000:.1f} kWh, hotel {h:.0f} W: R pick a {s['pick'][0]:.3f} tau {s['pick'][1]}; "
              f"best-on-test a {s['best_test'][0]:.3f} tau {s['best_test'][1]}; test B km {b[0]:.0f}, excess {b[1]:.0f}")
        print("     a     | " + " | ".join(f"tau {x:2d} km/B  ex/B" for x in bt.TAUS))
        for a in bt.WEIGHTS:
            cols = [f"{t[(a, x)][0] / b[0]:11.4f} {bt.ratio(t[(a, x)][1], b[1]):5.2f}" for x in bt.TAUS]
            print(f"     {a:.3f} | " + " | ".join(cols))

    print("\nSummary at 50 W (test years 2015-2019)")
    print("   region C kWh |  PS  a    tau km/B   ex/B dom | default km/B  ex/B dom | R pick a  tau km/B   ex/B dom "
          "| best a  tau")
    for (name, c, h), s in S.items():
        if h != 50.0:
            continue
        t = s["test"]
        p, d, r = row(t, PS[c]), row(t, DEFAULT), row(t, s["pick"])
        yn = lambda x: "y" if x else "n"  # noqa: E731
        print(f"   {name:5s} {c / 1000:5.1f} | {PS[c][0]:.3f} {PS[c][1]:4d} {p[0]:.4f} {p[1]:5.3f}  {yn(p[2])} | "
              f"{d[0]:12.4f} {d[1]:5.3f}  {yn(d[2])} | {s['pick'][0]:.3f} {s['pick'][1]:4d} {r[0]:.4f} {r[1]:5.3f}  "
              f"{yn(r[2])} | {s['best_test'][0]:.3f} {s['best_test'][1]:4d}")

    print("\nR picks at every payload (all points)")
    for c, h in CONFIGS:
        s = S[("All", c, h)]
        k = row(s["test"], s["pick"])
        print(f"   C {c / 1000:4.1f} kWh hotel {h:2.0f} W: a* {s['pick'][0]:.3f} tau {s['pick'][1]:2d}  test km/B {k[0]:.4f} "
              f"ex/B {k[1]:.3f} {'dominates' if k[2] else 'does not dominate'}")

    print("\nPredictions")
    c50 = {(n, c): S[(n, c, 50.0)] for n in REGIONS for c in PACKS}
    d1 = [c for c in PACKS if row(c50[("All", c)]["test"], PS[c])[2]]
    print(f"P1 PS dominates B on all 30 points at >= 3 of 4 50 W packs: {'held' if len(d1) >= 3 else 'refuted'} "
          f"({len(d1)} of 4)")
    d2 = [k for k, s in c50.items() if row(s["test"], PS[k[1]])[2]]
    print(f"P2 PS dominates B in >= 9 of 12 (region x pack) cells: {'held' if len(d2) >= 9 else 'refuted'} "
          f"({len(d2)} of 12)")
    km3 = {k: row(s["test"], PS[k[1]])[0] for k, s in c50.items()}
    n3 = sum(v >= 1.0 for v in km3.values())
    print(f"P3 PS km/B >= 1 in 12 of 12 cells: {'held' if n3 == 12 else 'refuted'} ({n3} of 12; min "
          f"{min(km3.values()):.4f})")
    astar = {c: c50[("All", c)]["pick"][0] for c in PACKS}
    gap4 = {c: abs(astar[c] - T_ASTAR[c]) for c in PACKS}
    n4 = sum(v <= 0.125 for v in gap4.values())
    print(f"P4 R pick a* within 0.125 of 6zt T's a* at >= 3 of 4 packs: {'held' if n4 >= 3 else 'refuted'} "
          f"({', '.join(f'{c / 1000:g} kWh {astar[c]:.3f} vs {T_ASTAR[c]}' for c in PACKS)})")
    gap5 = {c: row(c50[("All", c)]["test"], PS[c])[0] - row(c50[("All", c)]["test"], c50[("All", c)]["pick"])[0]
            for c in PACKS}
    n5 = sum(abs(v) <= 0.02 for v in gap5.values())
    print(f"P5 PS km/B within 0.02 of the R pick's at >= 3 of 4 packs: {'held' if n5 >= 3 else 'refuted'} "
          f"({', '.join(f'{v:+.4f}' for v in gap5.values())})")
    n6 = sum(row(s["test"], DEFAULT)[2] for s in c50.values())
    print(f"P6 PS dominates in >= as many of 12 cells as W(0.5) tau 30: {'held' if len(d2) >= n6 else 'refuted'} "
          f"(PS {len(d2)}, default {n6})")
    means = {h: st.fmean(S[("All", c, h)]["pick"][0] for c in PACKS) for h in HOTELS}
    m = [means[h] for h in HOTELS]
    ok7 = m[0] <= m[1] <= m[2] and m[0] <= 0.25
    print(f"P7 mean a* non-decreasing 10 -> 30 -> 50 W and <= 0.25 at 10 W: {'held' if ok7 else 'refuted'} "
          f"({', '.join(f'{h:.0f} W {means[h]:.3f}' for h in HOTELS)})")


if __name__ == "__main__":
    main()
