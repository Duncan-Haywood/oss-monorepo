"""Milestone 6zm: does 6zl's led, capacity-aware pack-target curve keep its gain on years and places it was not
picked on? A held-out check of a post hoc result.

Why: 6zl's post hoc grid led the capacity-aware rule curve (C) by L days and cut the climatological sun by a haircut,
and found variants (haircut 1.0, L 30; haircut 0.9, L 20) that matched 6zk's reserve curve (R) on avoidable payload
dark hours (2,954 and 2,763 against 2,937) while covering 6.7 to 7.4% more km at 40 degrees or more. Those variants
were chosen from 12 on the same 300 point-years they were scored on, and their climatologies were leave-one-year-out
over all ten years, so a test year's target used later years' sun. Neither is available to a planner. This step
picks the variant on one part of the data and scores it on another, with a wider grid fixed in advance.

Data: as 6zk and 6zl (NASA POWER daily ALLSKY_SFC_SW_DWN, public domain; experiments/data/sun_flip_2024.json,
experiments/data/sun_transect_2015_2023.json, experiments/data/daily_<site>.json). No new data.

Rules (fixed in this docstring and committed before any split below was run):
  Boat, pack (C = 10 kWh), hotel (30 W), harvest, daily step, launch full on 1 January, causal speed rule
  (6zk's causal_target), idle vehicle and excess dark hours (a policy's dark hours minus the idle vehicle's in the same
  point-year): 6zj to 6zl, unchanged.
  Grid G: haircut h in {1.0, 0.9, 0.8} x lead L in {0, 10, 20, 30, 45, 60} days (18 variants); variant (h, L) is
  T(d) = lead(max(0.5 C, Rc_h(d)), L), Rc_h = 6zl's reserve_capped built from h x the climatology.
  Selection rule S (the same for every split): on the selection set, among the variants whose summed excess dark hours
  are at most (R)'s on that set, take the one with the most summed km; if none qualifies, the one with the fewest
  summed excess dark hours. (R) is 6zk's reserve curve built from the same climatology as the variant.
  Split T (time, strict history): select on 2015 to 2019 at all 30 points, with each year's climatology from the
  other years of 2015 to 2019 only; score on 2020 to 2024 with every test year's climatology from 2015 to 2019 (what a
  planner launching in 2020 to 2024 would have had at hand without updating).
  Split S1 (space): select on the 13 Pacific (150 W) transect points, score on the 12 Atlantic (30 W) points plus the
  5 corridor sites; S2 the reverse (select on the 12 Atlantic, score on the 13 Pacific plus the 5 corridor sites).
  Both use 6zl's leave-one-year-out climatology over all ten years (the question there is place, not time).
  "km40" = summed km over point-years at |lat| >= 40.
Predictions:
  P1  Split T: the picked variant's summed excess dark hours on the test years are at most 1.25 x (R)'s.
  P2  Split T: the picked variant's km40 on the test years is at least 1.04 x (R)'s.
  P3  Split S1 and S2: in both, the picked variant's test excess dark hours are at most 1.25 x (R)'s and its test
      km40 at least 1.04 x (R)'s.
  P4  Split T picks a lead of 20 or 30 days.
  P5  Strict history costs (R) less than half again in dark hours: on 2020 to 2024, (R) from the 2015 to 2019
      climatology has summed excess dark hours at most 1.5 x (R) from the leave-one-year-out ten-year climatology.
  P6  Within 20 degrees of the equator, every variant's km equals (R)'s in every scored point-year of split T (the
      target sits at the 0.5 C floor there whatever the haircut or lead).
Descriptive (no prediction): the full grid on every selection and test set; 6zl's two in-sample variants
  ((1.0, 30), (0.9, 20)) scored on every test set; per |lat| band, test km / (R) km and mean excess dark hours.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_led_curve_holdout.py > experiments/results_led_curve_holdout.txt
(stdlib, deterministic; no (F) runs)"""
import os
import statistics as st
import sys
from functools import lru_cache

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_reserve_curve as rc  # noqa: E402
import run_two_sided_curve as ts  # noqa: E402
import run_year_pack as yp  # noqa: E402

