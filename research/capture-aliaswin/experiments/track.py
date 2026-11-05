"""Write experiments/track.txt: a delay prior taken from the previous windows (no oracle) vs the oracle and none.
Same design as run.py (10 real clips, 0 dB white noise, 0.8 s offset, +-40 ppm over an hour, 12 windows per camera,
3 cameras, 12 seeds). Hypothesis written before the run: tracking with +-20 ms (more than the 13 ms the delay moves
between windows 327 s apart) lands between 'none' and the oracle; it fixes the clips whose first window is right and
cannot rescue a series whose first window is wrong, so its errors come in whole series, not scattered windows."""
import sys
from multiprocessing import Pool
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parents[2]
for p in ("capture-aliaswin", "capture-residgate", "capture-syncgate", "capture-realedit", "capture-syncedit", "capture-realaudio", "capture-audiosync", "capture-edit"):
    sys.path.insert(0, str(root / p / "src"))
from capture_realaudio import available_clips  # noqa: E402
from capture_aliaswin import pair_at, gcc_search, track_series  # noqa: E402

SEEDS, N_WIN, N_CAM, SNR, TOL, G = 12, 12, 3, 0, 2.0, 0.25
WINS = (2.0, 3.0)
HALF = (0.05, 0.02)
BAD = {"soft", "space2", "untie", "wallewal"}


def job(name):
    clip = available_clips()[name]
    out = {}
    for w in WINS:
        if len(clip) < (w + 1.0) * 16000:
            continue
        res = {"none": [], "oracle20": [], **{"track%g" % (h * 1e3): [] for h in HALF}}
        first = {"track%g" % (h * 1e3): [] for h in HALF}
        for s in range(SEEDS):
            rng = np.random.default_rng(s)
            times = np.linspace(0, 3600.0, N_WIN)
            for _ in range(N_CAM):
                true = 0.8 + rng.uniform(-40, 40) * 1e-6 * times
                wins = [pair_at(clip, rng, float(t), w, SNR)[:2] for t in true]
                res["none"] += [(gcc_search(a, b, G) - t) * 1e3 for (a, b), t in zip(wins, true)]
                res["oracle20"] += [(gcc_search(a, b, G, float(t), 0.02) - t) * 1e3 for (a, b), t in zip(wins, true)]
                for h in HALF:
                    k = "track%g" % (h * 1e3)
                    e = (track_series(wins, times, G, h) - true) * 1e3
                    res[k] += list(e)
                    first[k].append(abs(e[0]) > TOL)
        out[w] = ({k: np.abs(np.array(v)) > TOL for k, v in res.items()}, {k: float(np.mean(v)) for k, v in first.items()})
    return name, out


def main():
    names = sorted(available_clips())
    with Pool() as pool:
        rows = pool.map(job, names)
    keys = ["none", "oracle20"] + ["track%g" % (h * 1e3) for h in HALF]
    L = ["0 dB white noise, gamma %g, 36 series x 12 windows per clip (12 seeds x 3 cameras); wrong = |error| > %g ms." % (G, TOL),
         "track<h> = first window searched +-1.5 s, later windows +-h ms about a prediction from earlier ESTIMATES (no truth).", "",
         "A. clip window_s " + " ".join(keys) + "   (share of windows wrong)"]
    for n, out in rows:
        for w, (r, f) in out.items():
            L.append("%s %g " % (n, w) + " ".join("%.3f" % r[k].mean() for k in keys))
    L += ["", "B. mean over clips: window_s set " + " ".join(keys)]
    for w in WINS:
        for label, sel in (("all", lambda n: True), ("failing4", lambda n: n in BAD)):
            v = [[r[k].mean() for k in keys] for n, out in rows if w in out for r in [out[w][0]] if sel(n)]
            L.append("%g %s " % (w, label) + " ".join("%.3f" % x for x in np.mean(v, 0)))
    L += ["", "C. series wrongness (3 s and 2 s): share of series with >=1 wrong window, and with >=6 wrong, for track20; share of series whose FIRST window is wrong",
          "clip window_s any>=1 >=6 first_wrong"]
    for n, out in rows:
        for w, (r, f) in out.items():
            m = r["track20"].reshape(-1, N_WIN)
            L.append("%s %g %.3f %.3f %.3f" % (n, w, (m.sum(1) >= 1).mean(), (m.sum(1) >= 6).mean(), f["track20"]))
    Path(__file__).with_name("track.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
