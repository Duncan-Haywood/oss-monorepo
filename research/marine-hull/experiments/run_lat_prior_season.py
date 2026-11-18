"""Milestone 6zzf: does a latitude-dependent prior on the yearly cosine's amplitude keep 6zze's gain on ordinary water
and stop its loss at high latitude?

Why: 6zze's first "Next". 6zze shrank one year's fitted first harmonic (a1, b1) toward zero by empirical Bayes.
The fleet prior LAP_1 (one tau_A^2 pooled over all 30 points) reached 132 of 168 pooled cells (LA_1 130, LHF_1 126,
no correction AT_90 139) but cost at the nine high-amplitude points (LAP_1 54 of 168 against LHF_1's 89), because
the seasonal error grows with latitude (6zz) and one ocean-wide variance, set mostly by low-latitude points, shrinks
hardest exactly where the seasonal signal is largest. So let the prior variance depend on |latitude|.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, learning years per k, clamp, interpolation, r_m, se_m, the harmonic fit
  (a0, a1, b1) and its per-component sampling variance V are exactly 6zze's (run_amp_shrink_season.fit). For each
  point p and (k, scored half, shape) let d_p = (a1^2 + b1^2) / 2 - V, the per-fit moment estimate of the prior
  variance of a component (6zze). Everything uses the k learning years only; no scored year enters.
    LAP_k (6zze's fleet prior, rerun as a check: its 168-cell counts must equal 132 / 143 / 151 / 161):
          tau_A^2 = max(0, mean over the 30 points of d_p).
    LB_k  (banded prior): the same mean, but over the points in p's band of |latitude| only, three bands fixed by
          the grid: low |lat| <= 20 (11 points), mid 25 <= |lat| <= 42 (10 points), high |lat| >= 50 (9 points).
    LL_k  (continuous prior): OLS of d_p on |lat_p| over the 30 points, tau_A^2(p) = max(0, c0 + c1 |lat_p|).
  Each point keeps its own V; w = tau_A^2 / (tau_A^2 + V); g'_m = a0 + w (a1 cos theta_m + b1 sin theta_m); AT_90 on
  clamp(g'_m) (6zze's curve). Rules: B, AT_90, LAP_k, LB_k, LL_k. "Dominates B", the nine high-amplitude points and
  the per-point cells are 6zzb's.
Predictions (priors in brackets; 6zze reference counts: AT_90 139, LA_1 130, LAP_1 132 of 168; high-amplitude points
  LHF_1 89, LA_1 61, LAP_1 54 of 168; per-point real-shape LA_1 136, LAP_1 134, AT_90 126 of 240):
  F1  LB_1 dominates B in at least 132 of the 168 pooled cells (LAP_1's count). [55%]
  F2  LB_1 dominates in at least 139 of 168 (AT_90's count): one year of log finally helps over all cells. [20%]
  F3  At the nine high-amplitude points LB_1 dominates in more than 54 of 168 (LAP_1's count). [75%]
  F4  At the nine high-amplitude points LB_1 dominates in at least 75 of 168 (most of the way back to LHF_1's 89). [40%]
  F5  Over the 240 per-point real-shape cells LB_1 dominates in at least 136 (LA_1, the best one-year count). [40%]
  F6  LL_1 dominates in at least 132 of 168. [50%]
  F7  LB_1 dominates in 8 of the 8 real-shape pooled cells. [65%]
  F8  LB_2 dominates in at least 143 of 168 (LAP_2's count). [50%]
  F9  On the real shape at k = 1 the high band's prior sd exceeds the low band's in both scored halves. [85%]
Descriptive: per k and band the prior sd on the real shape; LL's fitted slope; per k the dominance counts of every
  rule on every shape group, all points and high-amplitude points; per-point counts; km / B over 168 cells.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_lat_prior_season.py > experiments/results_lat_prior_season.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import statistics as st
import sys
from functools import lru_cache
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_amp_shrink_season as am  # noqa: E402
import run_blend_transfer as bt  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE = fy.PACKS, fy.HOTEL, fy.BASE
HALVES, YEARS = fy.HALVES, fy.YEARS
REAL, SHAPES, COMBINED, N = ls.REAL, ls.SHAPES, ls.COMBINED, ls.N
KS = ly.KS
TAGS = ("LAP", "LB", "LL")
RULES = ("AT_90",) + tuple(f"{t}_{k}" for t in TAGS for k in KS)


def abslat(p):
    return abs(yp.lat_of(p))


def band(p):
    a = abslat(p)
    return "low" if a <= 20 else ("mid" if a <= 42 else "high")


BANDS = ("low", "mid", "high")


def excess(p, years, shape):
    """d_p = (a1^2 + b1^2) / 2 - V for one point's fit."""
    (_, a1, b1), V = am.fit(p, years, shape)
    return (a1 * a1 + b1 * b1) / 2.0 - V


@lru_cache(maxsize=None)
def band_tau2(years, shape, b, points=bt.PTS):
    return max(0.0, st.fmean([excess(p, years, shape) for p in points if band(p) == b]))


