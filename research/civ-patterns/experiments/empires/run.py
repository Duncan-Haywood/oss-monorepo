"""How long do states and empires last, 3400 BCE to 2024? Is the risk of ending constant with age
(Arbesman 2011), do bigger polities last longer, and what does that say about today's states?
Seshat Cliopatria v0.2.1 (CC BY 4.0), attribute table in data/.

    python3 experiments/empires/run.py

Writes experiments/empires/results.txt and current_polities.csv. Plan and hypotheses: LOG.md.
"""
import csv
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from civ_patterns import polities as P  # noqa: E402
from civ_patterns import survival as sv  # noqa: E402

BANDS = (0, 25, 50, 100, 200, 400, 800, 5000)


def arr(L, key="duration", ev="event"):
    return np.array([x[key] for x in L], float), np.array([x[ev] for x in L], int)


def weib_line(label, L, p):
    t, e = arr(L)
    fw = sv.fit_weibull(t, e)
    fe = sv.fit_weibull(t, e, shape=1.0)
    lo, hi = sv.shape_ci(fw)
    p(f"{label:34s} n={len(L):4d} ended={int(e.sum()):4d} KM median={sv.km_median(t, e):6.0f}y  "
      f"k={fw['k']:.3f} [{lo:.3f}, {hi:.3f}]  dAIC(exp-weib)={fe['aic'] - fw['aic']:+6.1f}")
    return fw


def hazard_table(L, p, bands=BANDS):
    t, e = arr(L)
    for a0, a1 in zip(bands[:-1], bands[1:]):
        ev = int(np.sum(e & (t >= a0) & (t < a1)))
        ex = float(np.clip(np.minimum(t, a1) - a0, 0, None).sum())
        p(f"  age {a0:4d}-{a1:<4d}: {ev:4d} ends / {ex:9.0f} polity-years = {1000 * ev / ex:6.2f} per 1000 years"
          f" (per-century risk {1 - np.exp(-100 * ev / ex):.2f})" if ex else f"  age {a0}-{a1}: no exposure")


