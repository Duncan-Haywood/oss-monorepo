"""Milestone 6zzc: does shrinking each learned month toward the year's mean ratio let one year of log help?

Why: 6zzb's first "Next". 6zzb found that a month-by-month harvest / climatology correction learned from one
earlier year (LC_1) makes 6zw's adaptive rule worse than no correction (97 against AT_90's 139 of 168 pooled
cells; 4 against 8 on the real shape): a one-year monthly ratio carries about 4.4% of that year's weather, more
than the climatology's real seasonal error at most points (1.8% median). The textbook remedy is empirical-Bayes
shrinkage (James and Stein 1961; Efron and Morris 1973): pull each month's ratio toward a well-determined centre
by the share of its spread that is noise. If the noise can be estimated from the boat's own k years, the boat
keeps a month's correction only where it is larger than its noise, and one year should stop hurting.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, learning years per k, clamp and interpolation exactly as 6zzb
  (NASA POWER daily ALLSKY_SFC_SW_DWN 2005 to 2014 at the 30 points, climatology 2015 to 2024, halves E and L,
  50 W, packs 2.5 / 5 / 10 / 20 kWh, the real shape plus 6zz's 20 swept shapes, 168 pooled cells, k = 1, 2, 3, 5).
  Shrunk ratio, from the k learning years only (nothing from the scored half):
    for month m, H_m and C_m are the harvest and climatology sums over its days in the k years; r_m = H_m / C_m
    (6zzb's raw ratio before the clamp); c_bar = sum H / sum C over the whole k years.
    noise: residuals e_d = h_d - r_m hc_d; var(H_m) = f sum e_d^2 with f = (1 + rho) / (1 - rho), rho the lag-1
    autocorrelation of the residuals over consecutive days of each learning year, clipped to [0, 0.9]
    (the AR(1) variance inflation for a sum of correlated days); se_m^2 = var(H_m) / C_m^2.
    signal: tau^2 = max(0, mean_m (r_m - c_bar)^2 - mean_m se_m^2) (method of moments across the 12 months).
    weight w_m = tau^2 / (tau^2 + se_m^2) (0 when tau^2 = 0); c'_m = clamp(c_bar + w_m (r_m - c_bar)).
  Rules: B, AT_90 (uncorrected, as 6zzb), LC_k (6zzb's raw learned correction, rerun as a check: its counts
  must equal 6zzb's), LS_k (AT_90 on the shrunk-corrected climatology), LSP_k (PS's fixed tau on it).
  "Dominates B", the nine high-amplitude points and the per-point cells are 6zzb's.
  Calibration check (real shape): for each point, half and month, the k = 1 se_m of each of the half's five
  years against the standard deviation of the five single-year r_m; reported as the median of mean(se) / sd.
Predictions (priors in brackets):
  S1  LS_1 dominates B in at least 7 of the 8 real-shape pooled cells, all points (LC_1 4, AT_90 8). [55%]
  S2  LS_1 dominates in at least 139 of the 168 pooled cells (AT_90's count; LC_1 97). [55%]
  S3  LS_k's 168-cell count is at least LC_k's for every k in (1, 2, 3, 5). [60%]
  S4  On the real shape at the high-amplitude points, LS_1 dominates in at least as many of 8 as LC_1 (4). [55%]
  S5  LS_5's 168-cell count is within 5 of LC_5's (158). [70%]
  S6  The noise estimate is calibrated: the median mean(se) / sd lies in [0.67, 1.5]. [60%]
  S7  Over the 240 per-point real-shape cells, LS_1 dominates in at least as many as AT_90 (126). [50%]
  S8  LS_1's km / B is at least 1.0 in at least 150 of the 168 pooled cells (LC_1 153). [65%]
Descriptive: per k the dominance counts of every rule on every shape group; the median weight w_m and tau
  per k; per-point real-shape counts at all 30 and the nine points; real-shape per-cell km / B and ex / B.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_shrunk_season.py > experiments/results_shrunk_season.txt
(stdlib, deterministic; uses up to 4 processes)"""
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
import run_mean_seasonal_bias as ms  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_reserve_curve as rc  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE, PS = fy.PACKS, fy.HOTEL, fy.BASE, fy.PS
HALVES, YEARS = fy.HALVES, fy.YEARS
REAL, SHAPES, COMBINED, CLAMP, N = ls.REAL, ls.SHAPES, ls.COMBINED, ls.CLAMP, ls.N
KS = ly.KS
RHO_MAX = 0.9
RULES = (("AT_90",) + tuple(f"LC_{k}" for k in KS) + tuple(f"LS_{k}" for k in KS)
         + tuple(f"LSP_{k}" for k in KS))


