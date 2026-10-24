"""Write experiments/diagnose.txt: where do wrong GCC delays land, relative to each clip's autocorrelation period?
Same design as run.py at 0 dB, gamma 0.25 (4 cameras, 12 windows of 2 s, +-40 ppm, 0.8 s offset, 12 seeds)."""
import sys
from multiprocessing import Pool
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parents[2]
for p in ("capture-residgate", "capture-syncgate", "capture-realedit", "capture-syncedit", "capture-realaudio", "capture-audiosync", "capture-edit"):
    sys.path.insert(0, str(root / p / "src"))
from capture_realaudio import available_clips, pair_from_clip  # noqa: E402
from capture_syncgate import gcc_psr  # noqa: E402
from capture_residgate.alias import dominant_period, classify  # noqa: E402

SEEDS, N_WIN, N_CAM, GAMMA, SNR, WIN, TOL_MS = 12, 12, 3, 0.25, 0, 2.0, 2.0


def job(name):
    clip = available_clips()[name]
    err = []
    for s in range(SEEDS):
        rng = np.random.default_rng(s)
        times = np.linspace(0, 3600.0, N_WIN)
        for _ in range(N_CAM):
            true = 0.8 + rng.uniform(-40, 40) * 1e-6 * times
            for tau in true:
                a, b = pair_from_clip(clip, rng, float(tau), WIN, SNR, "white")
                d, _ = gcc_psr(a, b, GAMMA, max_lag_s=WIN)
                err.append((d - tau) * 1e3)
    err = np.array(err)
    p, r = dominant_period(clip)
    ok, alias, gross = classify(err, p, TOL_MS)
    _, ctrl, _ = classify(err, p * 1.37, TOL_MS)      # control: a period that is not the clip's
    big = np.abs(err) > TOL_MS
    return name, p, r, float(np.median(np.abs(err)[~big])) if (~big).any() else float("nan"), ok, alias, gross, ctrl


def main():
    names = sorted(available_clips())
    with Pool() as pool:
        rows = pool.map(job, names)
    out = ["wrong = |delay error| over %g ms; alias = wrong and within 0.5 ms of k x period (k 1..8); gross = other wrong" % TOL_MS,
           "control = alias share if the period is replaced by 1.37 x period (what chance would give)",
           "0 dB white noise, gamma %g, %d windows per clip (%d seeds x %d cameras x %d windows)" % (GAMMA, SEEDS * N_CAM * N_WIN, SEEDS, N_CAM, N_WIN),
           "clip period_ms autocorr median_ok_err_ms ok alias gross control_alias"]
    for n, p, r, m, ok, al, gr, ct in rows:
        out.append("%s %.2f %.2f %.3f %.3f %.3f %.3f %.3f" % (n, p, r, m, ok, al, gr, ct))
    Path(__file__).with_name("diagnose.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
