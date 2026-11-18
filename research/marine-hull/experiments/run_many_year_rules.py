"""Milestone 6zzr: with three, four or five seasons of log, do the shrinkage rules of 6zzd to 6zzh (scored over every
subset of learning years) cross both floors, all 30 points and the nine high-amplitude points, before the raw month
ratios LC do at four seasons?

Why: 6zzq's design table found that over every draw of learning years only LC with four or five seasons never falls
below no correction (AT_90: 139 of 168 on all30, 25 of 168 at the high-amplitude points) on both pools. But the
shrinkage rules (LHF, LAP, LB, HR, HX) were scored over all subsets only at one season (6zzj) and two (6zzk), so "only
LC at k >= 4" means only among the rules run there. A designer choosing between "pool after one season" and "wait
four seasons for raw ratios" needs to know whether a pooled rule gets there sooner, and whether more years cost the
pooled rules on ordinary water what they gain at high latitude.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, clamp and dominance exactly as 6zzi to 6zzk (NASA POWER daily ALLSKY_SFC_SW_DWN
  2005 to 2014 at the 30 points, climatology 2015 to 2024, halves "E" 2005 to 2009 and "L" 2010 to 2014, 50 W, packs
  2.5 / 5 / 10 / 20 kWh, the real shape plus 6zz's 20 swept shapes, 168 pooled cells, 240 per-point real-shape cells,
  6zza's nine high-amplitude points). A lag set S in {1..5} with |S| = 3 (ten sets), 4 (five) or 5 (one): scoring L
  learns from {2010 - g}, scoring E from {2009 + g} (6zzi's years_of). Every rule learns on those years; fleet and band
  pools use the same years at every point. Rules unchanged from 6zzj / 6zzk: LC, LHF, LAP, LB, HR, HX.
  Checks: LC reproduces 6zzi's subset rows (k = 3: 149.3 [123, 160], hi 95.7 [50, 128]; k = 4: 152.2 [143, 160],
  hi 99.8 [81, 107]; k = 5: 158, hi 105).
  Summaries per rule and k: mean, min, max over the subsets on all168, hi168 and pp240; at k = 3 the high-amplitude
  mean over the six sets that contain lag 3 against the four that do not; "crosses both floors" means min >= 139 on
  all168 and min >= 25 on hi168.
Predictions (priors in brackets; 6zzk two-year means: HR 151.9 [145, 159], hi 54.0 [18, 80]; HX 152.1, hi 56.0 [19, 83];
LC k = 3 / 4 hi 95.7 / 99.8):
  R1  HR's k = 3 mean over 168 cells exceeds its two-year mean 151.9. [60%]
  R2  HR's worst k = 4 set over 168 cells is at least 139. [85%]
  R3  HR crosses both floors at k = 3. [40%]
  R4  HR crosses both floors at k = 4. [60%]
  R5  At the high-amplitude points LC's mean exceeds HR's at k = 3 and at k = 4. [80%]
  R6  At k = 4, HR's mean over 168 cells exceeds LC's (152.2). [55%]
  R7  At k = 3 the five harmonic rules' means over 168 cells lie within 1.5 cells of each other. [60%]
  R8  At k = 3, HR's span over 168 cells is smaller than LC's (37). [80%]
  R9  At k = 3, for every rule, the high-amplitude mean over sets with lag 3 is below that over sets without. [75%]
  R10 At least one shrinkage rule (LHF, LAP, LB, HR, HX) crosses both floors at k = 3. [50%]
Descriptive: every rule x set on all 168, real 8, high-amplitude 168, high-amplitude real 8 and per-point 240; km / B.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_many_year_rules.py > experiments/results_many_year_rules.txt
(stdlib, deterministic; uses up to 4 processes)"""
import itertools
import os
import statistics as st
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_blend_transfer as bt  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_single_year_rules as sy  # noqa: E402
import run_subset_years as su  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE, PS = fy.PACKS, fy.HOTEL, fy.BASE, fy.PS
HALVES, YEARS = fy.HALVES, fy.YEARS
REAL, SHAPES, N = ls.REAL, ls.SHAPES, ls.N
KS = (3, 4, 5)
SETS = {k: tuple(itertools.combinations((1, 2, 3, 4, 5), k)) for k in KS}
ALL_SETS = tuple(s for k in KS for s in SETS[k])
TAGS = sy.TAGS
HARM = TAGS[1:]
SHRINK = sy.SHRINK
RULES = ("AT_90",) + tuple(f"{t}_{''.join(map(str, s))}" for t in TAGS for s in ALL_SETS)
AT, AT_HI, AT_PP = 139, 25, 126
LC_REF = {3: (149.3, 123, 160, 95.7, 50, 128), 4: (152.2, 143, 160, 99.8, 81, 107), 5: (158.0, 158, 158, 105.0, 105, 105)}
TWO_YEAR = {"LC": (140.8, 92.3), "LHF": (151.2, 76.6), "LAP": (151.9, 59.2), "LB": (152.0, 56.0),
            "HR": (151.9, 54.0), "HX": (152.1, 56.0)}  # 6zzk ten-pair means, all168 / hi168