def month_stats(p, years, shape):
    """Per month (H_m, C_m, sum e^2) over the years, and the pooled lag-1 residual autocorrelation."""
    H, C = [0.0] * 12, [0.0] * 12
    series = []
    for yr in years:
        h = fy._sun(p, yr)[1]
        hc = ls.scaled(p, yr, shape)[1]
        ms_ = [d.month - 1 for d in rc.dates(yr)]
        series.append((ms_, h, hc))
        for m, x, y in zip(ms_, h, hc):
            H[m] += x
            C[m] += y
    r = [x / y for x, y in zip(H, C)]
    E2 = [0.0] * 12
    num = den = 0.0
    for ms_, h, hc in series:
        e = [x - r[m] * y for m, x, y in zip(ms_, h, hc)]
        for m, v in zip(ms_, e):
            E2[m] += v * v
        mu = st.fmean(e)
        num += sum((a - mu) * (b - mu) for a, b in zip(e, e[1:]))
        den += sum((a - mu) ** 2 for a in e)
    rho = min(RHO_MAX, max(0.0, num / den)) if den > 0 else 0.0
    return H, C, E2, rho


@lru_cache(maxsize=None)
def shrunk(p, years, shape):
    """(12 clamped shrunk ratios, raw r_m, se_m, weights w_m, tau, c_bar)."""
    H, C, E2, rho = month_stats(p, years, shape)
    f = (1.0 + rho) / (1.0 - rho)
    r = [x / y for x, y in zip(H, C)]
    se2 = [f * e / (y * y) for e, y in zip(E2, C)]
    cbar = sum(H) / sum(C)
    tau2 = max(0.0, st.fmean([(x - cbar) ** 2 for x in r]) - st.fmean(se2))
    w = [tau2 / (tau2 + s) if tau2 > 0 else 0.0 for s in se2]
    cm = [min(CLAMP[1], max(CLAMP[0], cbar + wi * (x - cbar))) for wi, x in zip(w, r)]
    return tuple(cm), tuple(r), tuple(s ** 0.5 for s in se2), tuple(w), tau2 ** 0.5, cbar


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
    runs = {"AT_90": (T, hc, [sb.tau_of(1.0 / x) for x in sb.ratios(h, hc, N)])}
    hn = fy.half_of(yr)
    for k in KS:
        yrs = ly.learn_years(hn, k)
        for tag, cm in (("LC", ly.learned(p, yrs, shape)[0]), ("LS", shrunk(p, yrs, shape)[0])):
            hm = [ls.interp(cm, d) * x for d, x in enumerate(hc)]
            Tm = pt.target(hm, cap, HOTEL)
            runs[f"{tag}_{k}"] = (Tm, hm, [sb.tau_of(1.0 / x) for x in sb.ratios(h, hm, N)])
            if tag == "LS":
                runs[f"LSP_{k}"] = (Tm, hm, [PS[cap][1]] * len(h))
    for name, (TT, cc, taus) in runs.items():
        km, dark, days = sb.run(h, TT, cc, a, taus, ones, cap, HOTEL)
        out[name] = (km, dark - idle_dark, days)
    return key, out


def evaluate(points=bt.PTS, shapes=SHAPES, procs=4):
    fy.prepare()
    keys = [(c, p, yr) + sh for p in points for yr in YEARS for c in PACKS for sh in shapes]
    with Pool(procs) as pool:
        res = pool.map(score, keys, chunksize=8)
    return dict(res)


def counts(C, rules=RULES):
    return ly.counts(C, rules)


def per_point(cells, points):
    n = dict.fromkeys(RULES, 0)
    for p in points:
        for hn, yrs in HALVES.items():
            for c in PACKS:
                t = sb.total(cells, [(c, p, yr) + REAL for yr in yrs])
                for g in RULES:
                    n[g] += sb.dominates(t, g)
    return n


def calibration(points=bt.PTS):
    """Median over (point, half, month) of mean single-year se_m / sd of the five single-year r_m (real shape)."""
    out = []
    for p in points:
        for yrs in HALVES.values():
            per = [shrunk(p, (yr,), REAL) for yr in yrs]
            for m in range(12):
                sd = st.stdev([x[1][m] for x in per])
                if sd > 0:
                    out.append(st.fmean([x[2][m] for x in per]) / sd)
    return out


