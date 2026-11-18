"""Milestone 6zzl, exploratory (written after run_lag3_diagnosis.py had run; no predictions): does the
high-amplitude dominance count of each single learning year track the sign of its local-summer error?

For each lag g = 1..5 on the real shape at the nine high-amplitude points: the energy-weighted mean of
e_m = c_m(lag g) - c*_m over the local-summer months and over the rest of the year, averaged over points and
halves, next to 6zzi's hi168 count. With five lags this is a description, not a test.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_lag3_summer_sign.py > experiments/results_lag3_summer_sign.txt
(stdlib, deterministic, seconds)"""
import os
import statistics as st
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_fresh_years as fy  # noqa: E402
import run_lag3_diagnosis as dg  # noqa: E402
import run_learn_years as ly  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_subset_years as su  # noqa: E402


def season_error(points, g, inside=True):
    out = []
    for p in points:
        summer = dg.season_months(p, "summer")
        for hn in fy.HALVES:
            cs = ly.learned(p, fy.HALVES[hn], ls.REAL)[0]
            cg = ly.learned(p, su.years_of(hn, (g,)), ls.REAL)[0]
            w = dg.weights(p, hn, ls.REAL)
            ms = [m for m in range(1, 13) if (m in summer) == inside]
            out.append(sum(w[m - 1] * (cg[m - 1] - cs[m - 1]) for m in ms) / sum(w[m - 1] for m in ms))
    return st.fmean(out)


def main():
    fy.prepare()
    hi = ls.high_amp_points()
    print("Milestone 6zzl exploratory: signed error of each single learning year against the scored half's own "
          "ratios (real shape, energy-weighted, mean over 9 points x 2 halves)")
    print("  lag  hi168 (6zzi)  local summer e  rest of year e")
    rows = []
    for g in dg.LAGS:
        s, r = season_error(hi, g), season_error(hi, g, inside=False)
        rows.append((dg.CHECK[g], s))
        print(f"  {g:3d}  {dg.CHECK[g]:12d}  {s:+14.4f}  {r:+14.4f}")
    rho = su.spearman([c for c, _ in rows], [s for _, s in rows])
    print(f"Spearman rho(hi168, local-summer e) over the five lags: {rho:+.2f}")


if __name__ == "__main__":
    main()
