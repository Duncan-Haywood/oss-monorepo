"""Milestone 6zp: is the pack-feedback constant that transfers (6zo's tau = 20 days at 10 kWh and 30 W) a property of
the pack's days of storage, or of the weather? A sweep of pack size and hotel load under the climatology power estimate.

Why: 6zo's "Next". 6zo picked (K, 20), today's climatological harvest plus a 20-day pack feedback, on 2015 to 2019
and it held on 2020 to 2024 (1.035 x the 7-day-mean rule's km at 0.56 x its excess payload dark hours), with tau 20 on
two splits and 30 on the third. Every one of 6zj to 6zo used one pack (10 kWh, 5c's 25% of 200 kg at 200 Wh/kg) and
one hotel load (30 W). A designer choosing a different pack or payload needs to know whether to keep tau = 20 days or
to rescale it. Two readings make different predictions. Storage: the feedback should restore the pack over a time set
by how many days of payload it holds, D = C / (24 x hotel) (13.9 days at 10 kWh and 30 W), so the tau picked on
2015 to 2019 should rise with C and fall with the hotel load. Weather: tau is set by how long sunny and dull spells
last, so the pick should stay near 20 days whatever the pack.

Data: as 6zk to 6zo (NASA POWER daily ALLSKY_SFC_SW_DWN, public domain; experiments/data/). No new data.

Inputs swept (not sourced as single figures; the ranges are this project's earlier ones):
  pack C in {2.5, 5, 10, 20} kWh: 10 kWh is 5c's central pack; 2.5 to 20 kWh is 6.25% to 50% of the 200 kg boat at
    200 Wh/kg (6zj's descriptive run already used 5 and 20 kWh);
  hotel in {10, 30, 50} W: 5m's sampled range was 5 to 20 W and 6y's central boat 30 W; 50 W is a heavier payload.
  12 configurations; D = C / (24 x hotel) runs from 2.1 to 83 days.

Rules (fixed in this docstring and committed before any configuration below was run):
  Boat, harvest, daily step, launch full on 1 January, the 30 points (25 transect + 5 corridor) x 2015 to 2024, and the
  speed rule are 6zo's run_est with the configuration's cap and hotel. Target T = 6zm's lead(max(0.5 C, Rc), 45 days)
  with Rc built for the configuration's C and hotel (ts.reserve_capped(hc, cap, hotel), floor 0.5 C, lead 45 days),
  from the same climatology hc as the power estimate. Excess dark hours are measured against the idle vehicle of the
  same configuration.
  Grid G: estimator in {L, K} x tau in {5, 10, 20, 30, 45, 60, 90} days (14 variants); baseline B = (L, 10).
  Split T only (6zo's strict-history time split): select on 2015 to 2019 at all 30 points, each year's climatology from
  the other years of 2015 to 2019; score on 2020 to 2024, every test year's climatology from 2015 to 2019.
  Selection rule S (6zo's): among variants whose summed selection-set excess dark hours are at most B's, the most
  summed km; if none qualifies, the fewest excess dark hours. tau_K = the (K) tau picked by rule S over the seven (K)
  variants (B stays the reference); "pick" = rule S over all 14.
  Bound (Fh): 6zn's foresight plan ending the year with at least 0.5 C, with the configuration's cap and hotel and a pack
  grid of C / 100 (100 Wh at 10 kWh, as before), on the test set.
Predictions:
  P1  Storage, in C: at each of the three hotel loads, tau_K is non-decreasing in C, and tau_K at 20 kWh > at 2.5 kWh.
  P2  Storage, in hotel: at each of the four packs, tau_K is non-increasing in the hotel load, and strictly lower at
      50 W than at 10 W for at least two of the four packs.
  P3  The climatology estimate keeps its edge: in at least 10 of the 12 configurations, (K, tau_K) on the test set has
      km >= B's and excess dark hours <= B's.
  P4  The estimate matters more for a small pack: at each hotel load, (K, tau_K)'s test km / B is larger at 2.5 kWh
      than at 20 kWh.
  P5  6zo's default is robust: in at least 9 of the 12 configurations, (K, 20)'s test km is within 1% of
      (K, tau_K)'s and its test excess dark hours at most 1.25 x B's.
  P6  At 10 kWh and 30 W, split T picks (K, 20) again (a consistency check on 6zo, which had a larger grid).
Descriptive (no prediction): per configuration, B's and (Fh)'s test km and excess dark hours, the full grid on the
  test set, tau_K / D, the best-on-test (K) tau, and the share of the B -> (Fh) km gap (K, tau_K) closes.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_pack_hotel_tau.py > experiments/results_pack_hotel_tau.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import sys
from functools import lru_cache
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_power_estimate_holdout as ph  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_speed_timing as sp  # noqa: E402
import run_two_sided_curve as ts  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS = (2500.0, 5000.0, 10000.0, 20000.0)
HOTELS = (10.0, 30.0, 50.0)
CONFIGS = tuple((c, h) for c in PACKS for h in HOTELS)
TAUS = (5, 10, 20, 30, 45, 60, 90)
GRID = tuple((e, t) for e in ("L", "K") for t in TAUS)
KGRID = tuple(g for g in GRID if g[0] == "K")
BASE = ("L", 10)
TRAIN, TEST, YEARS = ph.TRAIN, ph.TEST, ph.YEARS
LEAD = sp.LEAD


def storage_days(cap, hotel):
    return cap / (24.0 * hotel)


def target(hc, cap, hotel):
    """6zm's lead-45 target for this pack and hotel load."""
    return ts.lead(ts.target_capped(ts.reserve_capped(hc, cap, hotel), floor=0.5 * cap), LEAD)