def rname(tag, s):
    return f"{tag}_{''.join(map(str, s))}"


def score(key):
    """((cap, point, year, s0, amp, phi), {rule: (km, excess dark h, tau-days)})."""
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
    hn = fy.half_of(yr)
    for s in ALL_SETS:
        fac = sy.factors(p, su.years_of(hn, s), shape)
        for tag in TAGS:
            hm = [ls.interp(fac[tag], d) * x for d, x in enumerate(hc)]
            runs[rname(tag, s)] = (pt.target(hm, cap, HOTEL), hm)
    for name, (TT, cc) in runs.items():
        taus = [sb.tau_of(1.0 / x) for x in sb.ratios(h, cc, N)]
        km, dark, days = sb.run(h, TT, cc, a, taus, ones, cap, HOTEL)
        out[name] = (km, dark - idle_dark, days)
    return key, out


def evaluate(points=bt.PTS, shapes=SHAPES, procs=4):
    fy.prepare()
    keys = [(c, p, yr) + sh for p in points for yr in YEARS for c in PACKS for sh in shapes]
    with Pool(procs) as pool:
        res = pool.map(score, keys, chunksize=8)
    return dict(res)


def pooled(cells, points, shapes):
    n = dict.fromkeys(RULES, 0)
    for sh in shapes:
        for yrs in HALVES.values():
            for c in PACKS:
                t = sb.total(cells, [(c, p, yr) + sh for p in points for yr in yrs])
                for g in RULES:
                    n[g] += sb.dominates(t, g)
    return n


def per_point(cells, points):
    n = dict.fromkeys(RULES, 0)
    for p in points:
        for yrs in HALVES.values():
            for c in PACKS:
                t = sb.total(cells, [(c, p, yr) + REAL for yr in yrs])
                for g in RULES:
                    n[g] += sb.dominates(t, g)
    return n


def summary(table, tag, k):
    """(mean, min, max) over the subsets of size k."""
    v = [table[rname(tag, s)] for s in SETS[k]]
    return st.fmean(v), min(v), max(v)


def lag3_split(table, tag, k=3):
    """(mean over sets of size k with lag 3, mean over those without)."""
    w = [table[rname(tag, s)] for s in SETS[k] if 3 in s]
    wo = [table[rname(tag, s)] for s in SETS[k] if 3 not in s]
    return st.fmean(w), st.fmean(wo)


def crosses(all168, hi168, tag, k):
    """True when the rule never falls below no correction on either pool over the subsets of size k."""
    return summary(all168, tag, k)[1] >= AT and summary(hi168, tag, k)[1] >= AT_HI


