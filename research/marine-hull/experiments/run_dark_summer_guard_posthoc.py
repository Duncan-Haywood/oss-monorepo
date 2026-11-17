"""Milestone 6zzp post hoc (written after run_dark_summer_guard.py was scored; no predictions): where does the dark
guard DG lose on the 30-point pool, and does gating it by latitude keep its high-amplitude gain?

The pre-registered run found DG lifts the nine high-amplitude points (hi168 mean over lags 81.0 -> 109.2) but lowers
the 30-point pool (all168 121.8 -> 106.0). Here, on the same cells and scoring:
  * failure modes (km only / dark only / both) of LC_g and DG_g on all168, and on the pool of the 21 points outside
    the high-amplitude set (oth168);
  * DGX_g: DG_g at points with |latitude| >= 50 degrees (6zzh's high band, where HX also switches rule), LC_g
    elsewhere; latitude is known to a deployed boat, but the 50-degree cut was chosen after seeing DG's result,
    so DGX is a hypothesis for a later out-of-sample test, not a validated rule.
Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_dark_summer_guard_posthoc.py > experiments/results_dark_summer_guard_posthoc.txt
(stdlib, deterministic; uses up to 4 processes)"""
import os
import statistics as st
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_blend_transfer as bt  # noqa: E402
import run_dark_summer_guard as dsg  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_summer_shift as ss  # noqa: E402
import run_year_pack as yp  # noqa: E402

LAGS, SHAPES, REAL, YEARS, PACKS = dsg.LAGS, dsg.SHAPES, dsg.REAL, dsg.YEARS, dsg.PACKS
TAGS = ("LC", "DG", "DGX")
RULES = ("AT_90",) + tuple(f"{t}_{g}" for t in TAGS for g in LAGS)
BAND = 50


def evaluate(points, procs=4):
    fy.prepare()
    keys = [(c, p, yr) + sh for p in points for yr in YEARS for c in PACKS for sh in SHAPES]
    with Pool(procs) as pool:
        res = pool.map(score, keys, chunksize=8)
    return dict(res)


def score(key):
    # dsg.score calls dsg.corrections; point it at this rule set for the worker
    orig = dsg.corrections
    dsg.corrections = corrections_from(orig)
    try:
        return dsg.score(key)
    finally:
        dsg.corrections = orig


def corrections_from(full_fn):
    def f(p, hn, shape):
        full = full_fn(p, hn, shape)
        out = {}
        for g in LAGS:
            out[f"LC_{g}"] = full[f"LC_{g}"]
            out[f"DG_{g}"] = full[f"DG_{g}"]
            out[f"DGX_{g}"] = full[f"DG_{g}"] if abs(yp.lat_of(p)) >= BAND else full[f"LC_{g}"]
        return out
    return f


def modes(cells, points, rule):
    """(km only, dark only, both) among pooled cells the rule does not dominate."""
    k = d = b = 0
    for sh in SHAPES:
        for hn, yrs in dsg.HALVES.items():
            for c in PACKS:
                t = dsg.sb.total(cells, [(c, p, yr) + sh for p in points for yr in yrs])
                fk, fd = t[rule][0] < t[dsg.BASE][0], t[rule][1] > t[dsg.BASE][1]
                k += fk and not fd
                d += fd and not fk
                b += fk and fd
    return k, d, b


def main():
    ss.RULES = RULES
    pts, hi = bt.PTS, ls.high_amp_points()
    oth = tuple(p for p in pts if p not in hi)
    cells = evaluate(pts)
    tab = {"all168": ss.pooled(cells, pts, SHAPES), "real8": ss.pooled(cells, pts, (REAL,)),
           "hi168": ss.pooled(cells, hi, SHAPES), "oth168": ss.pooled(cells, oth, SHAPES),
           "pp240": ss.per_point(cells, pts)}
    band = [p for p in pts if abs(yp.lat_of(p)) >= BAND]
    print("Milestone 6zzp post hoc (no predictions): DG's failure modes, and DG gated to |lat| >= 50 (DGX)")
    print(f"points with |lat| >= {BAND}: {', '.join(band)} ({len(band)}); high-amplitude: {', '.join(hi)}")
    print(f"other 21 points (oth168): {', '.join(oth)}")
    ok = all(tab["all168"][f"{t}_{g}"] == v for t, vs in (("LC", (97, 117, 132, 152, 111)),
                                                              ("DG", (89, 105, 136, 131, 69)))
             for g, v in zip(LAGS, vs))
    print("check: LC and DG all168 reproduce run_dark_summer_guard.py" + ("  ok" if ok else "  MISMATCH"))
    cols = ("all168", "real8", "hi168", "oth168", "pp240")
    print("\n  rule   | " + " | ".join(f"{c:>7s}" for c in cols))
    for g in RULES:
        print(f"  {g:6s} | " + " | ".join(f"{tab[c][g]:7d}" for c in cols))
    print("\nPer rule over the five lags: mean [min, max]")
    for t in TAGS:
        row = []
        for c in cols:
            xs = [tab[c][f"{t}_{g}"] for g in LAGS]
            row.append(f"{st.mean(xs):6.1f} [{min(xs):3d},{max(xs):3d}]")
        print(f"  {t:3s} | " + " | ".join(row))
    print("\nFailing cells by mode (km only / dark only / both)")
    for name, ps in (("all168", pts), ("oth168", oth)):
        for t in ("LC", "DG"):
            print(f"  {name} {t}: " + "; ".join("lag {} {}/{}/{}".format(g, *modes(cells, ps, f"{t}_{g}"))
                                                 for g in LAGS))
    print(f"  AT_90: all168 {'/'.join(map(str, modes(cells, pts, 'AT_90')))}, "
          f"oth168 {'/'.join(map(str, modes(cells, oth, 'AT_90')))}")


if __name__ == "__main__":
    main()
