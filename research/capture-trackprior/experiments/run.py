"""Write experiments/results.txt: a delay prior built from the camera's own earlier windows, on the 10 real clips.
Same design as capture-aliaswin/experiments/run.py (3 cameras, 12 windows over an hour, +-40 ppm drift, 0.8 s offset,
0 dB white noise, 12 seeds), 2 s windows, gamma 0.25. Every cell sees the same windows (rng per seed/camera/window)."""
import sys
from multiprocessing import Pool
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parents[2]
for p in ("capture-trackprior", "capture-aliaswin", "capture-residgate", "capture-syncgate", "capture-realedit", "capture-syncedit", "capture-realaudio", "capture-audiosync", "capture-edit"):
    sys.path.insert(0, str(root / p / "src"))
from capture_realaudio import available_clips  # noqa: E402
from capture_residgate.alias import dominant_period  # noqa: E402
from capture_aliaswin import pair_at, gcc_search, shares  # noqa: E402
from capture_trackprior import track_camera  # noqa: E402

SEEDS, N_WIN, N_CAM, SNR, TOL, WIN, GAMMA = 12, 12, 3, 0, 2.0, 2.0, 0.25
TIMES = np.linspace(0, 3600.0, N_WIN)
EVAL_FROM = 5          # windows 5..11 are scored in every cell, so cells with different bootstraps compare on the same windows
# (name, boot, cap as a fraction of the clip's period or None)
CELLS = [("none", 0, None), ("oracle10", 0, None)] + [("track", b, c) for b in (1, 3, 5) for c in (None, 0.45)]


def job(name):
    clip = available_clips()[name]
    period_ms, _ = dominant_period(clip)
    err = {c: [] for c in CELLS}          # (cell) -> list of per-camera arrays of errors in ms for windows EVAL_FROM..
    lost = {c: [] for c in CELLS}
    for s in range(SEEDS):
        for cam in range(N_CAM):
            r = np.random.default_rng([s, cam])
            true = 0.8 + r.uniform(-40, 40) * 1e-6 * TIMES
            wins = [pair_at(clip, np.random.default_rng([s, cam, k]), float(true[k]), WIN, SNR)[:2] for k in range(N_WIN)]
            for cell in CELLS:
                kind, boot, cap = cell
                if kind == "none":
                    est = np.array([gcc_search(a, b, GAMMA, 0.0, 1.5) for a, b in wins])
                elif kind == "oracle10":
                    est = np.array([gcc_search(a, b, GAMMA, float(true[k]), 0.01) for k, (a, b) in enumerate(wins)])
                else:
                    est, _, _ = track_camera(wins, TIMES, GAMMA, boot, None if cap is None else cap * period_ms * 1e-3)
                e = (est - true) * 1e3
                err[cell].append(e[EVAL_FROM:])
                lost[cell].append(bool((np.abs(e[EVAL_FROM:]) > TOL).all()))
    return name, period_ms, {c: np.concatenate(v) for c, v in err.items()}, {c: float(np.mean(v)) for c, v in lost.items()}


def label(cell):
    k, b, c = cell
    return k if k != "track" else "track boot=%d cap=%s" % (b, "none" if c is None else "%g*period" % c)


def main():
    names = sorted(available_clips())
    with Pool() as pool:
        rows = pool.map(job, names)
    n = SEEDS * N_CAM * (N_WIN - EVAL_FROM)
    L = ["0 dB white noise, 2 s windows, gamma 0.25, 0.8 s offset, +-40 ppm drift, %d scored windows per clip and cell" % n,
         "(%d seeds x %d cameras x windows %d..%d of %d, 327 s apart); wrong = |error| > %g ms." % (SEEDS, N_CAM, EVAL_FROM, N_WIN - 1, N_WIN, TOL),
         "none = +-1.5 s search every window. oracle10 = +-10 ms about the TRUE delay (a ceiling). track = prior from the camera's own earlier estimates.",
         "boot = windows searched without a prior first; cap = half-width cap as a share of the clip's autocorrelation period (clean clip, disclosed).",
         "", "A. clip period_ms cell ok alias gross"]
    for nm, p, e, _ in rows:
        for cell in CELLS:
            ok, al, gr = shares(e[cell], p, TOL)
            L.append("%s %.1f %s %.3f %.3f %.3f" % (nm, p, label(cell).replace(" ", "_"), ok, al, gr))
    bad = {"soft", "space2", "untie", "wallewal"}
    L += ["", "B. mean wrong share over the 10 clips, over the 4 failing clips (soft space2 untie wallewal), and over the 6 others;",
          "   and the share of cameras whose scored windows are ALL wrong (a lost lock)", "cell wrong_all wrong_4 wrong_6 lost_all lost_4"]
    for cell in CELLS:
        w = {nm: float((np.abs(e[cell]) > TOL).mean()) for nm, _, e, _ in rows}
        lo = {nm: l[cell] for nm, _, _, l in rows}
        L.append("%s %.3f %.3f %.3f %.3f %.3f" % (label(cell).replace(" ", "_"), np.mean(list(w.values())),
                 np.mean([w[k] for k in bad]), np.mean([w[k] for k in w if k not in bad]),
                 np.mean(list(lo.values())), np.mean([lo[k] for k in bad])))
    L += ["", "C. wrong share per clip: " + " ".join(label(c).replace(" ", "_") for c in CELLS)]
    for nm, _, e, _ in rows:
        L.append(nm + " " + " ".join("%.3f" % (np.abs(e[c]) > TOL).mean() for c in CELLS))
    Path(__file__).with_name("results.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
