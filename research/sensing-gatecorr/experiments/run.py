"""Sweeps for sensing-gatecorr. Writes results.txt (stdout is the same text).

    PYTHONPATH=src python experiments/run.py
"""
import sys
from pathlib import Path
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parents[1] / "sensing-gatemix" / "src"))
from sensing_gatecorr import correlated_mismatch, run_corr  # noqa: E402
from sensing_gatemix import measured_mixes  # noqa: E402

SEEDS = 12
SPANS = (1, 2, 4, 8, 12)
KEYS = ["clean_ba", "cauchy", "ri_cauchy", "g_tri", "g_linear", "g_cauchy", "recall", "lost", "cover"]


def _one(args):
    span, frac, s = args
    return run_corr(span, frac, seed=s)


def main():
    from multiprocessing import Pool
    mixes = measured_mixes()
    out = []
    p = out.append
    p(f"sensing-gatecorr: sensing-epigate's trial with each bad feature wrong by the same 10-40 px offset in `span` consecutive views, {SEEDS} seeds per cell.")
    p("Rig: 300 features, 12 views, 0.5 px noise, pose error 0.5 deg / 0.02 radii, gate 2 px Sampson, vote 0.5. Synthetic geometry. Overall rate = SIFT ratio-test rate measured by sensing-matchreal (stereo pair, no mutual check); span 1 is the independent case.")
    hdr = "span " + " ".join(KEYS) + "   (surface error in object radii; recall, lost, cover are fractions)"
    with Pool(4) as pool:
        for ratio in (0.8, 0.7, 0.6):
            rate, _ = mixes[("A", ratio, False)]
            p("")
            p(f"== ratio test {ratio}, overall wrong rate {rate:.3f}")
            p(hdr)
            for span in SPANS:
                rs = pool.map(_one, [(span, rate, s) for s in range(SEEDS)])
                m = {k: float(np.nanmean([r[k] for r in rs])) for k in KEYS}
                p(f"{span:4d} " + " ".join(f"{m[k]:.4f}" for k in KEYS))
    text = "\n".join(out)
    print(text)
    (HERE / "results.txt").write_text(text + "\n")


if __name__ == "__main__":
    main()
