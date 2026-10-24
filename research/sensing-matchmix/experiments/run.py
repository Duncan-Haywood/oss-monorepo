"""Sweeps for sensing-matchmix. Writes results.txt (stdout is the same text).

    PYTHONPATH=src python experiments/run.py
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from sensing_matchmix import MIXES, run_trial  # noqa: E402

SEEDS = 6
KEYS = ["clean_ba", "cauchy", "ri_cauchy", "g_cauchy", "g_ri", "recall", "lost", "cover"]


def _one(args):
    kw, s = args
    return run_trial(seed=s, **kw)


def row(pool, label, **kw):
    rs = pool.map(_one, [(kw, s) for s in range(SEEDS)])
    m = {k: float(np.nanmean([r[k] for r in rs])) for k in KEYS}
    return f"{label} " + " ".join(f"{m[k]:.4f}" for k in KEYS)


def main():
    from multiprocessing import Pool
    out = []
    p = out.append
    hdr = " ".join(KEYS) + "   (surface error in object radii; recall, lost, cover are fractions)"
    p(f"sensing-matchmix: bundle adjustment under measured SIFT mismatch mixes, {SEEDS} seeds per cell, 300 features. Synthetic rig, measured mixes.")
    p("Default cell: 12 views, 0.5 px noise, pose error 0.5 deg / 0.02 radii, 300 function evaluations, gate 2 px Sampson, vote 0.5.")
    p("Mix = (rate, along, near, far) from sensing-matchreal, injected into the sensing-epigate rig. cauchy/ri_cauchy: no gate (all-view / RANSAC start);")
    p("g_cauchy/g_ri: after the epipolar gate (all-view / RANSAC start). All scored on the same points.")
    with Pool(4) as pool:
        p("")
        p("== A. measured mixes (rate, along, near, far)")
        p("mix " + hdr)
        for name, (r, a, n, f) in MIXES.items():
            p(row(pool, name.replace(" ", "_"), mix=name) + f"   [{r:.3f} {a:.3f} {n:.3f} {f:.3f}]")
        p("")
        p("== B. rate sweep with the 'stereo 0.7' shares (0.623 along)")
        p("rate " + hdr)
        for r in [0.02, 0.06, 0.1, 0.2, 0.3]:
            p(row(pool, r, mix="stereo 0.7", rate=r))
        p("")
        p("== C. rate sweep with the 'homog none' shares (0.911 far)")
        p("rate " + hdr)
        for r in [0.02, 0.06, 0.1, 0.2, 0.3]:
            p(row(pool, r, mix="homog none", rate=r))
        p("")
        p("== D. views, 'stereo 0.8' mix")
        p("views " + hdr)
        for v in [8, 12, 24]:
            p(row(pool, v, mix="stereo 0.8", n_views=v))
    text = "\n".join(out)
    print(text)
    (HERE / "results.txt").write_text(text + "\n")


if __name__ == "__main__":
    main()
