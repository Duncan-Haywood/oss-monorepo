"""Milestone 6zr: is the heavy-payload loss a gate problem? If the climatology speed rule may move whenever its power
estimate clears a threshold below the hotel load (instead of the hotel load itself), does it cover the trailing-mean
rule's distance at 50 W?

Why: 6zq's "Next". 6zp and 6zq found that the climatology power estimate (K) covers less distance than the 7-day
trailing mean (L) at 50 W with a 2.5, 5 or 10 kWh pack, and that no target lead or pack-feedback constant tau fixes it
(6zq: the pick dominates B at 1 of 4 packs). 6zp's post hoc reading: the speed rule
    p = hotel                          if f(d) < hotel
    p = f(d) + (SOC - T(d)) / (tau 24) otherwise
holds station on every day the estimate f is below the payload draw. Climatology is smooth, so in a season whose
average sun is below 50 W (K) never moves, however full the pack; the trailing mean is noisy and clears the gate after
a sunny week, which spends the surplus. If that is the mechanism, lowering the gate (letting the pack-feedback term
carry the boat when the pack is above target) should recover the distance, and should change little at 10 W, where the
gate rarely binds.

Data: as 6zk to 6zq (NASA POWER daily ALLSKY_SFC_SW_DWN, public domain; experiments/data/). No new data.

Inputs swept (not sourced as single figures): 6zp's 12 configurations (packs 2.5, 5, 10, 20 kWh x hotel 10, 30,
50 W); gate theta in {1, 0.75, 0.5, 0.25, 0} x hotel; tau in {10, 20, 30, 60} days.

Rules (fixed in this docstring and committed before any configuration below was run):
  Boat, harvest, daily step, launch full on 1 January, the 30 points x 2015 to 2024, the reserve curve and target
  T = lead(max(0.5 C, Rc), 45 days) (6zp's, lead 45 unchanged) and the (K) estimate f(d) = hc(d) / 24 are 6zp's. Only
  the gate changes:
    p = hotel                          if f(d) < theta x hotel
    p = f(d) + (SOC - T(d)) / (tau 24) otherwise      (speed 0 whenever p <= hotel, as before)
  theta = 1 is 6zp's rule exactly (a test checks it against 6zp's `score`); theta = 0 removes the gate, so the boat
  moves whenever f plus the feedback exceeds the hotel load.
  Grid G: (K, tau, theta) for tau in {10, 20, 30, 60} x theta in {1, 0.75, 0.5, 0.25, 0} (20 variants).
  Baseline B = (L, 10, theta 1): 6zp's reference, unchanged.
  Split T only (strict history): select on 2015 to 2019, each year's climatology from the other years of 2015 to
  2019; score on 2020 to 2024 with the 2015 to 2019 climatology. Excess dark hours against the idle vehicle of the
  same configuration.
  Selection rule S (6zo to 6zq's): among G variants whose summed selection-set excess dark hours are at most B's, the
  most summed km; if none qualifies, the fewest excess dark hours. "pick" = rule S over G; theta* and tau* its parts.
  "6zp pick" = rule S over the theta = 1 column (6zq's lead-45 "6zp pick").
Predictions:
  P1  The gate is the heavy-payload problem: at 50 W, the pick on the test set has km >= B's and excess dark hours
      <= B's at at least 3 of the 4 packs (6zp and 6zq: 1 of 4).
  P2  At 50 W, theta* < 1 at all 4 packs.
  P3  The gate matters little where the deck carries the payload: at 10 W, the pick's test km / B exceeds the 6zp
      pick's by less than 0.005 at all 4 packs.
  P4  At 50 W, removing the gate at the 6zp pick's tau (theta = 0, same tau) gives test km >= the 6zp pick's at all
      4 packs.
  P5  Mechanism: at 50 W, the 6zp pick's test-set share of point-days held at station by the gate (f < hotel) is at
      least 0.25 at the 2.5 kWh pack, and the pick's share (f < theta* x hotel) is at most half of it.
Descriptive (no prediction): per configuration, the full test-set grid (km / B, excess / B); the share of
  point-days the gate binds for each theta; the best-on-test variant.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_hotel_gate.py > experiments/results_hotel_gate.txt
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
import run_wave_vs_sun_sites as y  # noqa: E402
import run_year_pack as yp  # noqa: E402

CONFIGS = pt.CONFIGS
PACKS, HOTELS = pt.PACKS, pt.HOTELS
THETAS = (1.0, 0.75, 0.5, 0.25, 0.0)
TAUS = (10, 20, 30, 60)
GRID = tuple(("K", t, th) for t in TAUS for th in THETAS)
G1 = tuple(g for g in GRID if g[2] == 1.0)
BASE = ("L", 10, 1.0)
TRAIN, TEST, YEARS = pt.TRAIN, pt.TEST, pt.YEARS


def run_gate(sun, T, hc, est, tau, theta, cap, hotel):
    """6zp's run_est with the station-keeping gate at theta x hotel: dict km, down, dark, gated (days held)."""
    h = [yp.harvest_wh(k) for k in sun]
    hd = hotel * 24.0
    soc, km, down, dark, gated = cap, 0.0, 0, 0.0, 0
    for d, e in enumerate(h):
        f = ph.power_estimate(est, h, hc, d, hotel)
        if f < theta * hotel:
            p = hotel
            gated += 1
        else:
            p = f + (soc - T[d]) / (tau * 24.0)
        avail = soc + e
        if avail < hd:
            soc = 0.0
            down += 1
            dark += (hd - avail) / hotel
            continue
        v = yp.speed_for_power(p, hotel)
        if avail - yp.load_w(v, hotel) * 24.0 < 0:
            v = y.bisect(lambda x: avail - yp.load_w(x, hotel) * 24.0 >= 0) or 0.0
        soc = min(cap, avail - yp.load_w(v, hotel) * 24.0)
        km += 86.4 * v
    return {"km": km, "down": down, "dark": dark, "gated": gated}


