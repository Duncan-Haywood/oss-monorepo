"""Milestone 6zq: once the target's lead is re-tuned for each pack and hotel load, does the lead (rather than the
pack-feedback constant tau) carry the configuration dependence 6zp found, and does re-tuning repair the heavy-payload
regime?

Why: 6zp's "Next". 6zp swept pack C in {2.5, 5, 10, 20} kWh x hotel {10, 30, 50} W under the climatology power
estimate (K) and found tau_K = 20 days in 5 of 8 configurations at 10 and 30 W, 10 in the other three, and 30 to 60
days at 50 W, where (K) lost 1 to 8% of the trailing-mean rule's km at three packs. But every configuration kept the
target T = lead(max(0.5 C, Rc), 45 days) whose 45-day lead and 0.5 C floor were chosen at 10 kWh / 30 W (6zl, 6zm).
The lead sets how early the pack starts filling before a deficit season. A full refill from 0.5 C takes time
proportional to C / surplus, so a bigger pack, or a heavier payload that leaves less surplus, should want a longer
lead; and a mis-set lead could have been absorbed by tau in 6zp (a shorter tau also refills sooner). If so, freeing
the lead should move the dependence onto the lead and settle tau.

Data: as 6zk to 6zp (NASA POWER daily ALLSKY_SFC_SW_DWN, public domain; experiments/data/). No new data.

Inputs swept (not sourced as single figures): 6zp's 12 configurations (pack and hotel ranges as 6zp's docstring);
lead in {0, 15, 30, 45, 60, 90} days (0 = 6zl's unled two-sided curve, 45 = 6zm's default); tau in {10, 20, 30, 60}
days (6zp's picks all lie in this set).

Rules (fixed in this docstring and committed before any configuration below was run):
  Boat, harvest, daily step, launch full on 1 January, the 30 points x 2015 to 2024, the (K) speed rule
  (ph.run_est) and the reserve curve Rc = ts.reserve_capped(hc, C, hotel) with floor 0.5 C are 6zp's. Only the lead
  of the target changes: T_lead = ts.lead(ts.target_capped(Rc, floor=0.5 C), lead).
  Grid G: (K, tau, lead) for tau in {10, 20, 30, 60} x lead in {0, 15, 30, 45, 60, 90} (24 variants).
  Baseline B = (L, 10, 45): 6zp's reference, the 7-day trailing mean at 6zp's lead-45 target, unchanged.
  Split T only (6zo / 6zp's strict-history time split): select on 2015 to 2019, each year's climatology from the
  other years of 2015 to 2019; score on 2020 to 2024 with the 2015 to 2019 climatology. Excess dark hours against
  the idle vehicle of the same configuration.
  Selection rule S (6zo / 6zp's): among G variants whose summed selection-set excess dark hours are at most B's, the
  most summed km; if none qualifies, the fewest excess dark hours. "pick" = rule S over G; lead* and tau* its parts.
  "6zp pick" = rule S over the lead-45 column only (reproduces 6zp's tau_K where it lies in {10, 20, 30, 60}).
Predictions:
  P1  The lead carries pack dependence: at each of the three hotel loads, lead* takes at least two distinct values
      across the four packs.
  P2  Lead rises with storage: at each hotel load, lead* is non-decreasing in C and larger at 20 than at 2.5 kWh.
  P3  Tau settles: tau* = 20 in at least 8 of the 12 configurations (6zp: tau_K = 20 in 5 of 12).
  P4  The heavy-payload regime is repaired: at 50 W, the pick on the test set has km >= B's and excess dark hours
      <= B's at at least 3 of the 4 packs (6zp: 1 of 4).
  P5  Re-tuning adds little where the deck carries the payload: at 10 and 30 W, the pick's test km / B exceeds the
      6zp pick's by less than 0.01 in at least 6 of the 8 configurations.
  P6  Consistency: at 10 kWh and 30 W, lead* is 30, 45 or 60 days (6zm's 45 or one step from it).
Descriptive (no prediction): per configuration, the full test-set grid (km / B, excess / B), the best-on-test lead
  at tau*, and lead* against the days of storage D = C / (24 x hotel).

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_lead_retune.py > experiments/results_lead_retune.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import sys
from functools import lru_cache
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_pack_hotel_tau as pt  # noqa: E402
import run_power_estimate_holdout as ph  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_two_sided_curve as ts  # noqa: E402
import run_year_pack as yp  # noqa: E402

CONFIGS = pt.CONFIGS
PACKS, HOTELS = pt.PACKS, pt.HOTELS
LEADS = (0, 15, 30, 45, 60, 90)
TAUS = (10, 20, 30, 60)
GRID = tuple(("K", t, ld) for t in TAUS for ld in LEADS)
L45 = tuple(g for g in GRID if g[2] == 45)
BASE = ("L", 10, 45)
TRAIN, TEST, YEARS = pt.TRAIN, pt.TEST, pt.YEARS


def targets(hc, cap, hotel, leads=LEADS):
    """{lead: T} from one reserve curve (the expensive part) for this pack and hotel load."""
    base = ts.target_capped(ts.reserve_capped(hc, cap, hotel), floor=0.5 * cap)
    return {ld: ts.lead(base, ld) for ld in leads}


@lru_cache(maxsize=None)
def _clim(p, yr):
    return tuple(rc.climatology_wh(p, yr, years=TRAIN))


def score(key):
    """((cap, hotel, point, year), {variant: (km, excess dark h)})."""
    cap, hotel, p, yr = key
    sun = rc.year_sun(p, yr)
    hc = list(_clim(p, yr))
    Ts = targets(hc, cap, hotel)
    idle_dark = yp.idle(sun, cap, hotel)[1]
    out = {}
    for est, tau, ld in (BASE,) + GRID:
        r = ph.run_est(sun, Ts[ld], hc, est, tau, cap=cap, hotel=hotel)
        out[(est, tau, ld)] = (r["km"], r["dark"] - idle_dark)
    return key, out


def total(cells, keys):
    return pt.total(cells, keys)


def select(tot, grid=GRID):
    """Rule S over `grid` with B as the reference."""
    b_ex = tot[BASE][1]
    ok = [g for g in grid if tot[g][1] <= b_ex]
    if ok:
        return max(ok, key=lambda g: tot[g][0])
    return min(grid, key=lambda g: tot[g][1])


def evaluate(configs=CONFIGS, points=None, procs=4):
    pts = points or yp.points()
    keys = [(c, h, p, yr) for c, h in configs for p in pts for yr in YEARS]
    with Pool(procs) as pool:
        return dict(pool.map(score, keys, chunksize=5))


def summarise(cells, configs=CONFIGS, points=None):
    pts = points or yp.points()
    out = {}
    for c, h in configs:
        sel = total(cells, [(c, h, p, yr) for p in pts for yr in TRAIN])
        test = total(cells, [(c, h, p, yr) for p in pts for yr in TEST])
        pick = select(sel)
        best_lead = select(test, tuple(g for g in GRID if g[1] == pick[1]))
        out[(c, h)] = {"sel": sel, "test": test, "pick": pick, "p6zp": select(sel, L45),
                       "best_test": select(test), "best_lead_at_tau": best_lead[2]}
    return out


def ratio(a, b):
    return a / b if b else float("nan")


def main():
    cells = evaluate()
    S = summarise(cells)
    print("Milestone 6zq: re-tuning the target lead per pack and hotel load under the climatology power estimate")
    print(f"packs {[int(c) for c in PACKS]} Wh x hotel {[int(h) for h in HOTELS]} W; grid (K) x tau {TAUS} x lead "
          f"{LEADS} days; B = {BASE}; split T (select 2015-2019, test 2020-2024, strict-history climatology)")

    for (c, h), s in S.items():
        sel, test = s["sel"], s["test"]
        b, bs = test[BASE], sel[BASE]
        print(f"\nC {c / 1000:.1f} kWh, hotel {h:.0f} W (storage D = {pt.storage_days(c, h):.1f} days)")
        print(f"   selection: B km {bs[0]:.0f}, excess dark h {bs[1]:.0f}; pick {s['pick']}; 6zp pick (lead 45) "
              f"{s['p6zp']}; best-on-test {s['best_test']}; best-on-test lead at tau* {s['best_lead_at_tau']}")
        print(f"   test: B km {b[0]:.0f}, excess dark h {b[1]:.0f}")
        print("     tau lead | sel km/B | sel ex/B | test km/B | test excess | test ex/B")
        for g in GRID:
            t, q = test[g], sel[g]
            print(f"     {g[1]:3d} {g[2]:4d} | {q[0] / bs[0]:8.4f} | {ratio(q[1], bs[1]):8.3f} | {t[0] / b[0]:9.4f} | "
                  f"{t[1]:11.0f} | {ratio(t[1], b[1]):9.3f}")

    print("\nSummary (test set 2020-2024; picks made on 2015-2019)")
    print("   C kWh  hotel W  D days | lead* tau* | pick km/B  ex/B | 6zp pick       km/B  ex/B | gain | best-test")
    for (c, h), s in S.items():
        t, b = s["test"], s["test"][BASE]
        k, q = t[s["pick"]], t[s["p6zp"]]
        print(f"   {c / 1000:5.1f}  {h:7.0f}  {pt.storage_days(c, h):6.1f} | {s['pick'][2]:5d} {s['pick'][1]:4d} | "
              f"{k[0] / b[0]:9.4f} {ratio(k[1], b[1]):5.3f} | {str(s['p6zp'][1:]):10s} {q[0] / b[0]:9.4f} "
              f"{ratio(q[1], b[1]):5.3f} | {(k[0] - q[0]) / b[0]:+.4f} | {s['best_test'][1:]}")

    print("\nPredictions")
    ld = {ch: s["pick"][2] for ch, s in S.items()}
    tu = {ch: s["pick"][1] for ch, s in S.items()}
    per_h = '; '.join(f'{h:.0f} W: ' + ', '.join(str(ld[(c, h)]) for c in PACKS) for h in HOTELS)
    ok1 = all(len({ld[(c, h)] for c in PACKS}) >= 2 for h in HOTELS)
    print(f"P1 lead* takes >= 2 values across packs at every hotel: {'held' if ok1 else 'refuted'} ({per_h})")
    ok2 = all(all(ld[(PACKS[i], h)] <= ld[(PACKS[i + 1], h)] for i in range(len(PACKS) - 1))
              and ld[(PACKS[-1], h)] > ld[(PACKS[0], h)] for h in HOTELS)
    print(f"P2 lead* non-decreasing in C at every hotel, larger at 20 than 2.5 kWh: {'held' if ok2 else 'refuted'}")
    n20 = sum(t == 20 for t in tu.values())
    print(f"P3 tau* = 20 in >= 8 of 12: {'held' if n20 >= 8 else 'refuted'} ({n20} of 12; "
          f"{'; '.join(f'{h:.0f} W: ' + ', '.join(str(tu[(c, h)]) for c in PACKS) for h in HOTELS)})")
    dom50 = [c for c in PACKS if S[(c, 50.0)]["test"][S[(c, 50.0)]["pick"]][0] >= S[(c, 50.0)]["test"][BASE][0]
             and S[(c, 50.0)]["test"][S[(c, 50.0)]["pick"]][1] <= S[(c, 50.0)]["test"][BASE][1]]
    print(f"P4 at 50 W the pick dominates B on test at >= 3 of 4 packs: {'held' if len(dom50) >= 3 else 'refuted'} "
          f"({len(dom50)} of 4: {[c / 1000 for c in dom50]} kWh)")
    small = []
    for c in PACKS:
        for h in (10.0, 30.0):
            t = S[(c, h)]["test"]
            if (t[S[(c, h)]["pick"]][0] - t[S[(c, h)]["p6zp"]][0]) / t[BASE][0] < 0.01:
                small.append((c, h))
    print(f"P5 at 10 and 30 W the re-tuned pick gains < 0.01 x B km over the 6zp pick in >= 6 of 8: "
          f"{'held' if len(small) >= 6 else 'refuted'} ({len(small)} of 8)")
    l6 = ld[(10000.0, 30.0)]
    print(f"P6 at 10 kWh and 30 W lead* in (30, 45, 60): {'held' if l6 in (30, 45, 60) else 'refuted'} "
          f"(lead* {l6}, pick {S[(10000.0, 30.0)]['pick']})")


if __name__ == "__main__":
    main()
