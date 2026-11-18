"""Milestone 6zzs: does a dark-summer guard gated on the boat's own operating side keep 6zzp's high-amplitude gain
without its cost on the other points? The side is read from a replay the boat can make: the uncorrected AT_90 plan
and the baseline B run over the one year it logged.

Why: 6zzp's and 6zzr's "Next". 6zzp's dark guard DG (local-summer months c'_m = max(c_m, 1)) lifted the worst
single-year lag at the nine high-amplitude points from 1 to 74 of 168 (five-lag mean 109.2 against LC's 81.0) but
cost the 30-point pool (106.0 against 121.8), and every all168 cell it lost, it lost on dark hours: a brighter
expected summer makes the boat bolder (6zzn), which helps a boat that runs short on km and hurts one already
carrying dark hours. 6zzp's reading was that the guard has to look at which side of the km / dark-hours trade the
boat sits on. A deployed boat with one learned year cannot see the scored years, but it can replay its own logged
year: run the uncorrected AT_90 plan and the baseline B over that year's measured sun, at its own pack and point,
and see whether AT_90 fell short of B on km or carried more dark hours.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, clamp, interpolation, AT_90 rule, baseline B, "dominates B", the four counts
  (all168, real8, hi168, pp240), the five single-year lags and local summer exactly as 6zzp
  (`run_dark_summer_guard.py`). Learning year for lag g: 2010 - g when the scored half is L, 2009 + g when it is E.
  Replay side, per (pack, point, shape, learning year y): the AT_90 and B results at the cell (pack, point, y,
  shape). Every year 2005 to 2014 is itself a scored year, so the replay is read from the same cells, and AT_90 there
  uses only the 2015 to 2024 climatology, nothing learned. side = "short" if AT_90 km < B km on y (whatever its dark
  hours), else "dark" if AT_90 excess dark hours > B's on y, else "ok".
  Rules per lag g (monthly ratios c'_m applied exactly as 6zzp's):
    LC_g   raw learned ratios (checks: all168 97 / 117 / 132 / 152 / 111, hi168 77 / 153 / 1 / 124 / 50).
    DG_g   6zzp's dark guard (checks: all168 89 / 105 / 136 / 131 / 69, hi168 105 / 152 / 74 / 124 / 91).
    BG_g   the mirror, a bright guard: summer months c'_m = min(c_m, 1) (control; makes the boat more cautious).
    OG_g   side-gated dark guard: DG_g where the replay side is "short", LC_g otherwise.
    OM_g   side-gated both ways: DG_g where "short", BG_g where "dark", LC_g where "ok".
  AT_90 (no correction) all168 139, hi168 25, real8 8, pp240 126.
Predictions (priors in brackets; "mean" = mean over the five lags):
  S1  OG keeps most of DG's high-amplitude gain: OG mean hi168 >= 100 (DG 109.2, LC 81.0). [50%]
  S2  OG does not cost the 30-point pool: OG mean all168 >= LC's 121.8. [55%]
  S3  OG beats DG on the 30-point pool: OG mean all168 > 106.0. [70%]
  S4  OG repairs lag 3: OG_3 hi168 >= 30 (LC_3 1). [50%]
  S5  OG's worst lag on hi168 is at least 30 (LC's worst 1, DG's 74). [35%]
  S6  OG's mean all168 reaches no correction's 139. [20%]
  S7  Gating the mirror too helps on the 30-point pool: OM mean all168 >= OG mean all168. [45%]
  S8  The bright guard alone does not help at high amplitude: BG mean hi168 < LC's 81.0. [65%]
  S9  The bright guard alone does not rescue the 30-point pool: BG mean all168 < 139. [75%]
  S10 The replay side is informative: in the per-point real-shape cells (point, pack, scored year), the learning
      year's AT_90 side equals the scored year's AT_90 side in at least 70% of cases, pooled over lags. [50%]
Descriptive: every rule x lag on all four counts; per rule mean [min, max] over lags; failure modes of the hi168 and
  all168 cells for LC, DG, OG, OM; the share of replays on each side, by pool; the side agreement of S10 by lag.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_side_guard.py > experiments/results_side_guard.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import statistics as st
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_blend_transfer as bt  # noqa: E402
import run_dark_summer_guard as dsg  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_lag3_diagnosis as dg  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_subset_years as su  # noqa: E402
import run_summer_shift as ss  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE, PS = fy.PACKS, fy.HOTEL, fy.BASE, fy.PS
HALVES, YEARS = fy.HALVES, fy.YEARS
REAL, SHAPES, N = ls.REAL, ls.SHAPES, ls.N
LAGS = dsg.LAGS
RUN_TAGS = ("LC", "DG", "BG")
GATED = ("OG", "OM")
TAGS = RUN_TAGS + GATED
RULES = ("AT_90",) + tuple(f"{t}_{g}" for t in TAGS for g in LAGS)
CHECK_ALL = {f"LC_{g}": v for g, v in zip(LAGS, (97, 117, 132, 152, 111))}
CHECK_ALL.update({f"DG_{g}": v for g, v in zip(LAGS, (89, 105, 136, 131, 69))})
CHECK_HI = {f"LC_{g}": v for g, v in zip(LAGS, (77, 153, 1, 124, 50))}
CHECK_HI.update({f"DG_{g}": v for g, v in zip(LAGS, (105, 152, 74, 124, 91))})
CHECK_AT = {"all168": 139, "hi168": 25, "real8": 8, "pp240": 126}


def bright(c, months):
    """Bright guard: c'_m = min(c_m, 1) in the named calendar months."""
    return tuple(min(x, 1.0) if i + 1 in months else x for i, x in enumerate(c))


