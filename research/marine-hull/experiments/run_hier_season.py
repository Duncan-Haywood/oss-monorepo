"""Milestone 6zzg: does pooling the fitted yearly cosine itself (a1, b1) within a latitude band, hemisphere-aligned,
let one year of the boat's log help where shrinking its amplitude toward zero could not?

Why: 6zzf's first "Next". 6zzf's banded prior LB_1 shrank one year's fitted first harmonic (a1, b1) toward ZERO with a
per-band prior variance: 133 of 168 pooled cells (AT_90, no correction, 139) and 65 of 168 at the nine high-amplitude
points (unshrunk LHF_1 89). 6zzf read the remaining loss as noise: at high latitude V is large, so even the right prior
variance leaves w near 0.6 and pulls a real seasonal swing toward zero. Shrinking toward zero is the wrong target when
the neighbours share the swing: the seasonal error at a given |latitude| should have a common phase once the
southern hemisphere is shifted by six months. So shrink each point's (a1, b1) toward its band's mean vector instead.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, learning years per k, clamp, interpolation, r_m, se_m, the harmonic fit
  (a0, a1, b1), its per-component sampling variance V and the three |latitude| bands are exactly 6zzf's
  (run_amp_shrink_season.fit, run_lat_prior_season.band). Hemisphere alignment: s_p = -1 for latitude < 0, else +1;
  aligned (x, y) = s_p (a1, b1), which is a six-month phase shift (cos and sin of theta + pi). Everything uses the k
  learning years only; no scored year enters. For a pool P (p's band, or all 30 points) and n = |P|:
    prior mean m_p = mean of the aligned (x, y) over P without p (leave-one-out, so p's own fit is not its prior);
    tau_H^2 = max(0, sum over q in P of ((x_q - xbar)^2 + (y_q - ybar)^2) / (2 (n - 1)) - mean over P of V_q),
      the between-point variance of a component around the pool mean, net of sampling noise;
    w = tau_H^2 / (tau_H^2 + V_p); (x', y') = m_p + w ((x, y) - m_p); (a1', b1') = s_p (x', y');
    g'_m = a0 + a1' cos theta_m + b1' sin theta_m; AT_90 on clamp(g'_m) (6zze's curve with w = 1).
  Rules: B, AT_90, LB_k (6zzf's, rerun as a check: 133 / 143 / 151 / 162 of 168), HB_k (pool = p's band, aligned),
  HF_k (pool = all 30 points, aligned), HR_k (pool = p's band, not aligned: calendar phase). "Dominates B", the nine
  high-amplitude points and the per-point cells are 6zzb's.
  Caution fixed in advance: the swept shapes scale every point's forecast by the same calendar-phase cosine, so on
  them the injected error is shared in calendar phase, which favours HR and penalises alignment where a band mixes
  hemispheres (the high band has 3 southern and 6 northern points; low and mid also mix). The real shape (8 pooled,
  240 per-point cells) is the fair test of the hemisphere hypothesis; the 168-cell totals are reported as before.
Predictions (priors in brackets; 6zzf reference counts: AT_90 139, LB_1 133, LAP_1 132, LHF_1 126 of 168;
  high-amplitude points LHF_1 89, LB_1 65 of 168; per-point real-shape LA_1 136, LB_1 135, AT_90 126 of 240):
  G1  HB_1 dominates B in at least 133 of the 168 pooled cells (LB_1's count). [45%]
  G2  HB_1 dominates in at least 139 of 168 (AT_90's count): one year of log finally helps over all cells. [20%]
  G3  At the nine high-amplitude points HB_1 dominates in more than 65 of 168 (LB_1's count). [55%]
  G4  Over the 240 per-point real-shape cells HB_1 dominates in at least 137 (above LA_1, the best one-year count). [40%]
  G5  HB_1 dominates in 8 of the 8 real-shape pooled cells. [65%]
  G6  Over the 240 per-point real-shape cells HB_1 beats HR_1 (alignment helps on the real shape). [60%]
  G7  Over the 240 per-point real-shape cells HB_1 beats HF_1 (bands matter once the phase is pooled). [55%]
  G8  On the real shape at k = 1, the leave-one-out band mean's amplitude in the high band exceeds the low band's
      in both scored halves (a shared high-latitude seasonal error exists). [70%]
  G9  HB_2 dominates in at least 143 of 168 (LB_2's count). [45%]
Descriptive: per k, half and band on the real shape the pool mean's amplitude and phase (aligned), tau_H and median w;
  per k the dominance counts of every rule on every shape group, all points, high-amplitude points and each band;
  per-point counts; km / B over 168 cells.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_hier_season.py > experiments/results_hier_season.txt
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
TAGS = ("LB", "HB", "HF", "HR")
RULES = ("AT_90",) + tuple(f"{t}_{k}" for t in TAGS for k in KS)


def sign(p):
    return -1.0 if yp.lat_of(p) < 0 else 1.0


def pool_of(p, tag, points=bt.PTS):
    """The points whose fits form p's prior (p included; the mean leaves it out)."""
    if tag == "HF":
        return tuple(points)
    return tuple(q for q in points if lp.band(q) == lp.band(p))