def main():
    lines = []
    p = lines.append
    L_all = P.lifespans()
    named = [x for x in L_all if not x["name"].startswith("(")]
    L = [x for x in named if not x["left_truncated"]]
    p(f"Cliopatria v0.2.1: {len(L_all)} named polities; {len(L_all) - len(named)} parenthesised "
      f"umbrella names (e.g. '(Holy Roman Empire)', often duplicating a member) set aside; "
      f"{len(named) - len(L)} already present in 3400 BCE dropped; {len(L)} used, "
      f"{sum(x['event'] for x in L)} ended, {sum(1 - x['event'] for x in L)} still mapped in 2024. "
      f"{sum(x['returns_later'] for x in L)} reappear under the same name after a gap (only the first run counts).")
    p("Snapshot spacing (median years between mapped years, by era): " +
      ", ".join(f"{k}: {v[0]:.0f}" for k, v in P.spacing().items()))
    p("")
    p("## 1. Lifespan, and is the risk of ending constant with age? (k = 1: constant, k < 1: falls with age)")
    fw_all = weib_line("all", L, p)
    big = [x for x in L if x["peak_km2"] >= 1e6]
    weib_line("peak area >= 1 million km2", big, p)
    weib_line("started 1500 CE or later", [x for x in L if x["start"] >= 1500], p)
    weib_line("started before 1500 CE", [x for x in L if x["start"] < 1500], p)
    weib_line("whole named span (gaps included)",
              [dict(x, duration=x["span_all"], event=x["event_all"]) for x in L], p)
    p("Empirical hazard by age, all polities:")
    hazard_table(L, p)
    p("Empirical hazard by age, peak area >= 1 million km2:")
    hazard_table(big, p)
    t, e = arr(big)
    p(f"Peak >= 1M km2: mean observed duration {t.mean():.0f}y (Arbesman 2011, Taagepera's 41 empires: mean 220y), "
      f"median {np.median(t):.0f}y")
    p("")

    p("## 2. Do polities that start bigger last longer? (initial mapped area, so long life cannot inflate it)")
    eras = [e_ for e_ in P.ERAS]
    Ls = [x for x in L if x["area0_km2"] > 0]
    t, e = arr(Ls)
    la = np.log10([x["area0_km2"] for x in Ls])
    era_idx = np.array([[P.era_of(x["start"]) == f"{lo}..{hi}" for lo, hi in eras[1:]] for x in Ls], float)
    X = np.column_stack([la - la.mean(), era_idx])
    fw = sv.fit_weibull(t, e, X=X)
    se = np.sqrt(np.diag(fw["cov"]))
    b, s = fw["beta"][0], se[2]
    p(f"Weibull PH, n={len(Ls)}, covariates log10(initial area) + start era (base {eras[0]}): k={fw['k']:.3f}")
    p(f"  hazard ratio per tenfold initial area: {np.exp(b):.3f} [{np.exp(b - 1.96 * s):.3f}, {np.exp(b + 1.96 * s):.3f}]")
    for q_lo, q_hi in ((0, 25), (25, 50), (50, 75), (75, 100)):
        lo_, hi_ = np.percentile(la, [q_lo, q_hi])
        m = (la >= lo_) & (la <= hi_) if q_hi == 100 else (la >= lo_) & (la < hi_)
        p(f"  initial area quartile {q_lo:2d}-{q_hi:<3d} ({10 ** lo_:9.0f}-{10 ** hi_:10.0f} km2): n={m.sum():3d} "
          f"KM median {sv.km_median(t[m], e[m]):5.0f}y")
    p("")

    p("## 3. Median lifespan by the era a polity started in (Kaplan-Meier)")
    for lo, hi in eras:
        g = [x for x in L if lo <= x["start"] < hi]
        if not g:
            continue
        tt, ee = arr(g)
        sp = P.spacing().get(f"{lo}..{hi}", (float('nan'),))[0]
        p(f"  {lo:6d} to {hi:5d}: n={len(g):4d} KM median {sv.km_median(tt, ee):5.0f}y  "
          f"share > 200y {np.mean(tt > 200):.2f}  (snapshot spacing ~{sp:.0f}y)")
    p("")

    p("## 4. Backtest: polities mapped at a cutoff year; P(still under the same name 100 years later)")
    pooled = {"exponential": [], "weibull": [], "piecewise": []}
    Y = []
    for c in (1600, 1700, 1800, 1900):
        train = [dict(x, duration=min(x["end"], c) - x["start"], event=int(x["event"] and x["end"] <= c))
                 for x in L if x["start"] < c]
        test = [x for x in L if x["start"] < c < x["end"]]
        ages = np.array([c - x["start"] for x in test], float)
        y = np.array([1 if x["event"] and x["end"] <= c + 100 else 0 for x in test])
        t, e = arr(train)
        fe, fw = sv.fit_weibull(t, e, shape=1.0), sv.fit_weibull(t, e)
        ph = sv.PiecewiseHazard(BANDS).fit(t, e)
        pr = {"exponential": sv.prob_end_within(fe, ages, 100), "weibull": sv.prob_end_within(fw, ages, 100),
              "piecewise": ph.prob_end_within(ages, 100)}
        p(f"cutoff {c}: {len(test)} polities mapped, {y.sum()} gone by {c + 100} (base rate {y.mean():.2f}); "
          f"trained on {len(train)}")
        for k, v in pr.items():
            pooled[k].append(v)
            p(f"   {k:12s} Brier {sv.brier(v, y):.3f}  AUC {sv.auc(v, y):.3f}  mean forecast {v.mean():.2f}")
        Y.append(y)
    Y = np.concatenate(Y)
    Pp = {k: np.concatenate(v) for k, v in pooled.items()}
    for k, v in Pp.items():
        p(f"   pooled {k:12s} Brier {sv.brier(v, Y):.3f}  AUC {sv.auc(v, Y):.3f}")
    p("   (The exponential gives every polity at a cutoff the same forecast, so its pooled AUC only reflects the "
      "different forecasts across cutoffs; within a cutoff its AUC is 0.5 by construction, ties counting half.)")
    lo, hi = sv.bootstrap_diff(Pp["weibull"], Pp["exponential"], Y)
    p(f"   Brier(weibull) - Brier(exponential) {sv.brier(Pp['weibull'], Y) - sv.brier(Pp['exponential'], Y):+.4f} [{lo:+.4f}, {hi:+.4f}]")
    p("")

    p("## 5. Today's polities (mapped in 2024): P(still under the same name and continuous in 2124)")
    t, e = arr(L)
    ph = sv.PiecewiseHazard(BANDS).fit(t, e)
    alive = sorted([x for x in L if x["event"] == 0], key=lambda x: x["start"])
    ages = np.array([P.LAST + 1 - x["start"] for x in alive], float)
    pe = 1 - sv.prob_end_within(fw_all, ages, 100)
    pp = 1 - ph.prob_end_within(ages, 100)
    with open(HERE / "current_polities.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["name", "first_mapped", "age_2025", "p_same_in_2124_weibull", "p_same_in_2124_piecewise"])
        for x, a, q1, q2 in zip(alive, ages, pe, pp):
            w.writerow([x["name"], x["start"], int(a), round(float(q1), 3), round(float(q2), 3)])
    p(f"{len(alive)} polities; median age {np.median(ages):.0f}y; expected share still continuous in 2124: "
      f"{pe.mean():.2f} (weibull), {pp.mean():.2f} (piecewise). "
      f"Oldest five: " + "; ".join(f"{x['name']} ({x['start']})" for x in alive[:5]))
    p("Caveat: Cliopatria ends a polity whenever its name changes (e.g. 'Canada' starts in 1932, 'Republic of Iraq' "
      "in 2014), so these are probabilities that the mapped entity keeps its name and continuity, not that a "
      "country or people disappears.")
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