@lru_cache(maxsize=None)
def _clim(p, yr):
    return tuple(rc.climatology_wh(p, yr, years=TRAIN))


def score(key):
    """((cap, hotel, point, year), {variant: (km, excess dark h, gated days)})."""
    cap, hotel, p, yr = key
    sun = rc.year_sun(p, yr)
    hc = list(_clim(p, yr))
    T = pt.target(hc, cap, hotel)
    idle_dark = yp.idle(sun, cap, hotel)[1]
    out = {}
    for est, tau, th in (BASE,) + GRID:
        r = run_gate(sun, T, hc, est, tau, th, cap, hotel)
        out[(est, tau, th)] = (r["km"], r["dark"] - idle_dark, r["gated"])
    return key, out


def total(cells, keys):
    first = cells[keys[0]]
    return {g: tuple(sum(cells[k][g][i] for k in keys) for i in range(3)) for g in first}


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
        sk = [(c, h, p, yr) for p in pts for yr in TRAIN]
        tk = [(c, h, p, yr) for p in pts for yr in TEST]
        sel, test = total(cells, sk), total(cells, tk)
        out[(c, h)] = {"sel": sel, "test": test, "pick": select(sel), "p6zp": select(sel, G1),
                       "best_test": select(test)}
    return out


def ratio(a, b):
    return a / b if b else float("nan")


