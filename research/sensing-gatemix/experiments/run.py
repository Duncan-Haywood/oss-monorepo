"""Sweeps for sensing-gatemix. Writes results.txt (stdout is the same text).

    PYTHONPATH=src python experiments/run.py
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from sensing_gatemix import measured_mixes, run_mixed  # noqa: E402

SEEDS = 8
KEYS = ["clean_ba", "cauchy", "ri_cauchy", "g_tri", "g_linear", "g_cauchy", "recall", "lost", "cover"]
UNI = {"along": 0.0, "near": 0.0, "far": 1.0}
ALONG = {"along": 1.0, "near": 0.0, "far": 0.0}


def _one(args):
    shares, frac, s = args
    return run_mixed(shares, frac, seed=s)


def row(pool, label, shares, frac):
    rs = pool.map(_one, [(shares, frac, s) for s in range(SEEDS)])
    m = {k: float(np.nanmean([r[k] for r in rs])) for k in KEYS}
    return f"{label} " + " ".join(f"{m[k]:.4f}" for k in KEYS)


def main():
    from multiprocessing import Pool
    mixes = measured_mixes()
    out = []
    p = out.append
    hdr = " ".join(KEYS) + "   (surface error in object radii; recall, lost, cover are fractions)"
    p(f"sensing-gatemix: sensing-epigate's trial with the mismatch rate and mix measured by sensing-matchreal, {SEEDS} seeds per cell.")
    p("Rig: 300 features, 12 views, 0.5 px noise, pose error 0.5 deg / 0.02 radii, gate 2 px Sampson, vote 0.5. Synthetic geometry; only the mismatch rate and mix are measured.")
    p("Each cell: label = rate/along/near/far shares. measured = SIFT on the Middlebury pair; uniform = same rate, all random pixels (the earlier assumption); alongonly = same rate, all along-epipolar.")
    with Pool(4) as pool:
        for mutual in (False, True):
            p("")
            p(f"== {'M' if mutual else 'A'}. stereo-pair mixes, mutual check {mutual}; ratio test none, 0.9, 0.8, 0.7, 0.6")
            p("cell " + hdr)
            for ratio in (1.0, 0.9, 0.8, 0.7, 0.6):
                rate, sh = mixes[("A", ratio, mutual)]
                tag = f"r{ratio:.1f}/{rate:.3f}/{sh['along']:.2f}/{sh['near']:.2f}/{sh['far']:.2f}"
                p(row(pool, "measured " + tag, sh, rate))
                p(row(pool, "uniform  " + tag, UNI, rate))
                p(row(pool, "alongonly" + tag, ALONG, rate))
        p("")
        p("== B. warped-photograph mixes (pooled, no mutual check)")
        p("cell " + hdr)
        for ratio in (1.0, 0.8, 0.6):
            rate, sh = mixes[("B", ratio, False)]
            p(row(pool, f"measured r{ratio:.1f}/{rate:.3f}/{sh['along']:.2f}/{sh['near']:.2f}/{sh['far']:.2f}", sh, rate))
    text = "\n".join(out)
    print(text)
    (HERE / "results.txt").write_text(text + "\n")


if __name__ == "__main__":
    main()