C = rc.C
YEARS = rc.YEARS
TRAIN = tuple(y for y in YEARS if y <= 2019)
TEST = tuple(y for y in YEARS if y >= 2020)
HAIRCUTS = (1.0, 0.9, 0.8)
LEADS = (0, 10, 20, 30, 45, 60)
GRID = tuple((h, L) for h in HAIRCUTS for L in LEADS)
INSAMPLE = ((1.0, 30), (0.9, 20))
BANDS = ((0, 20), (25, 35), (40, 45), (50, 55), (60, 60))
PACIFIC = tuple(p for p in yp.points() if p.startswith("P"))
ATLANTIC = tuple(p for p in yp.points() if p.startswith("A"))
CORRIDOR = tuple(p for p in yp.points() if p not in PACIFIC + ATLANTIC)


def variant_target(hc, h, L):
    return ts.lead(ts.target_capped(ts.reserve_capped([h * e for e in hc])), L)


@lru_cache(maxsize=None)
def clim(point, year, pool):
    """Climatology for `year` from the years in `pool` other than `year` itself (rc.climatology_wh, cached)."""
    return tuple(rc.climatology_wh(point, year, years=pool))


@lru_cache(maxsize=None)
def sun(point, year):
    return tuple(rc.year_sun(point, year))


def score(point, year, pool, grid=GRID):
    """(R) and every grid variant for one point-year, climatology from `pool`: {key: (km, excess dark h)}."""
    s = list(sun(point, year))
    hc = list(clim(point, year, pool))
    idle_dark = yp.idle(s)[1]
    out = {}
    k, _, dark = rc.causal_target(s, rc.target_from_reserve(rc.reserve(hc)))
    out["R"] = (k, dark - idle_dark)
    for h, L in grid:
        k, _, dark = rc.causal_target(s, variant_target(hc, h, L))
        out[(h, L)] = (k, dark - idle_dark)
    return out


def table(cells):
    """cells: {(point, year): score dict} -> {key: (summed km, summed km40, summed excess)}."""
    keys = next(iter(cells.values())).keys()
    tot = {}
    for key in keys:
        km = sum(c[key][0] for c in cells.values())
        km40 = sum(c[key][0] for (p, _), c in cells.items() if abs(yp.lat_of(p)) >= 40)
        ex = sum(c[key][1] for c in cells.values())
        tot[key] = (km, km40, ex)
    return tot


def select(tot):
    """Selection rule S."""
    r_ex = tot["R"][2]
    ok = [g for g in GRID if tot[g][2] <= r_ex]
    if ok:
        return max(ok, key=lambda g: tot[g][0])
    return min(GRID, key=lambda g: tot[g][2])


def print_grid(name, tot):
    r = tot["R"]
    print(f"   {name}: (R) km {r[0]:.0f}, km40 {r[1]:.0f}, excess dark h {r[2]:.0f}")
    print("     haircut lead |   km / (R) | km40 / (R) | excess dark h | excess / (R)")
    for g in GRID:
        t = tot[g]
        print(f"     {g[0]:7.1f} {g[1]:4d} | {t[0] / r[0]:10.4f} | {t[1] / r[1]:10.4f} | {t[2]:13.0f} | "
              f"{t[2] / r[2] if r[2] else float('nan'):.3f}")


def bands(name, cells, g):
    print(f"   {name}, variant {g} against (R) by |lat| band:")
    for lo, hi in BANDS:
        ks = [k for k in cells if lo <= abs(yp.lat_of(k[0])) <= hi]
        if not ks:
            continue
        kr = sum(cells[k]["R"][0] for k in ks)
        kg = sum(cells[k][g][0] for k in ks)
        print(f"     |lat| {lo:2d}-{hi:2d} ({len(ks):3d}): km / (R) {kg / kr:.4f}; mean excess dark h/yr "
              f"(R) {st.fmean(cells[k]['R'][1] for k in ks):.1f}, variant {st.fmean(cells[k][g][1] for k in ks):.1f}")


def run_split(name, sel_cells, test_cells):
    sel_tot, test_tot = table(sel_cells), table(test_cells)
    pick = select(sel_tot)
    print(f"\n{name}")
    print_grid(f"selection set ({len(sel_cells)} point-years)", sel_tot)
    print(f"   picked by rule S: haircut {pick[0]}, lead {pick[1]}")
    print_grid(f"test set ({len(test_cells)} point-years)", test_tot)
    t, r = test_tot[pick], test_tot["R"]
    print(f"   picked on test: km {t[0] / r[0]:.4f} x (R), km40 {t[1] / r[1]:.4f} x (R), excess dark h {t[2]:.0f} "
          f"against (R) {r[2]:.0f} ({t[2] / r[2] if r[2] else float('nan'):.3f} x)")
    for g in INSAMPLE:
        t = test_tot[g]
        print(f"   6zl in-sample variant {g} on test: km40 {t[1] / r[1]:.4f} x (R), excess {t[2]:.0f} "
              f"({t[2] / r[2] if r[2] else float('nan'):.3f} x)")
    bands("test set", test_cells, pick)
    return pick, test_tot