def corrections(p, hn, shape):
    """{rule: 12 monthly ratios} for LC, DG and BG at every lag, scoring half hn."""
    summer = dg.season_months(p, "summer")
    out = {}
    for g in LAGS:
        c = ly.learned(p, su.years_of(hn, (g,)), shape)[0]
        out[f"LC_{g}"] = c
        out[f"DG_{g}"] = dsg.guard(c, summer, "max")
        out[f"BG_{g}"] = bright(c, summer)
    return out


def learning_year(yr, g):
    return su.years_of(fy.half_of(yr), (g,))[0]


def side(t):
    """Operating side of AT_90 against B in one cell result t."""
    if t["AT_90"][0] < t[BASE][0]:
        return "short"
    if t["AT_90"][1] > t[BASE][1]:
        return "dark"
    return "ok"


def score(key):
    """((cap, point, year, s0, amp, phi), {rule: (km, excess dark h, tau-days)}) for AT_90, LC, DG, BG."""
    cap, p, yr, s0, amp, phi = key
    shape = (s0, amp, phi)
    sun, h = fy._sun(p, yr)
    h = list(h)
    hc = ls.scaled(p, yr, shape)[1]
    T = pt.target(hc, cap, HOTEL)
    idle_dark = yp.idle(sun, cap, HOTEL)[1]
    b = sw.run(sun, T, hc, *sw.BASE, cap, HOTEL)
    out = {BASE: (b["km"], b["dark"] - idle_dark, None)}
    a = PS[cap][0]
    ones = [1.0] * len(h)
    runs = {"AT_90": (T, hc)}
    for g, cm in corrections(p, fy.half_of(yr), shape).items():
        hm = [ls.interp(cm, d) * x for d, x in enumerate(hc)]
        runs[g] = (pt.target(hm, cap, HOTEL), hm)
    for g, (TT, cc) in runs.items():
        taus = [sb.tau_of(1.0 / x) for x in sb.ratios(h, cc, N)]
        km, dark, days = sb.run(h, TT, cc, a, taus, ones, cap, HOTEL)
        out[g] = (km, dark - idle_dark, days)
    return key, out