@lru_cache(maxsize=None)
def lat_line(years, shape, points=bt.PTS):
    """(c0, c1): OLS of d_p on |lat_p| over the points."""
    xs = [abslat(p) for p in points]
    ys = [excess(p, years, shape) for p in points]
    mx, my = st.fmean(xs), st.fmean(ys)
    c1 = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return my - c1 * mx, c1


def line_tau2(p, years, shape):
    c0, c1 = lat_line(years, shape)
    return max(0.0, c0 + c1 * abslat(p))


@lru_cache(maxsize=None)
def corrections(p, years, shape):
    """{tag: (12 clamped month factors, w)} for LAP, LB and LL."""
    (a0, a1, b1), V = am.fit(p, years, shape)
    out = {}
    for tag, t2 in (("LAP", am.pooled_tau2(years, shape)), ("LB", band_tau2(years, shape, band(p))),
                    ("LL", line_tau2(p, years, shape))):
        w = am.weight(a1, b1, V, t2)
        out[tag] = (am.curve(a0, a1, b1, w), w)
    return out


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
    a = fy.PS[cap][0]
    ones = [1.0] * len(h)
    runs = {"AT_90": (T, hc)}
    hn = fy.half_of(yr)
    for k in KS:
        cor = corrections(p, ly.learn_years(hn, k), shape)
        for tag in TAGS:
            hm = [ls.interp(cor[tag][0], d) * x for d, x in enumerate(hc)]
            runs[f"{tag}_{k}"] = (pt.target(hm, cap, HOTEL), hm)
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


def per_point(cells, points):
    n = dict.fromkeys(RULES, 0)
    for p in points:
        for yrs in HALVES.values():
            for c in PACKS:
                t = sb.total(cells, [(c, p, yr) + REAL for yr in yrs])
                for g in RULES:
                    n[g] += sb.dominates(t, g)
    return n


