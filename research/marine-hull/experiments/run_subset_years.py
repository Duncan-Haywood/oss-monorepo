"""Milestone 6zzi: averaged over every choice of k learning years, how does the learned seasonal correction
depend on history length, and does recency matter?

Why: every milestone from 6zzb to 6zzh carried "the k and recency confound of 6zzb" in its limits. 6zzb learned
the month-by-month ratio c_m from the k years of the other half nearest the scored half, so k = 1 meant one
particular year (2009 or 2010), and more years also meant older years. Its high-amplitude counts peaked at
k = 2 (LC_k 77 / 138 / 104 / 105 of 168), which could be history length, staleness, or the luck of which
year was nearest. This milestone separates the three by scoring LC on every k-subset of the other half.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, clamp and rules exactly as 6zzb (NASA POWER daily ALLSKY_SFC_SW_DWN
  2005 to 2014 at the 30 points, climatology 2015 to 2024, halves "E" 2005 to 2009 and "L" 2010 to 2014,
  50 W, packs 2.5 / 5 / 10 / 20 kWh, the real shape plus 6zz's 20 swept shapes, 168 pooled cells).
  Learning years are named by lag set S, a subset of {1, ..., 5}: scoring L learns from the years 2010 - lag,
  scoring E from 2009 + lag, so lag 1 is the year next to the scored half and lag 5 the farthest. Every S with
  |S| = k in {1, 2, 3, 4, 5} is scored (5 + 10 + 10 + 5 + 1 = 31 sets); the same S is used for both halves,
  so each S gives a full set of 168 cells. LC_S = AT_90 on the climatology scaled by c_m learned on S.
  S = {1..k} is 6zzb's LC_k (a check: 97 / 116 / 142 / 158 for k = 1 / 2 / 3 / 5 over 168 cells).
  "Dominates B" as 6zv to 6zzh; high-amplitude points 6zza's nine; per-point cells as 6zzb (240 real-shape).
  Summaries per k: mean, min and max over the k-subsets of each count. Recency: mean lag of S; Spearman rank
  correlation of count against mean lag over the five single years (k = 1), and over all 30 sets with
  k = 1 to 4 after subtracting each k's mean count (a within-k correlation, so history length is removed).
Predictions (priors in brackets):
  S1  Subset-mean 168-cell count of LC_k is non-decreasing in k = 1, 2, 3, 4, 5. [70%]
  S2  Subset-mean LC_1 over 168 cells is below AT_90's 139. [85%]
  S3  Subset-mean LC_3 over 168 cells is at least AT_90's 139. [55%]
  S4  At the nine high-amplitude points (168 cells) the subset-mean count is non-decreasing in k
      (6zzb's k = 2 peak was the luck of the nearest years, not a real optimum). [55%]
  S5  The five single-year LC_1 counts over 168 cells span at least 10 cells (max - min). [60%]
  S6  Over the five single years, count falls with lag (Spearman rho < 0, recency helps). [40%]
  S7  Within-k Spearman rho of count against mean lag over the 30 sets with k = 1 to 4 is negative. [40%]
  S8  6zzb's nearest choice {1..k} is within the subset min-max range for every k (trivially true) and
      within 5 cells of the subset mean for k = 2 and 3. [50%]
Descriptive: every set's counts (all 168, real 8, high-amplitude 168, high-amplitude real 8, per-point 240);
  per k the mean / min / max; the rank of 6zzb's nearest set among its k.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_subset_years.py > experiments/results_subset_years.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import statistics as st
import sys
from itertools import combinations
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_blend_transfer as bt  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE, PS = fy.PACKS, fy.HOTEL, fy.BASE, fy.PS
HALVES, YEARS = fy.HALVES, fy.YEARS
REAL, SHAPES, COMBINED, N = ls.REAL, ls.SHAPES, ls.COMBINED, ls.N
KS = (1, 2, 3, 4, 5)
LAGSETS = tuple(s for k in KS for s in combinations(range(1, 6), k))
AT = 139  # AT_90 over 168 cells (6zzb to 6zzh)


def name(s):
    return "LC_" + "".join(map(str, s))


RULES = ("AT_90",) + tuple(name(s) for s in LAGSETS)


def years_of(scored_half, lags):
    """Learning years for a lag set: ascending, from the other half."""
    if scored_half == "L":
        return tuple(sorted(2010 - g for g in lags))
    return tuple(sorted(2009 + g for g in lags))


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
    for s in LAGSETS:
        cm = ly.learned(p, years_of(hn, s), shape)[0]
        hm = [ls.interp(cm, d) * x for d, x in enumerate(hc)]
        runs[name(s)] = (pt.target(hm, cap, HOTEL), hm)
    for g, (TT, cc) in runs.items():
        taus = [sb.tau_of(1.0 / x) for x in sb.ratios(h, cc, N)]
        km, dark, days = sb.run(h, TT, cc, a, taus, ones, cap, HOTEL)
        out[g] = (km, dark - idle_dark, days)
    return key, out


def evaluate(points=bt.PTS, shapes=SHAPES, procs=4):
    fy.prepare()
    keys = [(c, p, yr) + sh for p in points for yr in YEARS for c in PACKS for sh in shapes]
    with Pool(procs) as pool:
        res = pool.map(score, keys, chunksize=8)
    return dict(res)


def pooled(cells, points, shapes):
    """Dominance counts per rule over (shape, half, pack) cells pooled over the points."""
    n = dict.fromkeys(RULES, 0)
    for sh in shapes:
        for hn, yrs in HALVES.items():
            for c in PACKS:
                t = sb.total(cells, [(c, p, yr) + sh for p in points for yr in yrs])
                for g in RULES:
                    n[g] += sb.dominates(t, g)
    return n


def per_point(cells, points):
    n = dict.fromkeys(RULES, 0)
    for p in points:
        for hn, yrs in HALVES.items():
            for c in PACKS:
                t = sb.total(cells, [(c, p, yr) + REAL for yr in yrs])
                for g in RULES:
                    n[g] += sb.dominates(t, g)
    return n


def ranks(xs):
    """Average ranks (1-based), ties shared."""
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for m in range(i, j + 1):
            r[order[m]] = (i + j) / 2 + 1
        i = j + 1
    return r


def spearman(x, y):
    rx, ry = ranks(x), ranks(y)
    mx, my = st.fmean(rx), st.fmean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** 0.5
    return num / den if den else 0.0


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
    print("Milestone 6zzi: the learned seasonal correction on every k-subset of learning years, 2005 to 2014 (50 W)")
    print("lag g: scoring L learns from 2010 - g, scoring E from 2009 + g; LC_S = AT_90 on the climatology "
          "scaled by c_m learned on lag set S")
    print(f"high-amplitude points: {', '.join(hi)} ({len(hi)})")
    cols = tuple(tables)
    print("\nAT_90 (no correction): " + ", ".join(f"{c} {tables[c]['AT_90']}" for c in cols))
    print("\nPer lag set: dominance counts")
    print("  set        k  mean lag | " + " | ".join(f"{c:>7s}" for c in cols))
    for s in LAGSETS:
        g = name(s)
        print(f"  {g:10s} {len(s)}  {st.fmean(s):8.2f} | " + " | ".join(f"{tables[c][g]:7d}" for c in cols))

    print("\nPer k over its subsets: mean [min, max]; 6zzb's nearest set {1..k} and its rank (1 = best)")
    summ = {}
    for k in KS:
        sets = [s for s in LAGSETS if len(s) == k]
        near = name(tuple(range(1, k + 1)))
        parts = []
        for c in cols:
            v = [tables[c][name(s)] for s in sets]
            summ[(k, c)] = (st.fmean(v), min(v), max(v))
            rank = 1 + sum(x > tables[c][near] for x in v)
            parts.append(f"{st.fmean(v):6.1f} [{min(v):3d},{max(v):3d}] near {tables[c][near]:3d} r{rank}")
        print(f"  k={k} ({len(sets):2d} sets) | " + " | ".join(parts))

    singles = [(g,) for g in range(1, 6)]
    one = [tables["all168"][name(s)] for s in singles]
    rho1 = spearman([s[0] for s in singles], one)
    one_hi = [tables["hi168"][name(s)] for s in singles]
    rho1_hi = spearman([s[0] for s in singles], one_hi)
    sub = [s for s in LAGSETS if len(s) <= 4]
    dev = [tables["all168"][name(s)] - summ[(len(s), "all168")][0] for s in sub]
    rho_w = spearman([st.fmean(s) for s in sub], dev)
    dev_hi = [tables["hi168"][name(s)] - summ[(len(s), "hi168")][0] for s in sub]
    rho_w_hi = spearman([st.fmean(s) for s in sub], dev_hi)
    print("\nRecency (Spearman rho of count against lag; negative = recent years learn better)")
    print(f"  single years, all 168:            rho {rho1:+.3f}  counts by lag 1..5: {one}")
    print(f"  single years, high-amp 168:       rho {rho1_hi:+.3f}  counts by lag 1..5: {one_hi}")
    print(f"  within-k, k = 1 to 4 (30 sets), all 168:      rho {rho_w:+.3f}")
    print(f"  within-k, k = 1 to 4 (30 sets), high-amp 168: rho {rho_w_hi:+.3f}")

    near = {k: tables["all168"][name(tuple(range(1, k + 1)))] for k in KS}
    m = {k: summ[(k, "all168")][0] for k in KS}
    mh = {k: summ[(k, "hi168")][0] for k in KS}
    print("\nCheck: 6zzb's LC_k = nearest sets over 168 cells: "
          + " / ".join(str(near[k]) for k in (1, 2, 3, 5)) + " (6zzb: 97 / 116 / 142 / 158)")
    print("\nPredictions")
    mono = all(m[a] <= m[b] for a, b in zip(KS, KS[1:]))
    print(f"S1 subset-mean all-168 non-decreasing in k: {'held' if mono else 'refuted'} "
          f"({' / '.join(f'{m[k]:.1f}' for k in KS)})")
    print(f"S2 subset-mean LC_1 < {AT}: {'held' if m[1] < AT else 'refuted'} ({m[1]:.1f})")
    print(f"S3 subset-mean LC_3 >= {AT}: {'held' if m[3] >= AT else 'refuted'} ({m[3]:.1f})")
    mono_h = all(mh[a] <= mh[b] for a, b in zip(KS, KS[1:]))
    print(f"S4 subset-mean high-amp 168 non-decreasing in k: {'held' if mono_h else 'refuted'} "
          f"({' / '.join(f'{mh[k]:.1f}' for k in KS)})")
    span = max(one) - min(one)
    print(f"S5 single-year span >= 10: {'held' if span >= 10 else 'refuted'} ({span}: {min(one)} to {max(one)})")
    print(f"S6 single-year rho < 0: {'held' if rho1 < 0 else 'refuted'} ({rho1:+.3f})")
    print(f"S7 within-k rho < 0: {'held' if rho_w < 0 else 'refuted'} ({rho_w:+.3f})")
    inr = all(summ[(k, 'all168')][1] <= near[k] <= summ[(k, 'all168')][2] for k in KS)
    close = all(abs(near[k] - m[k]) <= 5 for k in (2, 3))
    print(f"S8 nearest within range for every k and within 5 of the mean at k = 2, 3: "
          f"{'held' if inr and close else 'refuted'} (k=2 {near[2]} vs {m[2]:.1f}; k=3 {near[3]} vs {m[3]:.1f})")


if __name__ == "__main__":
    main()
