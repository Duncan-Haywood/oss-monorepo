"""Write experiments/results.txt: window length x gamma x delay prior on the 10 real clips, 0 dB white noise.
Design as capture-residgate/experiments/diagnose.py (3 cameras, 12 windows over an hour, +-40 ppm, 0.8 s offset,
12 seeds); windows of 1, 2 and 3 s (shorter cannot hold the 0.8 s offset) and a 1.5 s delay search."""
import sys
from multiprocessing import Pool
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parents[2]
for p in ("capture-aliaswin", "capture-residgate", "capture-realaudio", "capture-audiosync"):
    sys.path.insert(0, str(root / p / "src"))
from capture_realaudio import available_clips  # noqa: E402
from capture_residgate.alias import dominant_period  # noqa: E402
from capture_aliaswin import pair_at, gcc_search, shares, start_bin  # noqa: E402

SEEDS, N_WIN, N_CAM, SNR, TOL = 12, 12, 3, 0, 2.0
WINS = (1.0, 2.0, 3.0)
GAMMAS = (0.0, 0.25, 0.5, 1.0)
PRIORS = (None, 0.05, 0.01)          # None = search +-1.5 s; else half-width in s around the true delay (oracle)
CELLS = [(w, g, None) for w in WINS for g in GAMMAS] + [(w, 0.25, h) for w in WINS for h in PRIORS[1:]]


def job(name):
    clip = available_clips()[name]
    out = {}
    for (w, g, h) in CELLS:
        err, bins = [], []
        for s in range(SEEDS):
            rng = np.random.default_rng(s)
            times = np.linspace(0, 3600.0, N_WIN)
            for _ in range(N_CAM):
                true = 0.8 + rng.uniform(-40, 40) * 1e-6 * times
                for tau in true:
                    a, b, st = pair_at(clip, rng, float(tau), w, SNR)
                    d = gcc_search(a, b, g, 0.0 if h is None else float(tau), 1.5 if h is None else h)
                    err.append((d - tau) * 1e3)
                    bins.append(start_bin(st))
        out[(w, g, h)] = (np.array(err), np.array(bins))
    p, r = dominant_period(clip)
    return name, p, r, out


def main():
    names = sorted(available_clips())
    with Pool() as pool:
        rows = pool.map(job, names)
    L = ["0 dB white noise, %d windows per clip and cell (%d seeds x %d cameras x %d windows); wrong = |error| > %g ms;"
         % (SEEDS * N_CAM * N_WIN, SEEDS, N_CAM, N_WIN, TOL),
         "alias = wrong and within 0.5 ms of k x the clip's autocorrelation period (k 1..8); gross = other wrong.",
         "prior 'none' = delay searched over +-1.5 s; a number = +-that many ms around the TRUE delay (oracle prior, a ceiling).",
         "", "A. clip window_s gamma prior_ms ok alias gross"]
    for n, p, r, out in rows:
        for (w, g, h), (e, _) in out.items():
            ok, al, gr = shares(e, p, TOL)
            L.append("%s %g %g %s %.3f %.3f %.3f" % (n, w, g, "none" if h is None else "%g" % (h * 1e3), ok, al, gr))
    L += ["", "B. mean wrong share over all 10 clips and over the 4 failing clips (soft space2 untie wallewal)",
          "window_s gamma prior_ms wrong_all wrong_4"]
    bad = {"soft", "space2", "untie", "wallewal"}
    for cell in CELLS:
        w, g, h = cell
        wa = [float((np.abs(o[cell][0]) > TOL).mean()) for _, _, _, o in rows]
        w4 = [float((np.abs(o[cell][0]) > TOL).mean()) for n, _, _, o in rows if n in bad]
        L.append("%g %g %s %.3f %.3f" % (w, g, "none" if h is None else "%g" % (h * 1e3), np.mean(wa), np.mean(w4)))
    L += ["", "C. wrong share by window start (s): first half second / 0.5 to 1 s / later; window 2 s, gamma 0.25, no prior",
          "clip n_first n_mid n_late wrong_first wrong_mid wrong_late"]
    for n, p, r, out in rows:
        e, b = out[(2.0, 0.25, None)]
        row = [int((b == k).sum()) for k in range(3)]
        sh = [("%.3f" % (np.abs(e[b == k]) > TOL).mean()) if (b == k).any() else "nan" for k in range(3)]
        L.append("%s %d %d %d %s" % (n, *row, " ".join(sh)))
    Path(__file__).with_name("results.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