def main():
    pts = yp.points()
    print("Milestone 6zm: held-out check of 6zl's led capacity-aware pack-target curve")
    print(f"pack {C:.0f} Wh, hotel {rc.HOTEL:.0f} W; grid haircut {HAIRCUTS} x lead {LEADS} days; "
          f"selection rule S: most km with excess dark h <= (R)'s")

    # Split T: strict history
    sel = {(p, y): score(p, y, TRAIN) for p in pts for y in TRAIN}
    test = {(p, y): score(p, y, TRAIN) for p in pts for y in TEST}
    pick_t, tot_t = run_split("Split T: select on 2015-2019 (climatology from the other 2015-2019 years), "
                              "score on 2020-2024 (climatology from 2015-2019)", sel, test)

    # (R) from leave-one-year-out ten-year climatology on the same test years (for P5), and the space splits
    loo = {(p, y): score(p, y, YEARS) for p in pts for y in YEARS}
    r_loo_test = sum(loo[(p, y)]["R"][1] for p in pts for y in TEST)
    pick_1, tot_1 = run_split("Split S1: select on the Pacific transect, score on the Atlantic transect + corridor "
                              "(leave-one-year-out climatology, all ten years)",
                              {k: v for k, v in loo.items() if k[0] in PACIFIC},
                              {k: v for k, v in loo.items() if k[0] in ATLANTIC + CORRIDOR})
    pick_2, tot_2 = run_split("Split S2: select on the Atlantic transect, score on the Pacific transect + corridor",
                              {k: v for k, v in loo.items() if k[0] in ATLANTIC},
                              {k: v for k, v in loo.items() if k[0] in PACIFIC + CORRIDOR})

    print("\nPredictions")
    t, r = tot_t[pick_t], tot_t["R"]
    print(f"P1 split T: picked excess dark h <= 1.25 x (R)'s: {'held' if t[2] <= 1.25 * r[2] else 'refuted'} "
          f"({t[2]:.0f} against {r[2]:.0f}, {t[2] / r[2]:.3f} x)")
    print(f"P2 split T: picked km40 >= 1.04 x (R)'s: {'held' if t[1] >= 1.04 * r[1] else 'refuted'} "
          f"({t[1]:.0f} against {r[1]:.0f}, {t[1] / r[1]:.4f} x)")
    ok3 = []
    for nm, pk, tt in (("S1", pick_1, tot_1), ("S2", pick_2, tot_2)):
        a, b = tt[pk], tt["R"]
        good = a[2] <= 1.25 * b[2] and a[1] >= 1.04 * b[1]
        ok3.append(good)
        print(f"   {nm} picked {pk}: excess {a[2]:.0f} against (R) {b[2]:.0f} ({a[2] / b[2]:.3f} x); "
              f"km40 {a[1] / b[1]:.4f} x (R): {'both hold' if good else 'fails'}")
    print(f"P3 splits S1 and S2: {'held' if all(ok3) else 'refuted'}")
    print(f"P4 split T picks a lead of 20 or 30 days: {'held' if pick_t[1] in (20, 30) else 'refuted'} "
          f"(lead {pick_t[1]}, haircut {pick_t[0]})")
    print(f"P5 (R) on 2020-2024, strict-history excess <= 1.5 x leave-one-year-out excess: "
          f"{'held' if r[2] <= 1.5 * r_loo_test else 'refuted'} ({r[2]:.0f} against {r_loo_test:.0f}, "
          f"{r[2] / r_loo_test:.3f} x)")
    eq = [k for k in test if abs(yp.lat_of(k[0])) <= 20]
    same = all(test[k][g][0] == test[k]["R"][0] for k in eq for g in GRID)
    print(f"P6 within 20 deg ({len(eq)} test point-years), every variant km == (R) km: {'held' if same else 'refuted'}")


if __name__ == "__main__":
    main()
