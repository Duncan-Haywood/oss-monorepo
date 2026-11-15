"""Milestone 6zzd: does shrinking each learned month toward a fitted first harmonic, not the flat mean, let one year of log help?

Why: 6zzc's first "Next". 6zzc's empirical-Bayes rule LS_1 shrank each one-year month ratio r_m toward the
year's mean ratio c_bar. On the real shape it tied no correction (7 against 8 real-shape pooled cells), but on
the swept shapes it still lost (110 against AT_90's 139 of 168) and at the nine high-amplitude points it cost
cells against the raw correction (61 against 77): a flat prior treats the seasonal error as twelve independent
draws and shrinks a real smooth cosine as hard as noise. The swept shapes multiply the climatology by
s(d) = s0 (1 + A cos(2 pi (d - phi) / 365.25)), so their ratio error is, to first order, one harmonic; the
real-shape error at high latitudes (6zz) is also seasonal. Shrinking toward a fitted first harmonic g_m keeps
three parameters of smooth seasonal error and drops the month-to-month noise around it (Efron and Morris 1973
shrink toward a regression fit; the same structure).

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, learning years per k, clamp and interpolation exactly as 6zzb / 6zzc
  (NASA POWER daily ALLSKY_SFC_SW_DWN 2005 to 2014 at the 30 points, climatology 2015 to 2024, halves E and L,
  50 W, packs 2.5 / 5 / 10 / 20 kWh, the real shape plus 6zz's 20 swept shapes, 168 pooled cells, k = 1, 2, 3, 5).
  From the k learning years only (nothing from the scored half), with r_m and se_m exactly as 6zzc
  (raw month ratio; AR(1)-inflated standard error):
    harmonic: theta_m = 2 pi (m + 0.5) / 12; g_m = a0 + a1 cos theta_m + b1 sin theta_m, fitted to the 12 r_m by
      ordinary least squares (the columns are orthogonal on 12 equally spaced months, so a0 = mean r_m,
      a1 = (1/6) sum r_m cos theta_m, b1 = (1/6) sum r_m sin theta_m).
    signal: tau^2 = max(0, sum_m (r_m - g_m)^2 / (12 - 3) - mean_m se_m^2) (method of moments, three fitted
      parameters).
    weight w_m = tau^2 / (tau^2 + se_m^2) (0 when tau^2 = 0); c'_m = clamp(g_m + w_m (r_m - g_m)).
  Rules: B, AT_90 (uncorrected), LC_k (6zzb's raw correction) and LS_k (6zzc's flat-prior shrinkage), both rerun
  as checks (their 168-cell counts must equal 97 / 116 / 142 / 158 and 110 / 128 / 144 / 154), LH_k (AT_90 on
  the harmonic-shrunk climatology) and LHF_k (AT_90 on the fitted harmonic alone, clamp(g_m): full shrinkage).
  "Dominates B", the nine high-amplitude points and the per-point cells are 6zzb's.
Predictions (priors in brackets):
  H1  LH_1 dominates B in at least 120 of the 168 pooled cells (LS_1 110). [55%]
  H2  LH_1 dominates in at least 139 of 168 (AT_90's count). [30%]
  H3  LH_1 dominates in at least 7 of the 8 real-shape pooled cells, all points (LS_1 7, AT_90 8). [60%]
  H4  At the nine high-amplitude points, LH_1 dominates in at least 77 of 168 (LC_1's count; LS_1 61). [55%]
  H5  LHF_1 dominates in at least 110 of 168 (LS_1's count). [50%]
  H6  LH_k's 168-cell count is at least LS_k's for every k in (1, 2, 3, 5). [50%]
  H7  LH_1's km / B is at least 1.0 in at least 150 of the 168 pooled cells (LS_1 161). [65%]
  H8  Over the 240 per-point real-shape cells, LH_1 dominates in at least as many as AT_90 (126). [50%]
Descriptive: per k the dominance counts of every rule on every shape group; the median tau, weight and fitted
  amplitude sqrt(a1^2 + b1^2) / a0 per k on the real shape; per-point counts; real-shape per-cell km / B, ex / B.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_harmonic_season.py > experiments/results_harmonic_season.txt
(stdlib, deterministic; uses up to 4 processes)"""
import math
import os
import statistics as st
import sys
from functools import lru_cache
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
import run_shrunk_season as ss  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE = fy.PACKS, fy.HOTEL, fy.BASE
HALVES, YEARS = fy.HALVES, fy.YEARS
REAL, SHAPES, COMBINED, CLAMP, N = ls.REAL, ls.SHAPES, ls.COMBINED, ls.CLAMP, ls.N
KS = ly.KS
TAGS = ("LC", "LS", "LH", "LHF")
RULES = ("AT_90",) + tuple(f"{t}_{k}" for t in TAGS for k in KS)
THETA = tuple(2.0 * math.pi * (m + 0.5) / 12 for m in range(12))


def fit_harmonic(r):
    """(a0, a1, b1) of the OLS first harmonic through 12 monthly values."""
    a0 = st.fmean(r)
    a1 = sum(x * math.cos(t) for x, t in zip(r, THETA)) / 6.0
    b1 = sum(x * math.sin(t) for x, t in zip(r, THETA)) / 6.0
    return a0, a1, b1


def clamp(x):
    return min(CLAMP[1], max(CLAMP[0], x))