def gate(cells):
    """Add OG_g and OM_g to every cell from the replay side of its learning year; returns {key: {g: side}}."""
    sides = {}
    for key, t in cells.items():
        cap, p, yr = key[:3]
        sh = key[3:]
        sides[key] = {}
        for g in LAGS:
            s = side(cells[(cap, p, learning_year(yr, g)) + sh])
            sides[key][g] = s
            t[f"OG_{g}"] = t[f"DG_{g}"] if s == "short" else t[f"LC_{g}"]
            t[f"OM_{g}"] = t[{"short": f"DG_{g}", "dark": f"BG_{g}", "ok": f"LC_{g}"}[s]]
    return sides


def evaluate(points=bt.PTS, shapes=SHAPES, procs=4):
    fy.prepare()
    keys = [(c, p, yr) + sh for p in points for yr in YEARS for c in PACKS for sh in shapes]
    with Pool(procs) as pool:
        res = pool.map(score, keys, chunksize=8)
    cells = dict(res)
    sides = gate(cells)
    return cells, sides


def side_share(sides, points, shapes):
    """{side: share} over the (pack, point, shape, learning year) replays."""
    n = {"short": 0, "dark": 0, "ok": 0}
    seen = set()
    for (cap, p, yr, *sh), by in sides.items():
        if p not in points or tuple(sh) not in shapes:
            continue
        for g, s in by.items():
            k = (cap, p, learning_year(yr, g), tuple(sh))
            if k not in seen:
                seen.add(k)
                n[s] += 1
    tot = sum(n.values())
    return {s: v / tot for s, v in n.items()}, tot


def agreement(cells, sides, points):
    """{lag: share of real-shape (point, pack, scored year) cells whose replay side equals the scored side}."""
    out = {}
    for g in LAGS:
        k = n = 0
        for p in points:
            for yr in YEARS:
                for c in PACKS:
                    key = (c, p, yr) + REAL
                    n += 1
                    k += sides[key][g] == side(cells[key])
        out[g] = k / n
    return out


def all_modes(cells, points, rule):
    """(km only, dark only, both) over the pooled 168 cells of `points`."""
    return ss.failure_modes(cells, points, rule)