@lru_cache(maxsize=None)
def _clim(p, yr):
    return tuple(rc.climatology_wh(p, yr, years=TRAIN))


def score(key):
    """((cap, hotel, point, year), {variant: (km, excess dark h)}) with the strict-history (2015-2019) climatology."""
    cap, hotel, p, yr = key
    sun = rc.year_sun(p, yr)
    hc = list(_clim(p, yr))
    T = target(hc, cap, hotel)
    idle_dark = yp.idle(sun, cap, hotel)[1]
    out = {}
    for est, tau in GRID:
        r = ph.run_est(sun, T, hc, est, tau, cap=cap, hotel=hotel)
        out[(est, tau)] = (r["km"], r["dark"] - idle_dark)
    return key, out


_TABLES = {}


def bound(key):
    cap, hotel, p, yr = key
    if hotel not in _TABLES:
        _TABLES[hotel] = yp.prop_table(hotel)
    sun = rc.year_sun(p, yr)
    r = sp.foresight_acct(sun, _TABLES[hotel], end_min=0.5 * cap, cap=cap, hotel=hotel, grid=cap / 100.0)
    return key, (r["km"], r["dark"] - yp.idle(sun, cap, hotel)[1])


def total(cells, keys):
    first = cells[keys[0]]
    return {g: (sum(cells[k][g][0] for k in keys), sum(cells[k][g][1] for k in keys)) for g in first}


def select(tot, grid=GRID):
    """6zo's rule S over `grid`, with B as the reference."""
    b_ex = tot[BASE][1]
    ok = [g for g in grid if tot[g][1] <= b_ex]
    if ok:
        return max(ok, key=lambda g: tot[g][0])
    return min(grid, key=lambda g: tot[g][1])


def evaluate(configs=CONFIGS, points=None, procs=4):
    pts = points or yp.points()
    keys = [(c, h, p, yr) for c, h in configs for p in pts for yr in YEARS]
    fkeys = [(c, h, p, yr) for c, h in configs for p in pts for yr in TEST]
    with Pool(procs) as pool:
        cells = dict(pool.map(score, keys, chunksize=5))
        fh = dict(pool.map(bound, fkeys, chunksize=2))
    return cells, fh


def summarise(cells, fh, configs=CONFIGS, points=None):
    pts = points or yp.points()
    out = {}
    for c, h in configs:
        sel = total(cells, [(c, h, p, yr) for p in pts for yr in TRAIN])
        tk = [(c, h, p, yr) for p in pts for yr in TEST]
        test = total(cells, tk)
        test["Fh"] = (sum(fh[k][0] for k in tk), sum(fh[k][1] for k in tk))
        out[(c, h)] = {"sel": sel, "test": test, "pick": select(sel), "kpick": select(sel, KGRID),
                       "kbest_test": select(test, KGRID)}
    return out


def share(test, g):
    a, b, f = test[BASE][0], test[g][0], test["Fh"][0]
    return (b - a) / (f - a) if f != a else float("nan")


