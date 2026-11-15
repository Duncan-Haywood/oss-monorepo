"""Milestone 6zzh: does a REML estimate of the between-point variance tau^2 (heteroscedastic, precision-weighted),
or simply keeping a high-latitude boat's own one-year cosine, beat 6zzg's moment-estimated band pool HR_1?

Why: 6zzg's second and first "Next". 6zzg's unaligned band pool HR_1 (shrink each point's calendar-phase (a1, b1)
toward the leave-one-out band mean with w = tau^2 / (tau^2 + V), tau^2 by moments) was the best one-year rule in
the programme: 140 of 168 pooled cells (AT_90, no correction, 139), 97 of 168 at the nine high-amplitude points
and 140 of 240 per-point real-shape cells. Its aligned twin HB_1 lost (127 / 64 / 133), and 6zzg read the loss as
the moment estimate of tau_H over 9 to 11 points being too small at high latitude, so the band mean overrode each
point's own signal. The moment estimate weights every point equally although V differs between points (V is
larger at high latitude); the textbook fix for unequal V is REML on the model z_q ~ N(mu, tau^2 + V_q) with a
precision-weighted mean (Morris 1983, JASA 78:47-55, doi 10.1080/01621459.1983.10477920; the same estimator as
random-effects meta-analysis). The blunt alternative 6zzg's evidence also points to is to stop shrinking above 50
degrees altogether.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, learning years per k, clamp, interpolation, the harmonic fit (a0, a1, b1),
  its per-component sampling variance V, the three |latitude| bands, the alignment and the leave-one-out structure
  are exactly 6zzg's (run_hier_season). Everything uses the k learning years only; no scored year enters.
  REML tau^2 for a pool P (p's band, p included, as 6zzg's moment estimate included p): the two components x and y
  share tau^2; for c in (x, y), with u_q = 1 / (t + V_q) and mu_c(t) = sum u_q z_qc / sum u_q,
    l(t) = sum_c [ -1/2 sum_q log(t + V_q) - 1/2 sum_q u_q (z_qc - mu_c(t))^2 - 1/2 log sum_q u_q ],
  maximised over t >= 0 by a log grid (t = 0 and 10^-7 to 10^-1, 241 points) refined by golden section on the
  best bracket. Prior mean for p: the precision-weighted mean over P without p, weights 1 / (tau^2 + V_q).
  w = tau^2 / (tau^2 + V_p); (x', y') = m_p + w ((x, y) - m_p).
  Rules: B, AT_90; HR_k (6zzg's, rerun as a check: 140 / 149 / ... / 160 of 168); RR_k (band, calendar phase,
  REML); RB_k (band, hemisphere-aligned, REML); HX_k (HR_k at |latitude| < 50, the unshrunk fit, w = 1, at the
  high band: 6zzg's designer advice made a rule). "Dominates B", the nine high-amplitude points and the per-point
  cells are 6zzb's. 6zzg's caution stands: the swept shapes share a calendar-phase cosine, which favours calendar
  phase pools (HR, RR, HX) over RB; the real shape is the fair test of alignment.
Predictions (priors in brackets; 6zzg reference counts: AT_90 139, HR_1 140, HB_1 127 of 168; high-amplitude
  points HR_1 97, LHF_1 89; per-point real-shape HR_1 140, HB_1 133 of 240):
  R1  RR_1 dominates B in at least 140 of the 168 pooled cells (HR_1's count). [40%]
  R2  Over the 240 per-point real-shape cells RR_1 dominates in at least 140 (HR_1's count). [45%]
  R3  Over the 240 per-point real-shape cells RB_1 beats HB_1's 133 (REML repairs the aligned pool). [55%]
  R4  At the nine high-amplitude points HX_1 dominates in at least 97 of 168 (HR_1's count). [40%]
  R5  HX_1 dominates in at least 140 of 168 pooled cells. [35%]
  R6  On the real shape at k = 1, the aligned high band's REML tau exceeds its moment tau in both scored halves. [50%]
  R7  At k >= 2, RR_k is within 2 cells of HR_k over 168 in each of k = 2, 3, 5. [65%]
  R8  RR_1 dominates in 8 of the 8 real-shape pooled cells. [70%]
Descriptive: per k, half and band on the real shape the moment and REML tau (aligned and calendar) and median w;
  per k the dominance counts on every shape group, all points, high-amplitude points and each band; per-point
  counts; km / B over 168 cells.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_reml_season.py > experiments/results_reml_season.txt
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
import run_amp_shrink_season as am  # noqa: E402
import run_blend_transfer as bt  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_hier_season as hs  # noqa: E402
import run_lat_prior_season as lp  # noqa: E402
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
BANDS = lp.BANDS
TAGS = ("HR", "RR", "RB", "HX")
RULES = ("AT_90",) + tuple(f"{t}_{k}" for t in TAGS for k in KS)
GRID = (0.0,) + tuple(10.0 ** (-7.0 + 6.0 * i / 240.0) for i in range(241))


def reml_ll(t, zs, Vs):
    """Restricted log likelihood of tau^2 = t for components zs = [(x_q, y_q)], noise Vs = [V_q] (shared by x, y)."""
    if any(t + V <= 0 for V in Vs):
        return -math.inf
    u = [1.0 / (t + V) for V in Vs]
    su = sum(u)
    ll = 0.0
    for c in (0, 1):
        mu = sum(ui * z[c] for ui, z in zip(u, zs)) / su
        ll += -0.5 * sum(math.log(t + V) for V in Vs) - 0.5 * sum(ui * (z[c] - mu) ** 2 for ui, z in zip(u, zs))
        ll += -0.5 * math.log(su)
    return ll


def reml_tau2(zs, Vs):
    """argmax over t >= 0 of reml_ll: log grid, then golden section on the best bracket."""
    vals = [reml_ll(t, zs, Vs) for t in GRID]
    i = max(range(len(GRID)), key=vals.__getitem__)
    if i == 0 and vals[0] >= vals[1]:
        lo, hi = 0.0, GRID[1]
    else:
        lo, hi = GRID[max(0, i - 1)], GRID[min(len(GRID) - 1, i + 1)]
    g = (math.sqrt(5.0) - 1.0) / 2.0
    a, b = lo, hi
    c, d = b - g * (b - a), a + g * (b - a)
    for _ in range(80):
        if reml_ll(c, zs, Vs) >= reml_ll(d, zs, Vs):
            b = d
        else:
            a = c
        c, d = b - g * (b - a), a + g * (b - a)
    best = (a + b) / 2.0
    cands = [(reml_ll(t, zs, Vs), t) for t in (0.0, best, GRID[i])]
    return max(cands)[1]


@lru_cache(maxsize=None)
def reml_stats(pool, years, shape, aligned):
    """({q: (x, y, V)}, REML tau^2) for a pool."""
    xy, _ = hs.pool_stats(pool, years, shape, aligned)
    qs = list(pool)
    return xy, reml_tau2([(xy[q][0], xy[q][1]) for q in qs], [xy[q][2] for q in qs])


def wmean_loo(xy, p, t2):
    others = [v for q, v in xy.items() if q != p]
    u = [1.0 / (t2 + v[2]) for v in others]
    su = sum(u)
    return sum(ui * v[0] for ui, v in zip(u, others)) / su, sum(ui * v[1] for ui, v in zip(u, others)) / su


def reml_rule(p, years, shape, aligned):
    """((a0, a1', b1'), w, (mx, my)) for RR (aligned False) or RB (aligned True)."""
    (a0, a1, b1), V = am.fit(p, years, shape)
    xy, t2 = reml_stats(hs.pool_of(p, "HB"), years, shape, aligned)
    mx, my = wmean_loo(xy, p, t2)
    x, y, _ = xy[p]
    w = t2 / (t2 + V) if t2 > 0 else 0.0
    s = hs.sign(p) if aligned else 1.0
    return (a0, s * (mx + w * (x - mx)), s * (my + w * (y - my))), w, (mx, my)


@lru_cache(maxsize=None)
def corrections(p, years, shape):
    """{tag: (12 clamped month factors, w)} for HR, RR, RB and HX."""
    (a0, a1, b1), w, _ = hs.hier(p, years, shape, "HR")
    out = {"HR": (am.curve(a0, a1, b1, 1.0), w)}
    for tag, al in (("RR", False), ("RB", True)):
        (r0, r1, rb), wr, _ = reml_rule(p, years, shape, al)
        out[tag] = (am.curve(r0, r1, rb, 1.0), wr)
    if lp.band(p) == "high":
        (f0, f1, fb), _ = am.fit(p, years, shape)
        out["HX"] = (am.curve(f0, f1, fb, 1.0), 1.0)
    else:
        out["HX"] = out["HR"]
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


def band_pool(b):
    return tuple(q for q in bt.PTS if lp.band(q) == b)


def main():
    cells = evaluate()
    C = ly.cells_of(cells)
    hi = ls.high_amp_points()
    CH = ly.cells_of(cells, hi)
    yn = lambda x: "y" if x else "n"  # noqa: E731
    print("Milestone 6zzh: REML tau^2 for the band pool of the fitted yearly cosine, and an unshrunk high band, "
          "2005 to 2014 (50 W)")
    print(f"climatology {fy.CLIM_YEARS[0]} to {fy.CLIM_YEARS[-1]} x s(d); learn on the k years of the other half "
          f"nearest the scored half, k in {KS}; clamp {ls.CLAMP}")
    print(f"high-amplitude points: {', '.join(hi)} ({len(hi)})")

    print("\nReal shape: tau by moments (6zzg) and by REML, calendar (cal) and aligned (al), with median w")
    tau6 = {}
    for k in KS:
        for hn in HALVES:
            yrs = ly.learn_years(hn, k)
            parts = []
            for b in BANDS:
                pool = band_pool(b)
                m_c = hs.pool_stats(pool, yrs, REAL, False)[1] ** 0.5
                m_a = hs.pool_stats(pool, yrs, REAL, True)[1] ** 0.5
                r_c = reml_stats(pool, yrs, REAL, False)[1] ** 0.5
                r_a = reml_stats(pool, yrs, REAL, True)[1] ** 0.5
                if k == 1 and b == "high":
                    tau6[hn] = (m_a, r_a)
                wr = st.median(reml_rule(q, yrs, REAL, False)[1] for q in pool)
                wb = st.median(reml_rule(q, yrs, REAL, True)[1] for q in pool)
                wh = st.median(hs.hier(q, yrs, REAL, "HR")[1] for q in pool)
                parts.append(f"{b} cal mom {m_c:.4f} reml {r_c:.4f} | al mom {m_a:.4f} reml {r_a:.4f} | "
                             f"w HR {wh:.2f} RR {wr:.2f} RB {wb:.2f}")
            print(f"  k={k} {hn}:\n    " + "\n    ".join(parts))

    cnt, ch = ly.counts(C, RULES), ly.counts(CH, RULES)
    groups = {"real (of 8)": (REAL,), "flat s0 (of 32)": tuple(sh for sh in SHAPES if sh[1] == 0 and sh != REAL),
              "combined (of 128)": COMBINED, "all (of 168)": SHAPES}
    for label, cc in (("all 30 points", cnt), (f"high-amplitude points only ({len(hi)})", ch)):
        print(f"\nDominance counts, {label}")
        print("  group              | " + " | ".join(f"{g:>6s}" for g in RULES))
        for name, shs in groups.items():
            print(f"  {name:18s} | " + " | ".join(f"{sum(cc[sh][g] for sh in shs):6d}" for g in RULES))

    print("\nDominance counts over 168 pooled cells, each band's points only")
    print("  band | " + " | ".join(f"{g:>6s}" for g in RULES))
    for b in BANDS:
        cb = ly.counts(ly.cells_of(cells, band_pool(b)), RULES)
        print(f"  {b:4s} | " + " | ".join(f"{sum(cb[sh][g] for sh in SHAPES):6d}" for g in RULES))

    show = ("AT_90", "HR_1", "RR_1", "RB_1", "HX_1")
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
    pp_band = {b: per_point(cells, band_pool(b)) for b in BANDS}
    print("\nPer-point real-shape cells (point x half x pack, summed over the half's five years): dominance counts")
    print("  set                | " + " | ".join(f"{g:>6s}" for g in RULES))
    print("  all 30 (of 240)    | " + " | ".join(f"{pp_all[g]:6d}" for g in RULES))
    print(f"  high-amp (of {8 * len(hi):3d})  | " + " | ".join(f"{pp_hi[g]:6d}" for g in RULES))
    for b in BANDS:
        nb = 8 * len(band_pool(b))
        print(f"  {b:4s} band (of {nb:3d}) | " + " | ".join(f"{pp_band[b][g]:6d}" for g in RULES))

    kmr = {g: [C[sh + (hn, c)][g][0] / C[sh + (hn, c)][BASE][0] for sh in SHAPES for hn in HALVES for c in PACKS]
           for g in RULES}
    print("\nkm/B over the 168 pooled cells: n >= 1.0, min")
    for g in RULES:
        print(f"  {g:6s}: {sum(x >= 1.0 for x in kmr[g]):3d} {min(kmr[g]):.4f}")

    tot = {g: sum(cnt[sh][g] for sh in SHAPES) for g in RULES}
    tot_hi = {g: sum(ch[sh][g] for sh in SHAPES) for g in RULES}
    print("\nCheck: HR_k 168-cell counts " + " / ".join(str(tot[f'HR_{k}']) for k in KS)
          + " (6zzg: 140 / 149 / see results_hier_season.txt / 160); AT_90 " + str(tot["AT_90"]) + " (6zzg: 139)")
    hr = lambda ok: "held" if ok else "refuted"  # noqa: E731
    print("\nPredictions")
    print(f"R1 RR_1 >= 140 of 168: {hr(tot['RR_1'] >= 140)} (RR_1 {tot['RR_1']}, RB_1 {tot['RB_1']}, "
          f"HX_1 {tot['HX_1']}, HR_1 {tot['HR_1']}, AT_90 {tot['AT_90']})")
    print(f"R2 RR_1 >= 140 of 240 per-point real-shape cells: {hr(pp_all['RR_1'] >= 140)} "
          f"(RR_1 {pp_all['RR_1']}, RB_1 {pp_all['RB_1']}, HX_1 {pp_all['HX_1']}, HR_1 {pp_all['HR_1']}, "
          f"AT_90 {pp_all['AT_90']})")
    print(f"R3 RB_1 > 133 per-point real shape: {hr(pp_all['RB_1'] > 133)} ({pp_all['RB_1']})")
    print(f"R4 HX_1 >= 97 of 168 at high-amplitude points: {hr(tot_hi['HX_1'] >= 97)} "
          f"(HX_1 {tot_hi['HX_1']}, HR_1 {tot_hi['HR_1']}, RR_1 {tot_hi['RR_1']}, RB_1 {tot_hi['RB_1']}, "
          f"AT_90 {tot_hi['AT_90']})")
    print(f"R5 HX_1 >= 140 of 168: {hr(tot['HX_1'] >= 140)} ({tot['HX_1']})")
    r6 = all(tau6[hn][1] > tau6[hn][0] for hn in HALVES)
    print(f"R6 aligned high-band REML tau > moment tau at k = 1, both halves: {hr(r6)} ("
          + "; ".join(f"{hn} moment {tau6[hn][0]:.4f} REML {tau6[hn][1]:.4f}" for hn in HALVES) + ")")
    r7 = all(abs(tot[f"RR_{k}"] - tot[f"HR_{k}"]) <= 2 for k in KS if k >= 2)
    print(f"R7 |RR_k - HR_k| <= 2 for k >= 2: {hr(r7)} ("
          + ", ".join(f"k={k} {tot[f'RR_{k}']} vs {tot[f'HR_{k}']}" for k in KS if k >= 2) + ")")
    print(f"R8 RR_1 8 of 8 real shape: {hr(cnt[REAL]['RR_1'] == 8)} ({cnt[REAL]['RR_1']})")


if __name__ == "__main__":
    main()
