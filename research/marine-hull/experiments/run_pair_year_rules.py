"""Milestone 6zzk: do the two-year rules of 6zzb to 6zzh beat no correction when the two learning years are drawn
from all ten pairs of the other half's five years, not only the pair next to the scored half?

Why: 6zzj's "Next" (a two-year band pool averaged over its ten pairs). 6zzi showed that for the raw month ratios
LC the nearest pair (lags 1 and 2, the only pair 6zzb to 6zzh learned from) was the worst of the ten pairs (116 of
168 against a ten-pair mean of 140.8), and 6zzj showed lag 1 was the worst single year for every shrinkage rule.
The two-year verdicts of 6zzd to 6zzh (LHF_2 140, LAP_2 143, LB_2 143, HR_2 149, HX_2 149 of 168) therefore rest on
one draw that includes the worst year. Two seasons is the history length a designer is most likely to have before
committing to a correction, so the fair two-year numbers are the ones the paper section needs.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, clamp and dominance exactly as 6zzi and 6zzj (NASA POWER daily
  ALLSKY_SFC_SW_DWN 2005 to 2014 at the 30 points, climatology 2015 to 2024, halves "E" 2005 to 2009 and "L"
  2010 to 2014, 50 W, packs 2.5 / 5 / 10 / 20 kWh, the real shape plus 6zz's 20 swept shapes, 168 pooled cells,
  240 per-point real-shape cells, 6zza's nine high-amplitude points). A pair S = {a, b} of lags in {1..5} (ten
  pairs): scoring L learns from 2010 - a and 2010 - b, scoring E from 2009 + a and 2009 + b (6zzi's years_of).
  Every rule learns from those two years; fleet and band pools use the same two years at every point. Rules per
  pair, unchanged from 6zzj: LC, LHF, LAP, LB, HR, HX.
  Checks: LC on each pair reproduces 6zzi's k = 2 subsets (nearest pair 116, ten-pair mean 140.8, range 116 to 155);
  on the nearest pair {1,2} LHF 140, LAP 143, LB 143, HR 149, HX 149 of 168 reproduce 6zzd to 6zzh.
  Summaries per rule over the ten pairs: mean, min, max, rank of the nearest pair (1 = best); the one-year means of
  6zzj for comparison; at the high-amplitude points, the mean over the four pairs that contain lag 3 against the
  mean over the six that do not (6zzj: lag 3 is a near-total loss there for every rule).
Predictions (priors in brackets; AT_90 139 of 168, 25 of 168 at the high-amplitude points, 126 of 240 per-point):
  K1  Every harmonic rule (LHF, LAP, LB, HR, HX) has a ten-pair mean over 168 cells of at least 139. [80%]
  K2  HR's ten-pair mean over 168 cells exceeds its one-year five-lag mean of 6zzj (147.0). [70%]
  K3  HR's worst pair over 168 cells scores at least 139 (never loses to no correction). [60%]
  K4  HR's ten-pair mean over 168 cells is at least its nearest-pair 149. [50%]
  K5  The nearest pair ranks 6 or worse of 10 for HR over 168 cells. [60%]
  K6  Every shrinkage rule (LAP, LB, HR, HX) spans fewer cells over the ten pairs than LC does. [80%]
  K7  HR or HX has the highest ten-pair mean over 168 cells among the five harmonic rules (ties count). [55%]
  K8  At the high-amplitude points LC's ten-pair mean exceeds HR's. [65%]
  K9  At the high-amplitude points, for every rule, the four pairs with lag 3 average below the six without. [75%]
  K10 Over the 240 per-point real-shape cells HR's ten-pair mean is at least 126 (no correction). [75%]
Descriptive: every rule x pair on all 168, real 8, high-amplitude 168, high-amplitude real 8 and per-point 240.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_pair_year_rules.py > experiments/results_pair_year_rules.txt
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
PAIRS = tuple(itertools.combinations((1, 2, 3, 4, 5), 2))
NEAREST = (1, 2)
TAGS = sy.TAGS
HARM = TAGS[1:]
SHRINK = sy.SHRINK
RULES = ("AT_90",) + tuple(f"{t}_{a}{b}" for t in TAGS for a, b in PAIRS)
AT, AT_HI, AT_PP = 139, 25, 126
LC_K2 = (116, 140.8, 155)  # 6zzi: nearest pair, ten-pair mean, max
NEAR_REF = {"LHF": 140, "LAP": 143, "LB": 143, "HR": 149, "HX": 149}
ONE_YEAR_MEAN = {"LC": 121.8, "LHF": 138.8, "LAP": 142.2, "LB": 143.4, "HR": 147.0, "HX": 146.6}  # 6zzj


def rname(tag, pair):
    return f"{tag}_{pair[0]}{pair[1]}"


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
    for pair in PAIRS:
        fac = sy.factors(p, su.years_of(hn, pair), shape)
        for tag in TAGS:
            hm = [ls.interp(fac[tag], d) * x for d, x in enumerate(hc)]
            runs[rname(tag, pair)] = (pt.target(hm, cap, HOTEL), hm)
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


def summary(table, tag):
    """(mean, min, max, rank of the nearest pair with 1 = best) over the ten pairs."""
    v = [table[rname(tag, pr)] for pr in PAIRS]
    near = table[rname(tag, NEAREST)]
    return st.fmean(v), min(v), max(v), 1 + sum(x > near for x in v)


def lag3_split(table, tag):
    """(mean over pairs with lag 3, mean over pairs without)."""
    w = [table[rname(tag, pr)] for pr in PAIRS if 3 in pr]
    wo = [table[rname(tag, pr)] for pr in PAIRS if 3 not in pr]
    return st.fmean(w), st.fmean(wo)


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
    print("Milestone 6zzk: the rules of 6zzb to 6zzh learned on each of the ten pairs of learning years, "
          "2005 to 2014 (50 W)")
    print("pair {a,b}: scoring L learns from 2010 - a and 2010 - b, scoring E from 2009 + a and 2009 + b; "
          "every pool uses the same two years")
    print(f"high-amplitude points: {', '.join(hi)} ({len(hi)})")
    print("\nAT_90 (no correction): " + ", ".join(f"{c} {tables[c]['AT_90']}" for c in cols))

    print("\nPer rule and pair: dominance counts")
    print("  rule     | " + " | ".join(f"{c:>7s}" for c in cols))
    for tag in TAGS:
        for pr in PAIRS:
            r = rname(tag, pr)
            print(f"  {r:8s} | " + " | ".join(f"{tables[c][r]:7d}" for c in cols))

    print("\nPer rule over the ten pairs: mean [min, max] and the nearest pair's rank (1 = best)")
    for tag in TAGS:
        parts = []
        for c in cols:
            m, lo, hi_, rk = summary(tables[c], tag)
            parts.append(f"{m:6.1f} [{lo:3d},{hi_:3d}] r{rk:<2d}")
        print(f"  {tag:4s} | " + " | ".join(parts))

    print("\nOne year (6zzj five-lag mean) against two years (ten-pair mean), 168 cells")
    a = tables["all168"]
    m = {t: summary(a, t) for t in TAGS}
    for tag in TAGS:
        print(f"  {tag:4s}: {ONE_YEAR_MEAN[tag]:6.1f} -> {m[tag][0]:6.1f} ({m[tag][0] - ONE_YEAR_MEAN[tag]:+.1f})")

    h = tables["hi168"]
    print("\nHigh-amplitude 168 cells: mean over the 4 pairs with lag 3 / the 6 without")
    for tag in TAGS:
        w, wo = lag3_split(h, tag)
        print(f"  {tag:4s}: {w:6.1f} / {wo:6.1f}")

    lc = [a[rname("LC", pr)] for pr in PAIRS]
    print("\nSpearman rho of each rule's per-pair 168-cell counts against LC's")
    for tag in HARM:
        v = [a[rname(tag, pr)] for pr in PAIRS]
        print(f"  {tag:4s} rho {su.spearman(lc, v):+.3f}  counts by pair {', '.join(f'{x}{y}' for x, y in PAIRS)}: {v}")

    print("\nReal shape, all 30 points, km/B pooled over the 8 cells (half x pack): min / mean / max over pairs")
    for tag in ("AT_90",) + TAGS:
        vals = []
        for pr in (PAIRS if tag != "AT_90" else (None,)):
            r = tag if pr is None else rname(tag, pr)
            tot_r = tot_b = 0.0
            for yrs in HALVES.values():
                for c in PACKS:
                    t = sb.total(cells, [(c, p, yr) + REAL for p in bt.PTS for yr in yrs])
                    tot_r += t[r][0]
                    tot_b += t[BASE][0]
            vals.append(tot_r / tot_b)
        print(f"  {tag:5s}: {min(vals):.4f} / {st.fmean(vals):.4f} / {max(vals):.4f}")

    print(f"\nCheck: LC nearest pair {a[rname('LC', NEAREST)]}, ten-pair mean {m['LC'][0]:.1f}, max {m['LC'][2]} "
          f"(6zzi: {LC_K2[0]} / {LC_K2[1]} / {LC_K2[2]}); nearest pair "
          + ", ".join(f"{t} {a[rname(t, NEAREST)]} ({NEAR_REF[t]})" for t in NEAR_REF) + f"; AT_90 {a['AT_90']} ({AT})")
    hr = lambda ok: "held" if ok else "refuted"  # noqa: E731
    mh = {t: summary(h, t) for t in TAGS}
    mp = {t: summary(tables["pp240"], t) for t in TAGS}
    print("\nPredictions")
    print(f"K1 every harmonic ten-pair mean >= {AT}: {hr(all(m[t][0] >= AT for t in HARM))} ("
          + ", ".join(f"{t} {m[t][0]:.1f}" for t in HARM) + ")")
    print(f"K2 HR ten-pair mean > one-year 147.0: {hr(m['HR'][0] > ONE_YEAR_MEAN['HR'])} ({m['HR'][0]:.1f})")
    print(f"K3 HR worst pair >= {AT}: {hr(m['HR'][1] >= AT)} ({m['HR'][1]})")
    print(f"K4 HR ten-pair mean >= nearest-pair 149: {hr(m['HR'][0] >= NEAR_REF['HR'])} ({m['HR'][0]:.1f})")
    print(f"K5 nearest pair rank >= 6 for HR: {hr(m['HR'][3] >= 6)} (rank {m['HR'][3]})")
    spans = {t: m[t][2] - m[t][1] for t in TAGS}
    print(f"K6 every shrinkage span < LC's: {hr(all(spans[t] < spans['LC'] for t in SHRINK))} ("
          + ", ".join(f"{t} {spans[t]}" for t in TAGS) + ")")
    best = max(m[t][0] for t in HARM)
    print(f"K7 HR or HX highest ten-pair mean: {hr(max(m['HR'][0], m['HX'][0]) >= best)} (best {best:.1f})")
    print(f"K8 high-amp LC mean > HR mean: {hr(mh['LC'][0] > mh['HR'][0])} "
          f"(LC {mh['LC'][0]:.1f}, HR {mh['HR'][0]:.1f})")
    sp = {t: lag3_split(h, t) for t in TAGS}
    print(f"K9 high-amp pairs with lag 3 below those without, every rule: {hr(all(w < wo for w, wo in sp.values()))}")
    print(f"K10 HR per-point 240 ten-pair mean >= {AT_PP}: {hr(mp['HR'][0] >= AT_PP)} ({mp['HR'][0]:.1f})")


if __name__ == "__main__":
    main()