def main():
    cells, fh = evaluate()
    S = summarise(cells, fh)
    print("Milestone 6zp: the pack-feedback constant tau under the climatology power estimate, by pack size and hotel load")
    print(f"packs {[int(c) for c in PACKS]} Wh x hotel {[int(h) for h in HOTELS]} W; grid estimator (L, K) x tau {TAUS} "
          f"days; B = {BASE}; split T (select 2015-2019, test 2020-2024, strict-history climatology); target lead {LEAD}")

    for (c, h), s in S.items():
        sel, test = s["sel"], s["test"]
        b = test[BASE]
        print(f"\nC {c / 1000:.1f} kWh, hotel {h:.0f} W (storage D = {storage_days(c, h):.1f} days)")
        print(f"   selection: B km {sel[BASE][0]:.0f}, excess dark h {sel[BASE][1]:.0f}; picked {s['pick']}, "
              f"tau_K {s['kpick'][1]} (tau_K / D {s['kpick'][1] / storage_days(c, h):.2f})")
        print(f"   test: B km {b[0]:.0f}, excess dark h {b[1]:.0f}; (Fh) km {test['Fh'][0]:.0f} "
              f"({test['Fh'][0] / b[0]:.4f} x B), excess {test['Fh'][1]:.0f}; best-on-test (K) tau {s['kbest_test'][1]}")
        print("     est  tau | sel km/B | sel ex/B | test km/B | test excess | test ex/B | share B->(Fh)")
        for g in GRID:
            t, q = test[g], sel[g]
            print(f"     {g[0]:>3} {g[1]:4d} | {q[0] / sel[BASE][0]:8.4f} | "
                  f"{q[1] / sel[BASE][1] if sel[BASE][1] else float('nan'):8.3f} | {t[0] / b[0]:9.4f} | "
                  f"{t[1]:11.0f} | {t[1] / b[1] if b[1] else float('nan'):9.3f} | {share(test, g):13.3f}")

    print("\nSummary (test set 2020-2024): tau_K picked on 2015-2019")
    print("   C kWh  hotel W  D days | tau_K | best-test tau | (K,tau_K) km/B  ex/B | (K,20) km/B  ex/B | (Fh) km/B | share")
    for (c, h), s in S.items():
        t, b = s["test"], s["test"][BASE]
        k, k20 = t[s["kpick"]], t[("K", 20)]
        print(f"   {c / 1000:5.1f}  {h:7.0f}  {storage_days(c, h):6.1f} | {s['kpick'][1]:5d} | {s['kbest_test'][1]:13d} | "
              f"{k[0] / b[0]:14.4f} {k[1] / b[1] if b[1] else float('nan'):5.3f} | {k20[0] / b[0]:11.4f} "
              f"{k20[1] / b[1] if b[1] else float('nan'):5.3f} | {t['Fh'][0] / b[0]:9.4f} | {share(t, s['kpick']):.3f}")

    print("\nPredictions")
    tk = {ch: s["kpick"][1] for ch, s in S.items()}
    ok1 = all(all(tk[(PACKS[i], h)] <= tk[(PACKS[i + 1], h)] for i in range(len(PACKS) - 1))
              and tk[(PACKS[-1], h)] > tk[(PACKS[0], h)] for h in HOTELS)
    print(f"P1 tau_K non-decreasing in C at every hotel, and larger at 20 than 2.5 kWh: {'held' if ok1 else 'refuted'} "
          f"({'; '.join(f'{h:.0f} W: ' + ', '.join(str(tk[(c, h)]) for c in PACKS) for h in HOTELS)})")
    mono = all(all(tk[(c, HOTELS[i])] >= tk[(c, HOTELS[i + 1])] for i in range(len(HOTELS) - 1)) for c in PACKS)
    strict = sum(tk[(c, HOTELS[-1])] < tk[(c, HOTELS[0])] for c in PACKS)
    print(f"P2 tau_K non-increasing in hotel at every pack, strictly lower at 50 than 10 W at >= 2 packs: "
          f"{'held' if mono and strict >= 2 else 'refuted'} (monotone {mono}, strict at {strict} of 4; "
          f"{'; '.join(f'{c / 1000:.1f} kWh: ' + ', '.join(str(tk[(c, h)]) for h in HOTELS) for c in PACKS)})")
    dom = [ch for ch, s in S.items() if s["test"][s["kpick"]][0] >= s["test"][BASE][0]
           and s["test"][s["kpick"]][1] <= s["test"][BASE][1]]
    print(f"P3 (K, tau_K) km >= B and excess <= B on test in >= 10 of 12: {'held' if len(dom) >= 10 else 'refuted'} "
          f"({len(dom)} of 12)")
    gain = {ch: s["test"][s["kpick"]][0] / s["test"][BASE][0] for ch, s in S.items()}
    ok4 = all(gain[(PACKS[0], h)] > gain[(PACKS[-1], h)] for h in HOTELS)
    print(f"P4 (K, tau_K) km / B larger at 2.5 than 20 kWh at every hotel: {'held' if ok4 else 'refuted'} "
          f"({'; '.join(f'{h:.0f} W: {gain[(PACKS[0], h)]:.4f} vs {gain[(PACKS[-1], h)]:.4f}' for h in HOTELS)})")
    rob = []
    for ch, s in S.items():
        t = s["test"]
        if (abs(t[("K", 20)][0] / t[s["kpick"]][0] - 1) <= 0.01 and t[("K", 20)][1] <= 1.25 * t[BASE][1]):
            rob.append(ch)
    print(f"P5 (K, 20) within 1% km of (K, tau_K) and excess <= 1.25 x B in >= 9 of 12: "
          f"{'held' if len(rob) >= 9 else 'refuted'} ({len(rob)} of 12; fails at "
          f"{[f'{c / 1000:.1f} kWh/{h:.0f} W' for c, h in CONFIGS if (c, h) not in rob]})")
    p6 = S[(10000.0, 30.0)]["pick"]
    print(f"P6 at 10 kWh and 30 W split T picks (K, 20): {'held' if p6 == ('K', 20) else 'refuted'} ({p6})")


if __name__ == "__main__":
    main()
