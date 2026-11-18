"""Milestone 6zze: does shrinking the fitted yearly cosine's own amplitude toward zero let one year of log help?

Why: 6zzd's first "Next". 6zzd's LHF_1 (AT_90 on the clamped first harmonic fitted to one year's 12 month ratios)
was the best one-year correction in the programme (126 of 168 pooled cells, 8 of 8 on the real shape, 134 of 240
per-point real-shape cells) but still trailed no correction over all 168 cells (AT_90 139). Its fitted amplitude
on the real shape had a median of 4.4% at k = 1 against 2.3% at k = 5: one year's weather inflates the cosine.
The remaining noise is in (a1, b1), so shrink them toward zero by their own sampling variance (empirical Bayes on
a two-vector; James and Stein 1961, Efron and Morris 1973), keeping the mean a0 unshrunk.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, learning years per k, clamp, interpolation, r_m and se_m exactly as
  6zzb / 6zzc / 6zzd (NASA POWER daily ALLSKY_SFC_SW_DWN 2005 to 2014 at the 30 points, climatology 2015 to 2024,
  halves E and L, 50 W, packs 2.5 / 5 / 10 / 20 kWh, the real shape plus 6zz's 20 swept shapes, 168 pooled cells,
  k = 1, 2, 3, 5). Everything below uses the k learning years only.
    (a0, a1, b1): 6zzd's OLS harmonic fit (run_harmonic_season.fit_harmonic).
    sampling variance per component, months treated as independent with 6zzc's AR(1)-inflated se_m:
      var(a1) = sum se_m^2 cos^2 theta_m / 36, var(b1) = sum se_m^2 sin^2 theta_m / 36; V = (var(a1) + var(b1)) / 2
      = sum se_m^2 / 72 (isotropic).
    LA_k  (per-fit prior): tau_A^2 = max(0, (a1^2 + b1^2) / 2 - V); w = tau_A^2 / (tau_A^2 + V) (0 if tau_A^2 = 0);
          g'_m = a0 + w (a1 cos theta_m + b1 sin theta_m); AT_90 on clamp(g'_m).
    LAP_k (pooled prior): the same, but tau_A^2 = max(0, mean over the 30 points of ((a1^2 + b1^2) / 2 - V)),
          pooled per (k, scored half, shape) across the 30 points' fits on their own learning years; each point
          keeps its own V. This is a fleet prior: it uses other points' learning years, never a scored year.
  Rules: B, AT_90 (uncorrected), LHF_k (6zzd's unshrunk harmonic, rerun as a check: its 168-cell counts must equal
  126 / 140 / 152 / 161), LA_k, LAP_k. "Dominates B", the nine high-amplitude points and the per-point cells are
  6zzb's.
Predictions (priors in brackets):
  A1  LA_1 dominates B in at least 126 of the 168 pooled cells (LHF_1's count). [35%]
  A2  LA_1 dominates in at least 139 of 168 (AT_90's count). [20%]
  A3  LA_1 dominates in 8 of the 8 real-shape pooled cells, all points (LHF_1 8, AT_90 8). [60%]
  A4  Over the 240 per-point real-shape cells, LA_1 dominates in at least 134 (LHF_1's count; AT_90 126). [50%]
  A5  LAP_1's 168-cell count is at least LA_1's. [60%]
  A6  LAP_1 dominates in at least 139 of 168. [30%]
  A7  At the nine high-amplitude points, LA_1 dominates in at most 89 of 168 (LHF_1's count): shrinking the
      amplitude costs where the real seasonal error is large. [65%]
  A8  LA_1's km / B is at least 1.0 in at least 158 of the 168 pooled cells (LHF_1 158). [55%]
  A9  Over the 240 per-point real-shape cells, LAP_1 dominates in at least 126 (AT_90's count). [55%]
Descriptive: per k the dominance counts of every rule on every shape group; on the real shape per k the median
  amplitude before and after shrinkage, the median w and the w = 0 count, for LA and LAP; per-point counts;
  real-shape per-cell km / B, ex / B.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_amp_shrink_season.py > experiments/results_amp_shrink_season.txt
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
import run_harmonic_season as hs  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_shrunk_season as ss  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE = fy.PACKS, fy.HOTEL, fy.BASE
HALVES, YEARS = fy.HALVES, fy.YEARS
REAL, SHAPES, COMBINED, N = ls.REAL, ls.SHAPES, ls.COMBINED, ls.N
KS = ly.KS
THETA = hs.THETA
TAGS = ("LHF", "LA", "LAP")
RULES = ("AT_90",) + tuple(f"{t}_{k}" for t in TAGS for k in KS)


@lru_cache(maxsize=None)
def fit(p, years, shape):
    """((a0, a1, b1), V): the harmonic fit to the k-year month ratios and its per-component sampling variance."""
    _, r, se, _, _, _ = ss.shrunk(p, years, shape)
    return hs.fit_harmonic(r), sum(s * s for s in se) / 72.0


def weight(a1, b1, V, tau2=None):
    """Empirical-Bayes weight on (a1, b1); tau2 None means the per-fit moment estimate."""
    if tau2 is None:
        tau2 = (a1 * a1 + b1 * b1) / 2.0 - V
    tau2 = max(0.0, tau2)
    return tau2 / (tau2 + V) if tau2 > 0 else 0.0


@lru_cache(maxsize=None)
def pooled_tau2(years, shape, points=bt.PTS):
    """Fleet prior variance of a harmonic component: mean over points of (A^2 / 2 - V), floored at 0."""
    vals = []
    for p in points:
        (_, a1, b1), V = fit(p, years, shape)
        vals.append((a1 * a1 + b1 * b1) / 2.0 - V)
    return max(0.0, st.fmean(vals))


def curve(a0, a1, b1, w):
    return tuple(hs.clamp(a0 + (w * a1) * math.cos(t) + (w * b1) * math.sin(t)) for t in THETA)


@lru_cache(maxsize=None)
def corrections(p, years, shape):
    """{tag: (12 clamped month factors, w)} for LHF, LA and LAP."""
    (a0, a1, b1), V = fit(p, years, shape)
    wa = weight(a1, b1, V)
    wp = weight(a1, b1, V, pooled_tau2(years, shape))
    return {"LHF": (curve(a0, a1, b1, 1.0), 1.0), "LA": (curve(a0, a1, b1, wa), wa),
            "LAP": (curve(a0, a1, b1, wp), wp)}


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
    print("Milestone 6zze: shrinking the fitted yearly cosine's amplitude toward zero by its sampling variance, "
          "2005 to 2014 (50 W)")
    print(f"climatology {fy.CLIM_YEARS[0]} to {fy.CLIM_YEARS[-1]} x s(d); learn on the k years of the other half "
          f"nearest the scored half, k in {KS}; clamp {ls.CLAMP}; rho clipped to [0, {ss.RHO_MAX}]")
    print(f"high-amplitude points: {', '.join(hi)} ({len(hi)})")

    for label, pts in (("all 30 points", bt.PTS), (f"high-amplitude points ({len(hi)})", hi)):
        print(f"\nAmplitude shrinkage on the real shape, {label}, per k: median fitted amplitude A = sqrt(a1^2 + b1^2)"
              " / a0, median sd of a component sqrt(V), and for LA and LAP the median w, median shrunk amplitude"
              " w A and the w = 0 count")
        for k in KS:
            amps, sds, rows = [], [], {"LA": ([], []), "LAP": ([], [])}
            for p in pts:
                for hn in HALVES:
                    yrs = ly.learn_years(hn, k)
                    (a0, a1, b1), V = fit(p, yrs, REAL)
                    A = math.hypot(a1, b1) / a0
                    amps.append(A)
                    sds.append(V ** 0.5)
                    cor = corrections(p, yrs, REAL)
                    for tag in rows:
                        rows[tag][0].append(cor[tag][1])
                        rows[tag][1].append(cor[tag][1] * A)
            parts = [f"{tag} w {st.median(ws):.3f} wA {st.median(wa):.4f} w=0 {sum(x == 0 for x in ws)}/{len(ws)}"
                     for tag, (ws, wa) in rows.items()]
            print(f"  k={k}: A {st.median(amps):.4f}  sqrt(V) {st.median(sds):.4f}  " + "  ".join(parts))

    print("\nFleet prior sd of a component sqrt(tau_A^2) per k and scored half, real shape: "
          + "; ".join(f"k={k} " + " ".join(f"{hn} {pooled_tau2(ly.learn_years(hn, k), REAL) ** 0.5:.4f}"
                                           for hn in HALVES) for k in KS))

    cnt, ch = ly.counts(C, RULES), ly.counts(CH, RULES)
    groups = {"real (of 8)": (REAL,), "flat s0 (of 32)": tuple(sh for sh in SHAPES if sh[1] == 0 and sh != REAL),
              "combined (of 128)": COMBINED, "all (of 168)": SHAPES}
    for label, cc in (("all 30 points", cnt), (f"high-amplitude points only ({len(hi)})", ch)):
        print(f"\nDominance counts, {label}")
        print("  group              | " + " | ".join(f"{g:>6s}" for g in RULES))
        for name, shs in groups.items():
            print(f"  {name:18s} | " + " | ".join(f"{sum(cc[sh][g] for sh in shs):6d}" for g in RULES))

    show = ("AT_90", "LHF_1", "LA_1", "LAP_1", "LA_2", "LAP_2")
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
    print("\nCheck: LHF_k 168-cell counts " + " / ".join(str(tot[f'LHF_{k}']) for k in KS)
          + " (6zzd: 126 / 140 / 152 / 161)")
    hr = lambda ok: "held" if ok else "refuted"  # noqa: E731
    print("\nPredictions")
    print(f"A1 LA_1 >= 126 of 168: {hr(tot['LA_1'] >= 126)} ({tot['LA_1']}; LHF_1 {tot['LHF_1']}, "
          f"AT_90 {tot['AT_90']})")
    print(f"A2 LA_1 >= 139 of 168: {hr(tot['LA_1'] >= 139)} ({tot['LA_1']})")
    print(f"A3 LA_1 8 of 8 real shape, all points: {hr(cnt[REAL]['LA_1'] == 8)} ({cnt[REAL]['LA_1']})")
    print(f"A4 LA_1 >= 134 of 240 per-point real-shape cells: {hr(pp_all['LA_1'] >= 134)} "
          f"(LA_1 {pp_all['LA_1']}, LHF_1 {pp_all['LHF_1']}, AT_90 {pp_all['AT_90']})")
    print(f"A5 LAP_1 >= LA_1 on 168: {hr(tot['LAP_1'] >= tot['LA_1'])} ({tot['LAP_1']} vs {tot['LA_1']})")
    print(f"A6 LAP_1 >= 139 of 168: {hr(tot['LAP_1'] >= 139)} ({tot['LAP_1']})")
    print(f"A7 LA_1 <= 89 of 168 at high-amplitude points: {hr(tot_hi['LA_1'] <= 89)} "
          f"(LA_1 {tot_hi['LA_1']}, LHF_1 {tot_hi['LHF_1']}, LAP_1 {tot_hi['LAP_1']}, AT_90 {tot_hi['AT_90']})")
    n8 = sum(x >= 1.0 for x in kmr["LA_1"])
    print(f"A8 LA_1 km/B >= 1.0 in >= 158 of 168: {hr(n8 >= 158)} ({n8}; min {min(kmr['LA_1']):.4f})")
    print(f"A9 LAP_1 >= 126 of 240 per-point real-shape cells: {hr(pp_all['LAP_1'] >= 126)} ({pp_all['LAP_1']})")


if __name__ == "__main__":
    main()