@lru_cache(maxsize=None)
def harmonic(p, years, shape):
    """(12 clamped harmonic-shrunk ratios, 12 clamped harmonic ratios, w_m, tau, (a0, a1, b1))."""
    _, r, se, _, _, _ = ss.shrunk(p, years, shape)
    a0, a1, b1 = fit_harmonic(r)
    g = [a0 + a1 * math.cos(t) + b1 * math.sin(t) for t in THETA]
    se2 = [s * s for s in se]
    tau2 = max(0.0, sum((x - y) ** 2 for x, y in zip(r, g)) / (12 - 3) - st.fmean(se2))
    w = [tau2 / (tau2 + s) if tau2 > 0 else 0.0 for s in se2]
    cm = [clamp(y + wi * (x - y)) for wi, x, y in zip(w, r, g)]
    return tuple(cm), tuple(clamp(y) for y in g), tuple(w), tau2 ** 0.5, (a0, a1, b1)


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
        yrs = ly.learn_years(hn, k)
        hm_ = harmonic(p, yrs, shape)
        for tag, cm in (("LC", ly.learned(p, yrs, shape)[0]), ("LS", ss.shrunk(p, yrs, shape)[0]),
                        ("LH", hm_[0]), ("LHF", hm_[1])):
            hm = [ls.interp(cm, d) * x for d, x in enumerate(hc)]
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
    print("Milestone 6zzd: shrinking the learned monthly correction toward a fitted first harmonic, "
          "2005 to 2014 (50 W)")
    print(f"climatology {fy.CLIM_YEARS[0]} to {fy.CLIM_YEARS[-1]} x s(d); learn on the k years of the other half "
          f"nearest the scored half, k in {KS}; clamp {CLAMP}; rho clipped to [0, {ss.RHO_MAX}]")
    print(f"high-amplitude points: {', '.join(hi)} ({len(hi)})")

    for label, pts in (("all 30 points", bt.PTS), (f"high-amplitude points ({len(hi)})", hi)):
        print(f"\nHarmonic shrinkage on the real shape, {label}, per k: median tau, median w_m, "
              "median fitted amplitude A = sqrt(a1^2 + b1^2) / a0, tau = 0 count")
        for k in KS:
            taus, ws, amps = [], [], []
            for p in pts:
                for hn in HALVES:
                    _, _, w, tau, (a0, a1, b1) = harmonic(p, ly.learn_years(hn, k), REAL)
                    taus.append(tau)
                    ws += w
                    amps.append(math.hypot(a1, b1) / a0)
            print(f"  k={k}: tau {st.median(taus):.4f}  w {st.median(ws):.3f}  A {st.median(amps):.4f}  "
                  f"tau = 0 in {sum(t == 0 for t in taus)} of {len(taus)}")

    cnt, ch = ly.counts(C, RULES), ly.counts(CH, RULES)
    groups = {"real (of 8)": (REAL,), "flat s0 (of 32)": tuple(sh for sh in SHAPES if sh[1] == 0 and sh != REAL),
              "combined (of 128)": COMBINED, "all (of 168)": SHAPES}
    for label, cc in (("all 30 points", cnt), (f"high-amplitude points only ({len(hi)})", ch)):
        print(f"\nDominance counts, {label}")
        print("  group              | " + " | ".join(f"{g:>6s}" for g in RULES))
        for name, shs in groups.items():
            print(f"  {name:18s} | " + " | ".join(f"{sum(cc[sh][g] for sh in shs):6d}" for g in RULES))

    show = ("AT_90", "LC_1", "LS_1", "LH_1", "LHF_1", "LH_2", "LH_5")
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
    print("\nChecks: LC_k 168-cell counts " + " / ".join(str(tot[f'LC_{k}']) for k in KS)
          + " (6zzb: 97 / 116 / 142 / 158); LS_k " + " / ".join(str(tot[f'LS_{k}']) for k in KS)
          + " (6zzc: 110 / 128 / 144 / 154)")
    print("\nPredictions")
    print(f"H1 LH_1 >= 120 of 168: {'held' if tot['LH_1'] >= 120 else 'refuted'} "
          f"({tot['LH_1']}; LS_1 {tot['LS_1']}, AT_90 {tot['AT_90']})")
    print(f"H2 LH_1 >= 139 of 168: {'held' if tot['LH_1'] >= 139 else 'refuted'} ({tot['LH_1']})")
    print(f"H3 LH_1 >= 7 of 8 real shape, all points: {'held' if cnt[REAL]['LH_1'] >= 7 else 'refuted'} "
          f"({cnt[REAL]['LH_1']}; LS_1 {cnt[REAL]['LS_1']}, AT_90 {cnt[REAL]['AT_90']})")
    print(f"H4 LH_1 >= 77 of 168 at high-amplitude points: {'held' if tot_hi['LH_1'] >= 77 else 'refuted'} "
          f"(LH_1 {tot_hi['LH_1']}, LC_1 {tot_hi['LC_1']}, LS_1 {tot_hi['LS_1']}, AT_90 {tot_hi['AT_90']})")
    print(f"H5 LHF_1 >= 110 of 168: {'held' if tot['LHF_1'] >= 110 else 'refuted'} ({tot['LHF_1']})")
    h6 = all(tot[f"LH_{k}"] >= tot[f"LS_{k}"] for k in KS)
    print(f"H6 LH_k >= LS_k on 168 for every k: {'held' if h6 else 'refuted'} ("
          + "; ".join(f"k={k} {tot[f'LH_{k}']} vs {tot[f'LS_{k}']}" for k in KS) + ")")
    n7 = sum(x >= 1.0 for x in kmr["LH_1"])
    print(f"H7 LH_1 km/B >= 1.0 in >= 150 of 168: {'held' if n7 >= 150 else 'refuted'} ({n7}; "
          f"min {min(kmr['LH_1']):.4f})")
    print(f"H8 LH_1 >= AT_90 over 240 per-point real-shape cells: "
          f"{'held' if pp_all['LH_1'] >= pp_all['AT_90'] else 'refuted'} (LH_1 {pp_all['LH_1']}, AT_90 {pp_all['AT_90']})")


if __name__ == "__main__":
    main()