def main():
    cells = evaluate()
    C = ly.cells_of(cells)
    hi = ls.high_amp_points()
    CH = ly.cells_of(cells, hi)
    yn = lambda x: "y" if x else "n"  # noqa: E731
    print("Milestone 6zzc: empirical-Bayes shrinkage of the learned monthly correction, 2005 to 2014 (50 W)")
    print(f"climatology {fy.CLIM_YEARS[0]} to {fy.CLIM_YEARS[-1]} x s(d); learn on the k years of the other half "
          f"nearest the scored half, k in {KS}; clamp {CLAMP}; rho clipped to [0, {RHO_MAX}]")
    print(f"high-amplitude points (6zz A_hat > {ms.A_LINE}): {', '.join(hi)} ({len(hi)})")

    print("\nShrinkage on the real shape, per k: median over points and halves of tau, median w_m, "
          "median se_m")
    for k in KS:
        taus, ws, ses = [], [], []
        for p in bt.PTS:
            for hn in HALVES:
                cm, r, se, w, tau, cbar = shrunk(p, ly.learn_years(hn, k), REAL)
                taus.append(tau)
                ws += w
                ses += se
        print(f"  k={k}: tau {st.median(taus):.4f}  w {st.median(ws):.3f}  se {st.median(ses):.4f}  "
              f"tau = 0 in {sum(t == 0 for t in taus)} of {len(taus)}")
    print("  high-amplitude points:")
    for k in KS:
        taus, ws = [], []
        for p in hi:
            for hn in HALVES:
                _, _, _, w, tau, _ = shrunk(p, ly.learn_years(hn, k), REAL)
                taus.append(tau)
                ws += w
        print(f"  k={k}: tau {st.median(taus):.4f}  w {st.median(ws):.3f}")
    cal = calibration()
    q = st.quantiles(cal, n=4)
    print(f"\nNoise calibration (k = 1, real shape, {len(cal)} point-half-months): mean(se) / sd of single-year "
          f"ratios, median {st.median(cal):.3f}, quartiles {q[0]:.3f} {q[2]:.3f}")

    cnt, ch = counts(C), counts(CH)
    groups = {"real (of 8)": (REAL,), "flat s0 (of 32)": tuple(sh for sh in SHAPES if sh[1] == 0 and sh != REAL),
              "combined (of 128)": COMBINED, "all (of 168)": SHAPES}
    for label, cc in (("all 30 points", cnt), (f"high-amplitude points only ({len(hi)})", ch)):
        print(f"\nDominance counts, {label}")
        print("  group              | " + " | ".join(f"{g:>6s}" for g in RULES))
        for name, shs in groups.items():
            print(f"  {name:18s} | " + " | ".join(f"{sum(cc[sh][g] for sh in shs):6d}" for g in RULES))

    show = ("AT_90", "LC_1", "LS_1", "LS_2", "LS_3", "LS_5", "LSP_1")
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
    hr = {g: ch[REAL][g] for g in RULES}
    print("\nCheck: LC_k 168-cell counts " + " / ".join(str(tot[f'LC_{k}']) for k in KS)
          + " (6zzb: 97 / 116 / 142 / 158)")
    print("\nPredictions")
    print(f"S1 LS_1 >= 7 of 8 real shape, all points: {'held' if cnt[REAL]['LS_1'] >= 7 else 'refuted'} "
          f"({cnt[REAL]['LS_1']}; LC_1 {cnt[REAL]['LC_1']}, AT_90 {cnt[REAL]['AT_90']})")
    print(f"S2 LS_1 >= 139 of 168: {'held' if tot['LS_1'] >= 139 else 'refuted'} "
          f"({tot['LS_1']}; AT_90 {tot['AT_90']}, LC_1 {tot['LC_1']})")
    s3 = all(tot[f"LS_{k}"] >= tot[f"LC_{k}"] for k in KS)
    print(f"S3 LS_k >= LC_k on 168 for every k: {'held' if s3 else 'refuted'} ("
          + "; ".join(f"k={k} {tot[f'LS_{k}']} vs {tot[f'LC_{k}']}" for k in KS) + ")")
    print(f"S4 LS_1 >= LC_1 real shape, high-amplitude points: {'held' if hr['LS_1'] >= hr['LC_1'] else 'refuted'} "
          f"(LS_1 {hr['LS_1']}, LC_1 {hr['LC_1']}, AT_90 {hr['AT_90']} of 8)")
    print(f"S5 |LS_5 - LC_5| <= 5 on 168: {'held' if abs(tot['LS_5'] - tot['LC_5']) <= 5 else 'refuted'} "
          f"(LS_5 {tot['LS_5']}, LC_5 {tot['LC_5']})")
    mc = st.median(cal)
    print(f"S6 median mean(se) / sd in [0.67, 1.5]: {'held' if 0.67 <= mc <= 1.5 else 'refuted'} ({mc:.3f})")
    print(f"S7 LS_1 >= AT_90 over 240 per-point real-shape cells: "
          f"{'held' if pp_all['LS_1'] >= pp_all['AT_90'] else 'refuted'} (LS_1 {pp_all['LS_1']}, AT_90 {pp_all['AT_90']})")
    n8 = sum(x >= 1.0 for x in kmr["LS_1"])
    print(f"S8 LS_1 km/B >= 1.0 in >= 150 of 168: {'held' if n8 >= 150 else 'refuted'} ({n8}; "
          f"min {min(kmr['LS_1']):.4f})")


if __name__ == "__main__":
    main()