@lru_cache(maxsize=None)
def pool_stats(pool, years, shape, aligned):
    """({q: (x, y, V)}, tau_H^2) for a pool of points; (x, y) aligned by hemisphere when asked."""
    xy = {}
    for q in pool:
        (_, a1, b1), V = am.fit(q, years, shape)
        s = sign(q) if aligned else 1.0
        xy[q] = (s * a1, s * b1, V)
    n = len(pool)
    xb = st.fmean(v[0] for v in xy.values())
    yb = st.fmean(v[1] for v in xy.values())
    between = sum((v[0] - xb) ** 2 + (v[1] - yb) ** 2 for v in xy.values()) / (2.0 * (n - 1))
    return xy, max(0.0, between - st.fmean(v[2] for v in xy.values()))


def loo_mean(xy, p):
    others = [v for q, v in xy.items() if q != p]
    return st.fmean(v[0] for v in others), st.fmean(v[1] for v in others)


def hier(p, years, shape, tag):
    """((a0, a1', b1'), w, (mx, my)) for a hierarchical rule HB, HF or HR."""
    (a0, a1, b1), V = am.fit(p, years, shape)
    aligned = tag != "HR"
    xy, t2 = pool_stats(pool_of(p, tag), years, shape, aligned)
    mx, my = loo_mean(xy, p)
    x, y, _ = xy[p]
    w = t2 / (t2 + V) if t2 > 0 else 0.0
    s = sign(p) if aligned else 1.0
    return (a0, s * (mx + w * (x - mx)), s * (my + w * (y - my))), w, (mx, my)


@lru_cache(maxsize=None)
def corrections(p, years, shape):
    """{tag: (12 clamped month factors, w)} for LB, HB, HF and HR."""
    out = {"LB": lp.corrections(p, years, shape)["LB"]}
    for tag in ("HB", "HF", "HR"):
        (a0, a1, b1), w, _ = hier(p, years, shape, tag)
        out[tag] = (am.curve(a0, a1, b1, 1.0), w)
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


def band_mean_amp(years, shape, b):
    """Amplitude of the aligned band mean (all band points), as a fraction."""
    pool = tuple(q for q in bt.PTS if lp.band(q) == b)
    xy, _ = pool_stats(pool, years, shape, True)
    return math.hypot(st.fmean(v[0] for v in xy.values()), st.fmean(v[1] for v in xy.values()))