def main():
    cells = evaluate()
    C = ly.cells_of(cells)
    hi = ls.high_amp_points()
    CH = ly.cells_of(cells, hi)
    yn = lambda x: "y" if x else "n"  # noqa: E731
    print("Milestone 6zzf: a latitude-dependent prior on the fitted yearly cosine's amplitude, 2005 to 2014 (50 W)")
    print(f"climatology {fy.CLIM_YEARS[0]} to {fy.CLIM_YEARS[-1]} x s(d); learn on the k years of the other half "
          f"nearest the scored half, k in {KS}; clamp {ls.CLAMP}")
    print(f"high-amplitude points: {', '.join(hi)} ({len(hi)})")
    print("bands: " + "; ".join(f"{b} {', '.join(p for p in bt.PTS if band(p) == b)} "
                                f"({sum(band(p) == b for p in bt.PTS)})" for b in BANDS))

    print("\nPrior sd of a component on the real shape, per k and scored half: fleet (LAP), per band (LB), "
          "and LL's line c0 + c1 |lat| (c1 per degree)")
    for k in KS:
        for hn in HALVES:
            yrs = ly.learn_years(hn, k)
            c0, c1 = lat_line(yrs, REAL)
            bs = " ".join(f"{b} {band_tau2(yrs, REAL, b) ** 0.5:.4f}" for b in BANDS)
            print(f"  k={k} {hn}: fleet {am.pooled_tau2(yrs, REAL) ** 0.5:.4f}  {bs}  "
                  f"line c0 {c0:.6f} c1 {c1:.3e}  sd at 0 / 30 / 60 deg "
                  + " / ".join(f"{max(0.0, c0 + c1 * x) ** 0.5:.4f}" for x in (0, 30, 60)))

    print("\nMedian w on the real shape per k and band (LAP / LB / LL)")
    for k in KS:
        parts = []
        for b in BANDS:
            ws = {t: [] for t in TAGS}
            for p in bt.PTS:
                if band(p) != b:
                    continue
                for hn in HALVES:
                    cor = corrections(p, ly.learn_years(hn, k), REAL)
                    for t in TAGS:
                        ws[t].append(cor[t][1])
            parts.append(f"{b} " + " / ".join(f"{st.median(ws[t]):.3f}" for t in TAGS))
        print(f"  k={k}: " + "  ".join(parts))

    cnt, ch = ly.counts(C, RULES), ly.counts(CH, RULES)
    groups = {"real (of 8)": (REAL,), "flat s0 (of 32)": tuple(sh for sh in SHAPES if sh[1] == 0 and sh != REAL),
              "combined (of 128)": COMBINED, "all (of 168)": SHAPES}
    for label, cc in (("all 30 points", cnt), (f"high-amplitude points only ({len(hi)})", ch)):
        print(f"\nDominance counts, {label}")
        print("  group              | " + " | ".join(f"{g:>6s}" for g in RULES))
        for name, shs in groups.items():
            print(f"  {name:18s} | " + " | ".join(f"{sum(cc[sh][g] for sh in shs):6d}" for g in RULES))

    by_band = {}
    for b in BANDS:
        pts = tuple(p for p in bt.PTS if band(p) == b)
        cb = ly.counts(ly.cells_of(cells, pts), RULES)
        by_band[b] = {g: sum(cb[sh][g] for sh in SHAPES) for g in RULES}
    print("\nDominance counts over 168 pooled cells, each band's points only")
    print("  band | " + " | ".join(f"{g:>6s}" for g in RULES))
    for b in BANDS:
        print(f"  {b:4s} | " + " | ".join(f"{by_band[b][g]:6d}" for g in RULES))

    show = ("AT_90", "LAP_1", "LB_1", "LL_1", "LB_2")
    for label, CC in (("all 30 points", C), (f"high-amplitude points ({len(hi)})", CH)):
        print(f"\nReal shape, {label}, per pooled cell: km/B ex/B dominates")
        print("  half  kWh | " + " | ".join(f"{g:>6s} km/B ex/B d" for g in show))
        for hn in HALVES:
            for c in PACKS:
                t = CC[REAL + (hn, c)]
                bb = t[BASE]
                parts = [f"{t[g][0] / bb[0]:11.4f} {bt.ratio(t[g][1], bb[1]):4.2f} {yn(sb.dominates(t, g))}"
                         for g in show]
                print(f"  {hn:4s} {c / 1000:4.1f} | " + " | ".join(parts))

    pp_all, pp_hi = per_point(cells, bt.PTS), per_point(cells, hi)
    print("\nPer-point real-shape cells (point x half x pack, summed over the half's five years): dominance counts")
    print("  set                | " + " | ".join(f"{g:>6s}" for g in RULES))
    print("  all 30 (of 240)    | " + " | ".join(f"{pp_all[g]:6d}" for g in RULES))
    print(f"  high-amp (of {8 * len(hi):3d})  | " + " | ".join(f"{pp_hi[g]:6d}" for g in RULES))

    kmr = {g: [C[sh + (hn, c)][g][0] / C[sh + (hn, c)][BASE][0] for sh in SHAPES for hn in HALVES for c in PACKS]
           for g in RULES}
    print("\nkm/B over the 168 pooled cells: n >= 1.0, min")
    for g in RULES:
        print(f"  {g:6s}: {sum(x >= 1.0 for x in kmr[g]):3d} {min(kmr[g]):.4f}")

    tot = {g: sum(cnt[sh][g] for sh in SHAPES) for g in RULES}
    tot_hi = {g: sum(ch[sh][g] for sh in SHAPES) for g in RULES}
    print("\nCheck: LAP_k 168-cell counts " + " / ".join(str(tot[f'LAP_{k}']) for k in KS)
          + " (6zze: 132 / 143 / 151 / 161); AT_90 " + str(tot["AT_90"]) + " (6zze: 139)")
    hr = lambda ok: "held" if ok else "refuted"  # noqa: E731
    sd1 = {hn: {b: band_tau2(ly.learn_years(hn, 1), REAL, b) for b in BANDS} for hn in HALVES}
    f9 = all(sd1[hn]["high"] > sd1[hn]["low"] for hn in HALVES)
    print("\nPredictions")
    print(f"F1 LB_1 >= 132 of 168: {hr(tot['LB_1'] >= 132)} ({tot['LB_1']}; LAP_1 {tot['LAP_1']}, "
          f"AT_90 {tot['AT_90']})")
    print(f"F2 LB_1 >= 139 of 168: {hr(tot['LB_1'] >= 139)} ({tot['LB_1']})")
    print(f"F3 LB_1 > 54 of 168 at high-amplitude points: {hr(tot_hi['LB_1'] > 54)} "
          f"(LB_1 {tot_hi['LB_1']}, LL_1 {tot_hi['LL_1']}, LAP_1 {tot_hi['LAP_1']}, AT_90 {tot_hi['AT_90']})")
    print(f"F4 LB_1 >= 75 of 168 at high-amplitude points: {hr(tot_hi['LB_1'] >= 75)} ({tot_hi['LB_1']})")
    print(f"F5 LB_1 >= 136 of 240 per-point real-shape cells: {hr(pp_all['LB_1'] >= 136)} "
          f"(LB_1 {pp_all['LB_1']}, LL_1 {pp_all['LL_1']}, LAP_1 {pp_all['LAP_1']}, AT_90 {pp_all['AT_90']})")
    print(f"F6 LL_1 >= 132 of 168: {hr(tot['LL_1'] >= 132)} ({tot['LL_1']})")
    print(f"F7 LB_1 8 of 8 real shape: {hr(cnt[REAL]['LB_1'] == 8)} ({cnt[REAL]['LB_1']})")
    print(f"F8 LB_2 >= 143 of 168: {hr(tot['LB_2'] >= 143)} ({tot['LB_2']}; LAP_2 {tot['LAP_2']})")
    print(f"F9 high-band prior sd > low-band at k = 1, both halves: {hr(f9)} ("
          + "; ".join(f"{hn} high {sd1[hn]['high'] ** 0.5:.4f} low {sd1[hn]['low'] ** 0.5:.4f}" for hn in HALVES)
          + ")")


if __name__ == "__main__":
    main()
