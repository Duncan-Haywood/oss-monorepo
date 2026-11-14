"""Milestone 6zv: which battery feedback keeps the blend rule's payload margin when the climatology is wrong by 1 to 3%?

Why: 6zu's "Next". On 6zu's reversed split R the test years' harvest was 0.989 x the climatology the boat planned with
(on 6zt's split T, 1.011 x), and the pack-scaled rule PS lost its dark-hour margin over the trailing-mean rule B exactly
where the climatology was optimistic. Post hoc, one step shorter feedback (PSS below) kept the margin at every 50 W
pack. That reading came from two five-year windows. This milestone tests it as a rule: bias the climatology on
purpose and see which feedback keeps dominance.

Design (fixed here, before any configuration below was run):
  Cross climatology: every year is scored with a climatology from the *other* five-year half (2020-2024 test years
  plan with all of 2015-2019, as 6zt's split T; 2015-2019 plan with all of 2020-2024, as 6zu's split R), so no
  year's own data enters its plan. Halves: "T" (scored years 2020-2024) and "R" (scored years 2015-2019).
  Bias: the climatology hc (Wh/day by calendar day) is multiplied by s in {0.97, 0.98, ..., 1.03} before *anything*
  uses it, i.e. both the climatology term K of the estimate and the 45-day-lead reserve target T(d) that every rule,
  B included, steers to. s > 1 is an optimistic climatology (the boat expects more sun than its source says). B is
  rerun at each s with the same biased target, so "dominates B" compares rules given the same information.
  Payload 50 W (the only payload where the blend's weight is large), packs 2.5, 5, 10, 20 kWh; the 30 points.
  Rules: PS (6zt/6zu's pack-scaled rule: 2.5 kWh W(0.5) tau 60; 5 kWh W(0.5) tau 30; 10, 20 kWh W(0.375) tau 30);
  PSS (6zu's post-hoc short feedback, same weights: tau 30 at 2.5 kWh, 20 at the others); the default W(0.5) tau 30;
  and the 36-variant grid a in {0, 0.125, ..., 1} x tau {10, 20, 30, 60}.
  A cell is (s, half, pack): 7 x 2 x 4 = 56 cells, scored on all 30 points x 5 years of that half.
  "Dominates B" = cell km >= B's and cell excess dark hours (over an idle boat's) <= B's.
  Effective bias of a cell: s x (climatology / realised harvest) of that half (realised / climatology was 1.011 on
  T and 0.989 on R in 6zu), so T at s = 1.01 and R at s = 0.99 are roughly unbiased.

Predictions:
  P1  At s = 0.98 (pessimistic), PS dominates B in at least 7 of the 8 (half x pack) cells.
  P2  PS's dominance count over the 8 cells is non-increasing in s from 0.97 to 1.03, with at most one reversal.
  P3  PSS dominates B in at least as many of the 56 cells as PS, and in at least 6 of 8 cells at every s <= 1.02.
  P4  At s = 1.03, PSS dominates B in at least 4 of the 8 cells.
  P5  PSS's km / B is at least 1.03 in all 56 cells.
  P6  "Longest safe tau" of a cell = the longest tau at which some weight dominates B (0 if none). It is
      non-increasing in s in at least 6 of the 8 (half x pack) series.
  P7  B's own km moves by less than 2% across s at every (half, pack): B uses the climatology only through its target.
Descriptive: per cell, km / B and excess / B for PS, PSS and the default; per cell the longest safe tau and, at it,
  the most-km dominating weight; B's km and excess per s.

Data: as 6zk to 6zu (NASA POWER daily ALLSKY_SFC_SW_DWN, public domain; experiments/data/). No new data.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_bias_sweep.py > experiments/results_bias_sweep.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
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

PACKS = bt.PACKS
HOTEL = 50.0
SCALES = (0.97, 0.98, 0.99, 1.0, 1.01, 1.02, 1.03)
EARLY = tuple(y for y in bt.YEARS if y <= 2019)
LATE = tuple(y for y in bt.YEARS if y >= 2020)
HALVES = {"T": LATE, "R": EARLY}
GRID, BASE, DEFAULT, TAUS, WEIGHTS = bt.GRID, bt.BASE, bt.DEFAULT, bt.TAUS, bt.WEIGHTS
PS = {2500.0: (0.5, 60), 5000.0: (0.5, 30), 10000.0: (0.375, 30), 20000.0: (0.375, 30)}
PSS = {2500.0: (0.5, 30), 5000.0: (0.5, 20), 10000.0: (0.375, 20), 20000.0: (0.375, 20)}


@lru_cache(maxsize=None)
def _clim(p, yr):
    """Cross climatology: from the other five-year half, all five of its years."""
    return tuple(rc.climatology_wh(p, yr, years=EARLY if yr in LATE else LATE))


@lru_cache(maxsize=None)
def _sun(p, yr):
    sun = rc.year_sun(p, yr)
    return sun, tuple(yp.harvest_wh(k) for k in sun)


def score(key):
    """((cap, point, year, s), {variant: (km, excess dark h, moved)}, (realised Wh, climatology Wh))."""
    cap, p, yr, s = key
    sun, h = _sun(p, yr)
    hc = [s * x for x in _clim(p, yr)]
    T = pt.target(hc, cap, HOTEL)
    idle_dark = yp.idle(sun, cap, HOTEL)[1]
    b = sw.run(sun, T, hc, *sw.BASE, cap, HOTEL)
    out = {BASE: (b["km"], b["dark"] - idle_dark, b["moved"])}
    h = list(h)
    for a, tau in GRID:
        km, dark, moved = bt.run(h, T, hc, a, tau, cap, HOTEL)
        out[(a, tau)] = (km, dark - idle_dark, moved)
    return key, out, (sum(h), sum(_clim(p, yr)))


def evaluate(points=bt.PTS, procs=4):
    keys = [(c, p, yr, s) for p in points for yr in bt.YEARS for c in PACKS for s in SCALES]
    with Pool(procs) as pool:
        res = pool.map(score, keys, chunksize=7)
    return {k: o for k, o, _ in res}, {k: e for k, _, e in res}


def cells_of(cells, points=bt.PTS):
    """{(s, half, cap): totals over points x that half's years}."""
    return {(s, hn, c): bt.total(cells, [(c, p, yr, s) for p in points for yr in yrs])
            for s in SCALES for hn, yrs in HALVES.items() for c in PACKS}


def longest_safe(t):
    """(longest tau at which some weight dominates B, the most-km dominating weight there); (0, None) if none."""
    for tau in sorted(TAUS, reverse=True):
        ok = [a for a in WEIGHTS if bt.dominates(t, (a, tau))]
        if ok:
            return tau, max(ok, key=lambda a: t[(a, tau)][0])
    return 0, None


def row(t, g):
    b = t[BASE]
    return t[g][0] / b[0], bt.ratio(t[g][1], b[1]), bt.dominates(t, g)


def main():
    cells, energy = evaluate()
    C = cells_of(cells)
    yn = lambda x: "y" if x else "n"  # noqa: E731
    print("Milestone 6zv: the blend rule under a climatology biased by s (50 W payload)")
    print(f"cross climatology (each half plans with the other half's five years); s in {SCALES}; "
          f"grid weights {WEIGHTS} x tau {TAUS}; B = {sw.BASE}; target lead 45 days")
    print("PS:  " + ", ".join(f"{c / 1000:g} kWh W({a}) tau {t}" for c, (a, t) in PS.items()))
    print("PSS: " + ", ".join(f"{c / 1000:g} kWh W({a}) tau {t}" for c, (a, t) in PSS.items()))

    print("\nRealised harvest / unscaled climatology, by half (all points, 5 years, pack-independent)")
    ratio_half = {}
    for hn, yrs in HALVES.items():
        ks = [(PACKS[0], p, yr, 1.0) for p in bt.PTS for yr in yrs]
        r = sum(energy[k][0] for k in ks) / sum(energy[k][1] for k in ks)
        ratio_half[hn] = r
        print(f"   {hn}: {r:.4f}  (effective plan optimism at scale s = s / {r:.4f})")

    print("\nPer cell (half, pack, s): PS, PSS, default W(0.5) tau 30 as km/B ex/B dominates; longest safe tau")
    print("  half C kWh   s   eff  | B km      B ex  |  PS km/B ex/B d | PSS km/B ex/B d | dflt km/B ex/B d | "
          "safe tau a")
    for hn in HALVES:
        for c in PACKS:
            for s in SCALES:
                t = C[(s, hn, c)]
                b = t[BASE]
                p, q, d = row(t, PS[c]), row(t, PSS[c]), row(t, DEFAULT)
                lt, la = longest_safe(t)
                print(f"  {hn:4s} {c / 1000:5.1f} {s:4.2f} {s / ratio_half[hn]:5.3f} | {b[0]:8.0f} {b[1]:6.0f} | "
                      f"{p[0]:7.4f} {p[1]:5.2f} {yn(p[2])} | {q[0]:8.4f} {q[1]:5.2f} {yn(q[2])} | "
                      f"{d[0]:9.4f} {d[1]:5.2f} {yn(d[2])} | {lt:3d} {'-' if la is None else f'{la:.3f}'}")

    print("\nDominance counts per s (of 8 half x pack cells)")
    print("     s  | PS | PSS | default | any tau-60 | any tau-30 | any tau-20 | any tau-10")
    cnt = {}
    for s in SCALES:
        ks = [(s, hn, c) for hn in HALVES for c in PACKS]
        n_ps = sum(row(C[k], PS[k[2]])[2] for k in ks)
        n_pss = sum(row(C[k], PSS[k[2]])[2] for k in ks)
        n_d = sum(row(C[k], DEFAULT)[2] for k in ks)
        anyt = [sum(any(bt.dominates(C[k], (a, tau)) for a in WEIGHTS) for k in ks) for tau in (60, 30, 20, 10)]
        cnt[s] = (n_ps, n_pss, n_d)
        print(f"  {s:4.2f}  | {n_ps:2d} | {n_pss:3d} | {n_d:7d} | " + " | ".join(f"{x:10d}" for x in anyt))

    print("\nPredictions")
    print(f"P1 PS dominates in >= 7 of 8 cells at s 0.98: {'held' if cnt[0.98][0] >= 7 else 'refuted'} "
          f"({cnt[0.98][0]} of 8)")
    seq = [cnt[s][0] for s in SCALES]
    rev = sum(b > a for a, b in zip(seq, seq[1:]))
    print(f"P2 PS count non-increasing in s, <= 1 reversal: {'held' if rev <= 1 else 'refuted'} "
          f"({seq}, {rev} reversal(s))")
    tot_ps, tot_pss = sum(v[0] for v in cnt.values()), sum(v[1] for v in cnt.values())
    low = [cnt[s][1] for s in SCALES if s <= 1.02]
    ok3 = tot_pss >= tot_ps and min(low) >= 6
    print(f"P3 PSS total >= PS total and >= 6 of 8 at every s <= 1.02: {'held' if ok3 else 'refuted'} "
          f"(PSS {tot_pss} of 56, PS {tot_ps} of 56; PSS per s {[cnt[s][1] for s in SCALES]})")
    print(f"P4 PSS dominates in >= 4 of 8 at s 1.03: {'held' if cnt[1.03][1] >= 4 else 'refuted'} "
          f"({cnt[1.03][1]} of 8)")
    km5 = [row(C[(s, hn, c)], PSS[c])[0] for s in SCALES for hn in HALVES for c in PACKS]
    print(f"P5 PSS km/B >= 1.03 in all 56 cells: {'held' if min(km5) >= 1.03 else 'refuted'} "
          f"({sum(x >= 1.03 for x in km5)} of 56; min {min(km5):.4f})")
    n6, series = 0, []
    for hn in HALVES:
        for c in PACKS:
            ts = [longest_safe(C[(s, hn, c)])[0] for s in SCALES]
            ok = all(b <= a for a, b in zip(ts, ts[1:]))
            n6 += ok
            series.append(f"{hn}/{c / 1000:g} {ts}")
    print(f"P6 longest safe tau non-increasing in s in >= 6 of 8 series: {'held' if n6 >= 6 else 'refuted'} "
          f"({n6} of 8)")
    for x in series:
        print(f"     {x}")
    spread = {}
    for hn in HALVES:
        for c in PACKS:
            kms = [C[(s, hn, c)][BASE][0] for s in SCALES]
            spread[(hn, c)] = max(kms) / min(kms) - 1.0
    print(f"P7 B's km moves < 2% across s at every (half, pack): "
          f"{'held' if max(spread.values()) < 0.02 else 'refuted'} "
          f"(max {max(spread.values()) * 100:.2f}%: " + ", ".join(f"{h}/{c / 1000:g} {v * 100:.2f}%"
                                                         for (h, c), v in spread.items()) + ")")


if __name__ == "__main__":
    main()