def main():
    cells = evaluate()
    C = ly.cells_of(cells)
    hi = ls.high_amp_points()
    CH = ly.cells_of(cells, hi)
    yn = lambda x: "y" if x else "n"  # noqa: E731
    print("Milestone 6zzg: pooling the fitted yearly cosine (a1, b1) within latitude bands, hemisphere-aligned, "
          "2005 to 2014 (50 W)")
    print(f"climatology {fy.CLIM_YEARS[0]} to {fy.CLIM_YEARS[-1]} x s(d); learn on the k years of the other half "
          f"nearest the scored half, k in {KS}; clamp {ls.CLAMP}")
    print(f"high-amplitude points: {', '.join(hi)} ({len(hi)})")
    print("bands: " + "; ".join(f"{b} {', '.join(p for p in bt.PTS if lp.band(p) == b)} "
                                f"({sum(lp.band(p) == b for p in bt.PTS)})" for b in BANDS))

    print("\nReal shape: aligned pool mean (amplitude, phase of peak in months from mid-January), tau_H and median w")
    for k in KS:
        for hn in HALVES:
            yrs = ly.learn_years(hn, k)
            parts = []
            for b, pool in [(b, tuple(q for q in bt.PTS if lp.band(q) == b)) for b in BANDS] + [("fleet", bt.PTS)]:
                xy, t2 = pool_stats(tuple(pool), yrs, REAL, True)
                mx = st.fmean(v[0] for v in xy.values())
                my = st.fmean(v[1] for v in xy.values())
                ph = (math.degrees(math.atan2(my, mx)) % 360) / 30.0
                tag = "HF" if b == "fleet" else "HB"
                ws = [hier(q, yrs, REAL, tag)[1] for q in pool]
                parts.append(f"{b} A {math.hypot(mx, my):.4f} ph {ph:4.1f} tau {t2 ** 0.5:.4f} w {st.median(ws):.2f}")
            print(f"  k={k} {hn}: " + " | ".join(parts))

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
        pts = tuple(p for p in bt.PTS if lp.band(p) == b)
        cb = ly.counts(ly.cells_of(cells, pts), RULES)
        print(f"  {b:4s} | " + " | ".join(f"{sum(cb[sh][g] for sh in SHAPES):6d}" for g in RULES))

    show = ("AT_90", "LB_1", "HB_1", "HF_1", "HR_1", "HB_2")
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
    pp_band = {b: per_point(cells, tuple(p for p in bt.PTS if lp.band(p) == b)) for b in BANDS}
    print("\nPer-point real-shape cells (point x half x pack, summed over the half's five years): dominance counts")
    print("  set                | " + " | ".join(f"{g:>6s}" for g in RULES))
    print("  all 30 (of 240)    | " + " | ".join(f"{pp_all[g]:6d}" for g in RULES))
    print(f"  high-amp (of {8 * len(hi):3d})  | " + " | ".join(f"{pp_hi[g]:6d}" for g in RULES))
    for b in BANDS:
        nb = 8 * sum(lp.band(p) == b for p in bt.PTS)
        print(f"  {b:4s} band (of {nb:3d}) | " + " | ".join(f"{pp_band[b][g]:6d}" for g in RULES))

    kmr = {g: [C[sh + (hn, c)][g][0] / C[sh + (hn, c)][BASE][0] for sh in SHAPES for hn in HALVES for c in PACKS]
           for g in RULES}
    print("\nkm/B over the 168 pooled cells: n >= 1.0, min")
    for g in RULES:
        print(f"  {g:6s}: {sum(x >= 1.0 for x in kmr[g]):3d} {min(kmr[g]):.4f}")

    tot = {g: sum(cnt[sh][g] for sh in SHAPES) for g in RULES}
    tot_hi = {g: sum(ch[sh][g] for sh in SHAPES) for g in RULES}
    print("\nCheck: LB_k 168-cell counts " + " / ".join(str(tot[f'LB_{k}']) for k in KS)
          + " (6zzf: 133 / 143 / 151 / 162); AT_90 " + str(tot["AT_90"]) + " (6zzf: 139)")
    hr = lambda ok: "held" if ok else "refuted"  # noqa: E731
    amp1 = {hn: {b: band_mean_amp(ly.learn_years(hn, 1), REAL, b) for b in BANDS} for hn in HALVES}
    g8 = all(amp1[hn]["high"] > amp1[hn]["low"] for hn in HALVES)
    print("\nPredictions")
    print(f"G1 HB_1 >= 133 of 168: {hr(tot['HB_1'] >= 133)} ({tot['HB_1']}; LB_1 {tot['LB_1']}, "
          f"HF_1 {tot['HF_1']}, HR_1 {tot['HR_1']}, AT_90 {tot['AT_90']})")
    print(f"G2 HB_1 >= 139 of 168: {hr(tot['HB_1'] >= 139)} ({tot['HB_1']})")
    print(f"G3 HB_1 > 65 of 168 at high-amplitude points: {hr(tot_hi['HB_1'] > 65)} "
          f"(HB_1 {tot_hi['HB_1']}, LB_1 {tot_hi['LB_1']}, HF_1 {tot_hi['HF_1']}, HR_1 {tot_hi['HR_1']}, "
          f"AT_90 {tot_hi['AT_90']})")
    print(f"G4 HB_1 >= 137 of 240 per-point real-shape cells: {hr(pp_all['HB_1'] >= 137)} "
          f"(HB_1 {pp_all['HB_1']}, LB_1 {pp_all['LB_1']}, HF_1 {pp_all['HF_1']}, HR_1 {pp_all['HR_1']}, "
          f"AT_90 {pp_all['AT_90']})")
    print(f"G5 HB_1 8 of 8 real shape: {hr(cnt[REAL]['HB_1'] == 8)} ({cnt[REAL]['HB_1']})")
    print(f"G6 HB_1 > HR_1 per-point real shape: {hr(pp_all['HB_1'] > pp_all['HR_1'])} "
          f"({pp_all['HB_1']} against {pp_all['HR_1']})")
    print(f"G7 HB_1 > HF_1 per-point real shape: {hr(pp_all['HB_1'] > pp_all['HF_1'])} "
          f"({pp_all['HB_1']} against {pp_all['HF_1']})")
    print(f"G8 high-band mean amplitude > low-band at k = 1, both halves: {hr(g8)} ("
          + "; ".join(f"{hn} high {amp1[hn]['high']:.4f} low {amp1[hn]['low']:.4f}" for hn in HALVES) + ")")
    print(f"G9 HB_2 >= 143 of 168: {hr(tot['HB_2'] >= 143)} ({tot['HB_2']}; LB_2 {tot['LB_2']})")


if __name__ == "__main__":
    main()