def main():
    cells = evaluate()
    hi = ls.high_amp_points()
    tables = {
        "all168": pooled(cells, bt.PTS, SHAPES),
        "real8": pooled(cells, bt.PTS, (REAL,)),
        "hi168": pooled(cells, hi, SHAPES),
        "hireal8": pooled(cells, hi, (REAL,)),
        "pp240": per_point(cells, bt.PTS),
    }
    cols = tuple(tables)
    a, h = tables["all168"], tables["hi168"]
    print("Milestone 6zzr: the rules of 6zzb to 6zzh learned on every set of three, four and five learning years, "
          "2005 to 2014 (50 W)")
    print("set S: scoring L learns from {2010 - g}, scoring E from {2009 + g}; every pool uses the same years")
    print(f"high-amplitude points: {', '.join(hi)} ({len(hi)})")
    print("\nAT_90 (no correction): " + ", ".join(f"{c} {tables[c]['AT_90']}" for c in cols))

    print("\nPer rule and set: dominance counts")
    print("  rule      | " + " | ".join(f"{c:>7s}" for c in cols))
    for tag in TAGS:
        for s in ALL_SETS:
            r = rname(tag, s)
            print(f"  {r:9s} | " + " | ".join(f"{tables[c][r]:7d}" for c in cols))

    print("\nPer rule and k: mean [min, max] over the subsets")
    for k in KS:
        print(f"  k = {k} ({len(SETS[k])} sets)")
        for tag in TAGS:
            parts = []
            for c in cols:
                m, lo, hi_ = summary(tables[c], tag, k)
                parts.append(f"{m:6.1f} [{lo:3d},{hi_:3d}]")
            print(f"    {tag:4s} | " + " | ".join(parts))

    print("\nHistory curve, 168 cells mean (all30 / high-amplitude): two years (6zzk) -> k = 3 -> 4 -> 5")
    for tag in TAGS:
        seq = [f"{TWO_YEAR[tag][0]:.1f} / {TWO_YEAR[tag][1]:.1f}"]
        seq += [f"{summary(a, tag, k)[0]:.1f} / {summary(h, tag, k)[0]:.1f}" for k in KS]
        print(f"  {tag:4s}: " + " -> ".join(seq))

    print("\nCrosses both floors (min >= 139 on all168 and >= 25 on hi168)")
    for tag in TAGS:
        print(f"  {tag:4s}: " + ", ".join(f"k={k} {'yes' if crosses(a, h, tag, k) else 'no'}" for k in KS))

    print("\nHigh-amplitude 168 cells at k = 3: mean over the 6 sets with lag 3 / the 4 without")
    for tag in TAGS:
        w, wo = lag3_split(h, tag)
        print(f"  {tag:4s}: {w:6.1f} / {wo:6.1f}")

    print("\nReal shape, all 30 points, km/B pooled over the 8 cells (half x pack): min / mean / max over sets, per k")
    for k in KS:
        for tag in ("AT_90",) + TAGS:
            vals = []
            for s in (SETS[k] if tag != "AT_90" else (None,)):
                r = tag if s is None else rname(tag, s)
                tot_r = tot_b = 0.0
                for yrs in HALVES.values():
                    for c in PACKS:
                        t = sb.total(cells, [(c, p, yr) + REAL for p in bt.PTS for yr in yrs])
                        tot_r += t[r][0]
                        tot_b += t[BASE][0]
                vals.append(tot_r / tot_b)
            print(f"  k={k} {tag:5s}: {min(vals):.4f} / {st.fmean(vals):.4f} / {max(vals):.4f}")

    print("\nCheck: LC against 6zzi")
    for k in KS:
        m, lo, hi_ = summary(a, "LC", k)
        mh, loh, hih = summary(h, "LC", k)
        print(f"  k={k}: all168 {m:.1f} [{lo},{hi_}], hi168 {mh:.1f} [{loh},{hih}]  (6zzi: {LC_REF[k]})")
    print(f"  AT_90 all168 {a['AT_90']} ({AT}), hi168 {h['AT_90']} ({AT_HI})")

    hr = lambda ok: "held" if ok else "refuted"  # noqa: E731
    m3 = {t: summary(a, t, 3) for t in TAGS}
    m4 = {t: summary(a, t, 4) for t in TAGS}
    h3 = {t: summary(h, t, 3) for t in TAGS}
    h4 = {t: summary(h, t, 4) for t in TAGS}
    print("\nPredictions")
    print(f"R1 HR k=3 mean > 151.9: {hr(m3['HR'][0] > 151.9)} ({m3['HR'][0]:.1f})")
    print(f"R2 HR k=4 worst >= {AT}: {hr(m4['HR'][1] >= AT)} ({m4['HR'][1]})")
    print(f"R3 HR crosses both floors at k=3: {hr(crosses(a, h, 'HR', 3))} "
          f"(all168 min {m3['HR'][1]}, hi168 min {h3['HR'][1]})")
    print(f"R4 HR crosses both floors at k=4: {hr(crosses(a, h, 'HR', 4))} "
          f"(all168 min {m4['HR'][1]}, hi168 min {h4['HR'][1]})")
    print(f"R5 high-amp LC mean > HR mean at k=3 and k=4: "
          f"{hr(h3['LC'][0] > h3['HR'][0] and h4['LC'][0] > h4['HR'][0])} "
          f"(k=3 {h3['LC'][0]:.1f} vs {h3['HR'][0]:.1f}; k=4 {h4['LC'][0]:.1f} vs {h4['HR'][0]:.1f})")
    print(f"R6 HR k=4 mean > LC's: {hr(m4['HR'][0] > m4['LC'][0])} (HR {m4['HR'][0]:.1f}, LC {m4['LC'][0]:.1f})")
    spread = max(m3[t][0] for t in HARM) - min(m3[t][0] for t in HARM)
    print(f"R7 harmonic k=3 means within 1.5 cells: {hr(spread <= 1.5)} (spread {spread:.1f}: "
          + ", ".join(f"{t} {m3[t][0]:.1f}" for t in HARM) + ")")
    spans = {t: m3[t][2] - m3[t][1] for t in TAGS}
    print(f"R8 HR k=3 span < LC's: {hr(spans['HR'] < spans['LC'])} ("
          + ", ".join(f"{t} {spans[t]}" for t in TAGS) + ")")
    sp = {t: lag3_split(h, t) for t in TAGS}
    print(f"R9 high-amp k=3 sets with lag 3 below those without, every rule: "
          f"{hr(all(w < wo for w, wo in sp.values()))}")
    x3 = [t for t in SHRINK + ("LHF",) if crosses(a, h, t, 3)]
    print(f"R10 some shrinkage rule crosses both floors at k=3: {hr(bool(x3))} ({', '.join(x3) or 'none'})")


if __name__ == "__main__":
    main()