def main():
    cells = evaluate()
    S = summarise(cells)
    nd = sum(len(rc.year_sun(p, yr)) for p in yp.points() for yr in TEST)
    print("Milestone 6zr: lowering the station-keeping gate of the climatology speed rule below the hotel load")
    print(f"packs {[int(c) for c in PACKS]} Wh x hotel {[int(h) for h in HOTELS]} W; grid (K) x tau {TAUS} x theta "
          f"{THETAS}; B = {BASE}; target lead 45 days; split T (select 2015-2019, test 2020-2024); "
          f"{nd} test point-days per configuration")

    for (c, h), s in S.items():
        sel, test = s["sel"], s["test"]
        b, bs = test[BASE], sel[BASE]
        print(f"\nC {c / 1000:.1f} kWh, hotel {h:.0f} W (storage D = {pt.storage_days(c, h):.1f} days)")
        print(f"   selection: B km {bs[0]:.0f}, excess dark h {bs[1]:.0f}; pick {s['pick']}; 6zp pick (theta 1) "
              f"{s['p6zp']}; best-on-test {s['best_test']}")
        print(f"   test: B km {b[0]:.0f}, excess dark h {b[1]:.0f}, B gated share {b[2] / nd:.3f}")
        print("     tau theta | sel km/B | sel ex/B | test km/B | test excess | test ex/B | gated share")
        for g in GRID:
            t, q = test[g], sel[g]
            print(f"     {g[1]:3d} {g[2]:5.2f} | {q[0] / bs[0]:8.4f} | {ratio(q[1], bs[1]):8.3f} | {t[0] / b[0]:9.4f} | "
                  f"{t[1]:11.0f} | {ratio(t[1], b[1]):9.3f} | {t[2] / nd:11.3f}")

    print("\nSummary (test set 2020-2024; picks made on 2015-2019)")
    print("   C kWh  hotel W  D days | theta* tau* | pick km/B  ex/B gated | 6zp pick  km/B  ex/B gated |   gain | "
          "best-test")
    for (c, h), s in S.items():
        t, b = s["test"], s["test"][BASE]
        k, q = t[s["pick"]], t[s["p6zp"]]
        print(f"   {c / 1000:5.1f}  {h:7.0f}  {pt.storage_days(c, h):6.1f} | {s['pick'][2]:6.2f} {s['pick'][1]:4d} | "
              f"{k[0] / b[0]:9.4f} {ratio(k[1], b[1]):5.3f} {k[2] / nd:5.3f} | {s['p6zp'][1]:8d} {q[0] / b[0]:5.4f} "
              f"{ratio(q[1], b[1]):5.3f} {q[2] / nd:5.3f} | {(k[0] - q[0]) / b[0]:+.4f} | {s['best_test'][1:]}")

    print("\nPredictions")
    h50 = [S[(c, 50.0)] for c in PACKS]
    dom = [c for c, s in zip(PACKS, h50)
           if s["test"][s["pick"]][0] >= s["test"][BASE][0] and s["test"][s["pick"]][1] <= s["test"][BASE][1]]
    print(f"P1 at 50 W the pick dominates B on test at >= 3 of 4 packs: {'held' if len(dom) >= 3 else 'refuted'} "
          f"({len(dom)} of 4: {[c / 1000 for c in dom]} kWh)")
    th = [s["pick"][2] for s in h50]
    print(f"P2 at 50 W theta* < 1 at all 4 packs: {'held' if all(x < 1 for x in th) else 'refuted'} (theta* {th})")
    gains = [(S[(c, 10.0)]["test"][S[(c, 10.0)]["pick"]][0] - S[(c, 10.0)]["test"][S[(c, 10.0)]["p6zp"]][0])
             / S[(c, 10.0)]["test"][BASE][0] for c in PACKS]
    print(f"P3 at 10 W pick gains < 0.005 x B km over the 6zp pick at all 4 packs: "
          f"{'held' if all(g < 0.005 for g in gains) else 'refuted'} ({', '.join(f'{g:+.4f}' for g in gains)})")
    p4 = []
    for s in h50:
        tau = s["p6zp"][1]
        p4.append(s["test"][("K", tau, 0.0)][0] / s["test"][BASE][0] - s["test"][s["p6zp"]][0] / s["test"][BASE][0])
    print(f"P4 at 50 W theta 0 at the 6zp pick's tau gives test km >= the 6zp pick's at all 4 packs: "
          f"{'held' if all(x >= 0 for x in p4) else 'refuted'} (km / B difference {', '.join(f'{x:+.4f}' for x in p4)})")
    s = S[(2500.0, 50.0)]
    g6, gp = s["test"][s["p6zp"]][2] / nd, s["test"][s["pick"]][2] / nd
    print(f"P5 at 2.5 kWh / 50 W the 6zp pick's gated share >= 0.25 and the pick's <= half of it: "
          f"{'held' if g6 >= 0.25 and gp <= 0.5 * g6 else 'refuted'} (6zp pick {g6:.3f}, pick {gp:.3f})")


if __name__ == "__main__":
    main()
