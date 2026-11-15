"""Milestone 6zzj: do the one-year shrinkage rules of 6zze to 6zzh still match or beat no correction when the one
learning year is drawn from all five years of the other half, not only the year next to the scored half?

Why: 6zzi's first "Next". 6zzi scored the raw month-by-month correction LC on every subset of learning years and
found that lag 1 (the year next to the scored half, the only year 6zzc to 6zzh ever learned from) was the worst of
the five single years for LC (97 of 168 against a five-year mean of 121.8 and a best of 152). Every one-year verdict
against no correction (AT_90, 139 of 168) in 6zze to 6zzh therefore rests on one draw, and a draw that was bad for
LC. This milestone reruns the one-year rules on each of the five single years before the one-year shrinkage line is
written up as a paper result.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, clamp and dominance exactly as 6zzi (NASA POWER daily ALLSKY_SFC_SW_DWN
  2005 to 2014 at the 30 points, climatology 2015 to 2024, halves "E" 2005 to 2009 and "L" 2010 to 2014, 50 W,
  packs 2.5 / 5 / 10 / 20 kWh, the real shape plus 6zz's 20 swept shapes, 168 pooled cells, 240 per-point
  real-shape cells, 6zza's nine high-amplitude points). Lag g in {1..5}: scoring L learns from 2010 - g, scoring E
  from 2009 + g (6zzi's years_of). Every rule learns from that one year only; fleet and band pools use the same
  single year at every point (as 6zze to 6zzh did at lag 1). Rules per lag, unchanged from their milestones:
    LC_g  raw clamped month ratios (6zzb / 6zzi);
    LHF_g the unshrunk first harmonic (6zzd);
    LAP_g the harmonic shrunk toward zero with a fleet-pooled tau^2 (6zze);
    LB_g  the same with a per-|latitude|-band tau^2 (6zzf);
    HR_g  shrunk toward the leave-one-out band mean in calendar phase, moment tau^2 (6zzg);
    HX_g  HR_g below 50 degrees, the unshrunk fit in the high band (6zzh).
  Checks: LC_g reproduces 6zzi's single years 97 / 117 / 132 / 152 / 111; at lag 1 LHF 126, LAP 132, LB 133,
  HR 140, HX 140 of 168 reproduce 6zzd to 6zzh.
  Summaries per rule over the five lags: mean, min, max, the rank of lag 1 (1 = best); Spearman rho of each
  rule's per-lag 168-cell counts against LC's (do the rules suffer in the same years?).
Predictions (priors in brackets; AT_90 139 of 168, 25 of 168 at the high-amplitude points, 126 of 240 per-point):
  J1  The five-lag mean of HX over 168 cells is at least 139 (no correction). [55%]
  J2  The five-lag mean of HR over 168 cells is at least 139. [55%]
  J3  Every shrinkage rule (LAP, LB, HR, HX) spans fewer cells over the five lags than LC's 55. [80%]
  J4  Lag 1 is not the best lag for HX nor for HR over 168 cells (rank >= 2 of 5 for both). [70%]
  J5  HX's worst lag over 168 cells scores at least 130. [45%]
  J6  At the high-amplitude points the five-lag mean of HX is at least LC's (6zzi: 81.0). [65%]
  J7  HX has the highest five-lag mean over 168 cells among LHF, LAP, LB, HR, HX (ties count as held). [35%]
  J8  Spearman rho of HX's per-lag 168-cell counts against LC's is positive. [60%]
  J9  Each of LHF, LAP, LB, HR, HX has a five-lag mean over 168 cells above LC's 121.8. [80%]
Descriptive: every rule x lag on all 168, real 8, high-amplitude 168, high-amplitude real 8 and per-point 240.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_single_year_rules.py > experiments/results_single_year_rules.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import statistics as st
import sys
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
import run_reml_season as rm  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_subset_years as su  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE, PS = fy.PACKS, fy.HOTEL, fy.BASE, fy.PS
HALVES, YEARS = fy.HALVES, fy.YEARS
REAL, SHAPES, N = ls.REAL, ls.SHAPES, ls.N
LAGS = (1, 2, 3, 4, 5)
TAGS = ("LC", "LHF", "LAP", "LB", "HR", "HX")
SHRINK = ("LAP", "LB", "HR", "HX")
RULES = ("AT_90",) + tuple(f"{t}_{g}" for t in TAGS for g in LAGS)
AT = 139
LC_6ZZI = (97, 117, 132, 152, 111)
LAG1_REF = {"LHF": 126, "LAP": 132, "LB": 133, "HR": 140, "HX": 140}
LC_HI_MEAN = 81.0


def factors(p, years, shape):
    """{tag: 12 clamped month factors} for every rule learned on the given years."""
    out = {"LC": ly.learned(p, years, shape)[0]}
    a = am.corrections(p, years, shape)
    out["LHF"], out["LAP"] = a["LHF"][0], a["LAP"][0]
    out["LB"] = lp.corrections(p, years, shape)["LB"][0]
    r = rm.corrections(p, years, shape)
    out["HR"], out["HX"] = r["HR"][0], r["HX"][0]
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
    a = PS[cap][0]
    ones = [1.0] * len(h)
    runs = {"AT_90": (T, hc)}
    hn = fy.half_of(yr)
    for g in LAGS:
        fac = factors(p, su.years_of(hn, (g,)), shape)
        for tag in TAGS:
            hm = [ls.interp(fac[tag], d) * x for d, x in enumerate(hc)]
            runs[f"{tag}_{g}"] = (pt.target(hm, cap, HOTEL), hm)
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
    """(mean, min, max, rank of lag 1 with 1 = best) over the five lags."""
    v = [table[f"{tag}_{g}"] for g in LAGS]
    return st.fmean(v), min(v), max(v), 1 + sum(x > v[0] for x in v)


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
    print("Milestone 6zzj: the one-year rules of 6zzb to 6zzh learned on each of the five single years, "
          "2005 to 2014 (50 W)")
    print("lag g: scoring L learns from 2010 - g, scoring E from 2009 + g; every pool uses the same single year")
    print(f"high-amplitude points: {', '.join(hi)} ({len(hi)})")
    print("\nAT_90 (no correction): " + ", ".join(f"{c} {tables[c]['AT_90']}" for c in cols))

    print("\nPer rule and lag: dominance counts")
    print("  rule     | " + " | ".join(f"{c:>7s}" for c in cols))
    for tag in TAGS:
        for g in LAGS:
            r = f"{tag}_{g}"
            print(f"  {r:8s} | " + " | ".join(f"{tables[c][r]:7d}" for c in cols))

    print("\nPer rule over the five lags: mean [min, max] and lag 1's rank (1 = best)")
    for tag in TAGS:
        parts = []
        for c in cols:
            m, lo, hi_, rk = summary(tables[c], tag)
            parts.append(f"{m:6.1f} [{lo:3d},{hi_:3d}] r{rk}")
        print(f"  {tag:4s} | " + " | ".join(parts))

    lc = [tables["all168"][f"LC_{g}"] for g in LAGS]
    print("\nSpearman rho of each rule's per-lag 168-cell counts against LC's (same bad years?)")
    for tag in TAGS[1:]:
        v = [tables["all168"][f"{tag}_{g}"] for g in LAGS]
        print(f"  {tag:4s} rho {su.spearman(lc, v):+.3f}  counts by lag 1..5: {v}")

    km = {}
    print("\nReal shape, all 30 points, km/B pooled over the 8 cells (half x pack): min / mean / max over lags")
    for tag in ("AT_90",) + TAGS:
        vals = []
        for g in (LAGS if tag != "AT_90" else (None,)):
            r = tag if g is None else f"{tag}_{g}"
            tot_r = tot_b = 0.0
            for yrs in HALVES.values():
                for c in PACKS:
                    t = sb.total(cells, [(c, p, yr) + REAL for p in bt.PTS for yr in yrs])
                    tot_r += t[r][0]
                    tot_b += t[BASE][0]
            vals.append(tot_r / tot_b)
        km[tag] = vals
        print(f"  {tag:5s}: {min(vals):.4f} / {st.fmean(vals):.4f} / {max(vals):.4f}")

    a = tables["all168"]
    h = tables["hi168"]
    print("\nCheck: LC by lag " + " / ".join(str(x) for x in lc) + " (6zzi: 97 / 117 / 132 / 152 / 111); lag 1 "
          + ", ".join(f"{t} {a[f'{t}_1']} ({LAG1_REF[t]})" for t in LAG1_REF) + f"; AT_90 {a['AT_90']} ({AT})")
    hr = lambda ok: "held" if ok else "refuted"  # noqa: E731
    m = {t: summary(a, t) for t in TAGS}
    mh = {t: summary(h, t) for t in TAGS}
    print("\nPredictions")
    print(f"J1 HX five-lag mean >= {AT}: {hr(m['HX'][0] >= AT)} ({m['HX'][0]:.1f})")
    print(f"J2 HR five-lag mean >= {AT}: {hr(m['HR'][0] >= AT)} ({m['HR'][0]:.1f})")
    spans = {t: m[t][2] - m[t][1] for t in TAGS}
    print(f"J3 every shrinkage span < LC's: {hr(all(spans[t] < spans['LC'] for t in SHRINK))} ("
          + ", ".join(f"{t} {spans[t]}" for t in TAGS) + ")")
    print(f"J4 lag 1 not best for HX nor HR: {hr(m['HX'][3] >= 2 and m['HR'][3] >= 2)} "
          f"(HX rank {m['HX'][3]}, HR rank {m['HR'][3]})")
    print(f"J5 HX worst lag >= 130: {hr(m['HX'][1] >= 130)} ({m['HX'][1]})")
    print(f"J6 HX high-amp five-lag mean >= {LC_HI_MEAN}: {hr(mh['HX'][0] >= LC_HI_MEAN)} "
          f"(HX {mh['HX'][0]:.1f}, LC {mh['LC'][0]:.1f})")
    best = max(m[t][0] for t in TAGS[1:])
    print(f"J7 HX highest five-lag mean among the harmonic rules: {hr(m['HX'][0] >= best)} ("
          + ", ".join(f"{t} {m[t][0]:.1f}" for t in TAGS[1:]) + ")")
    hx = [a[f"HX_{g}"] for g in LAGS]
    rho = su.spearman(lc, hx)
    print(f"J8 rho(HX, LC) > 0: {hr(rho > 0)} ({rho:+.3f})")
    print(f"J9 every harmonic rule's mean > LC's {m['LC'][0]:.1f}: {hr(all(m[t][0] > m['LC'][0] for t in TAGS[1:]))}")


if __name__ == "__main__":
    main()