def main():
    ss.RULES = RULES  # ss's counting helpers read the rule list from their module
    pts, hi = bt.PTS, ls.high_amp_points()
    cells, sides = evaluate(pts)
    tab = {"all168": ss.pooled(cells, pts, SHAPES), "real8": ss.pooled(cells, pts, (REAL,)),
           "hi168": ss.pooled(cells, hi, SHAPES), "pp240": ss.per_point(cells, pts)}
    print("Milestone 6zzs: a dark-summer guard gated on the operating side the boat reads from replaying its own "
          "learning year, all 30 points and the five single-year lags, 2005 to 2014 (50 W)")
    print("lag g: scoring L learns from 2010 - g, scoring E from 2009 + g; local summer JJA north, DJF south")
    print(f"high-amplitude points: {', '.join(hi)} ({len(hi)})")
    ok = (all(tab["all168"][g] == v for g, v in CHECK_ALL.items())
          and all(tab["hi168"][g] == v for g, v in CHECK_HI.items())
          and all(tab[k]["AT_90"] == v for k, v in CHECK_AT.items()))
    print("\nChecks (6zzj, 6zzp): all168 " + ", ".join(f"{g} {tab['all168'][g]} ({v})" for g, v in CHECK_ALL.items())
          + "; hi168 " + ", ".join(f"{g} {tab['hi168'][g]} ({v})" for g, v in CHECK_HI.items())
          + "; AT_90 " + ", ".join(f"{k} {tab[k]['AT_90']} ({v})" for k, v in CHECK_AT.items())
          + ("  ok" if ok else "  MISMATCH"))

    cols = ("all168", "real8", "hi168", "pp240")
    print("\nPer rule and lag: dominance counts")
    print("  rule   | " + " | ".join(f"{c:>7s}" for c in cols))
    for g in RULES:
        print(f"  {g:6s} | " + " | ".join(f"{tab[c][g]:7d}" for c in cols))

    print("\nPer rule over the five lags: mean [min, max]")
    summ = {}
    for t in TAGS:
        row = []
        for c in cols:
            xs = [tab[c][f"{t}_{g}"] for g in LAGS]
            summ[(t, c)] = (st.mean(xs), min(xs), max(xs))
            row.append(f"{st.mean(xs):6.1f} [{min(xs):3d},{max(xs):3d}]")
        print(f"  {t:3s} | " + " | ".join(row))

    for name, ps in (("hi168", hi), ("all168", pts)):
        print(f"\nFailing {name} cells by mode (km only / dark only / both)")
        for t in ("LC", "DG", "OG", "OM"):
            print(f"  {t}: " + "; ".join(
                "lag {} {}/{}/{}".format(g, *all_modes(cells, ps, f"{t}_{g}")) for g in LAGS))

    print("\nReplay side of the learning year (AT_90 against B on that year): share short / dark / ok")
    for name, ps, shs in (("all 30, 21 shapes", pts, SHAPES), ("high-amplitude, 21 shapes", hi, SHAPES),
                          ("all 30, real shape", pts, (REAL,))):
        sh, tot = side_share(sides, ps, shs)
        print(f"  {name}: {sh['short']:.3f} / {sh['dark']:.3f} / {sh['ok']:.3f} (n = {tot})")

    agr = agreement(cells, sides, pts)
    agr_hi = agreement(cells, sides, hi)
    pooled_agr = st.mean(agr.values())
    print("\nReplay side equals scored-year side (real shape, per point, pack and scored year): all 30 / high-amplitude")
    print("  " + ", ".join(f"lag {g} {agr[g]:.3f} / {agr_hi[g]:.3f}" for g in LAGS)
          + f"; pooled {pooled_agr:.3f} / {st.mean(agr_hi.values()):.3f}")

    m = lambda t, c: summ[(t, c)][0]  # noqa: E731
    v = lambda b: "held" if b else "refuted"  # noqa: E731
    hi168 = tab["hi168"]
    print("\nPredictions")
    print(f"S1 OG mean hi168 >= 100: {v(m('OG', 'hi168') >= 100)} ({m('OG', 'hi168'):.1f})")
    print(f"S2 OG mean all168 >= 121.8: {v(m('OG', 'all168') >= 121.8)} ({m('OG', 'all168'):.1f})")
    print(f"S3 OG mean all168 > 106.0: {v(m('OG', 'all168') > 106.0)} ({m('OG', 'all168'):.1f})")
    print(f"S4 OG_3 hi168 >= 30: {v(hi168['OG_3'] >= 30)} ({hi168['OG_3']})")
    print(f"S5 OG worst lag hi168 >= 30: {v(summ[('OG', 'hi168')][1] >= 30)} ({summ[('OG', 'hi168')][1]})")
    print(f"S6 OG mean all168 >= 139: {v(m('OG', 'all168') >= 139)} ({m('OG', 'all168'):.1f})")
    print(f"S7 OM mean all168 >= OG mean all168: {v(m('OM', 'all168') >= m('OG', 'all168'))} "
          f"({m('OM', 'all168'):.1f} vs {m('OG', 'all168'):.1f})")
    print(f"S8 BG mean hi168 < 81.0: {v(m('BG', 'hi168') < 81.0)} ({m('BG', 'hi168'):.1f})")
    print(f"S9 BG mean all168 < 139: {v(m('BG', 'all168') < 139)} ({m('BG', 'all168'):.1f})")
    print(f"S10 replay side agreement >= 0.70: {v(pooled_agr >= 0.70)} ({pooled_agr:.3f})")


if __name__ == "__main__":
    main()
