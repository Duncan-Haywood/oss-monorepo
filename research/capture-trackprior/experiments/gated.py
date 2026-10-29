"""Write experiments/gated.txt: gated tracking (re-acquire when the unrestricted peak beats the prior's by `ratio`).
Same windows as run.py (3 cameras, 12 windows over an hour, +-40 ppm, 0.8 s, 0 dB white noise, 12 seeds, 2 s, gamma 0.25)."""
import sys
from multiprocessing import Pool
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parents[2]
for p in ("capture-trackprior", "capture-aliaswin", "capture-residgate", "capture-syncgate", "capture-realedit", "capture-syncedit", "capture-realaudio", "capture-audiosync", "capture-edit"):
    sys.path.insert(0, str(root / p / "src"))
from capture_realaudio import available_clips  # noqa: E402
from capture_aliaswin import pair_at, gcc_search  # noqa: E402
from capture_trackprior import track_camera, track_gated  # noqa: E402

SEEDS, N_WIN, N_CAM, SNR, TOL, WIN, GAMMA = 12, 12, 3, 0, 2.0, 2.0, 0.25
TIMES = np.linspace(0, 3600.0, N_WIN)
EVAL_FROM = 5
CELLS = [("none", 0, 0)] + [("track", b, 0) for b in (1, 3)] + [("gated", b, r) for b in (1, 3) for r in (1.2, 1.5, 2.0, 3.0)]


def label(c):
    return {"none": "none", "track": "track_boot=%d" % c[1]}.get(c[0], "gated_boot=%d_ratio=%g" % (c[1], c[2]))


def job(name):
    clip = available_clips()[name]
    err = {c: [] for c in CELLS}; lost = {c: [] for c in CELLS}; re = {c: [] for c in CELLS}
    for s in range(SEEDS):
        for cam in range(N_CAM):
            r = np.random.default_rng([s, cam])
            true = 0.8 + r.uniform(-40, 40) * 1e-6 * TIMES
            wins = [pair_at(clip, np.random.default_rng([s, cam, k]), float(true[k]), WIN, SNR)[:2] for k in range(N_WIN)]
            for c in CELLS:
                kind, boot, ratio = c
                rr = np.zeros(N_WIN, bool)
                if kind == "none":
                    est = np.array([gcc_search(a, b, GAMMA, 0.0, 1.5) for a, b in wins])
                elif kind == "track":
                    est = track_camera(wins, TIMES, GAMMA, boot)[0]
                else:
                    est, rr = track_gated(wins, TIMES, GAMMA, boot, ratio)
                e = (est - true) * 1e3
                err[c].append(e[EVAL_FROM:]); re[c].append(rr[EVAL_FROM:])
                lost[c].append(bool((np.abs(e[EVAL_FROM:]) > TOL).all()))
    return (name, {c: np.concatenate(v) for c, v in err.items()}, {c: float(np.mean(v)) for c, v in lost.items()},
            {c: float(np.concatenate(v).mean()) for c, v in re.items()})


def main():
    names = sorted(available_clips())
    with Pool() as pool:
        rows = pool.map(job, names)
    bad = {"soft", "space2", "untie", "wallewal"}
    L = ["0 dB white noise, 2 s windows, gamma 0.25, scored windows 5..11 (%d per clip and cell); wrong = |error| > %g ms." % (SEEDS * N_CAM * (N_WIN - EVAL_FROM), TOL),
         "gated: search inside the tracked prior and over +-1.5 s; if the unrestricted peak > ratio x the in-prior peak, take it and restart the line.",
         "", "B. mean over clips: cell wrong_all wrong_4 wrong_6 lost_4 reacquired_4 reacquired_6   (4 = soft space2 untie wallewal)"]
    for c in CELLS:
        w = {n: float((np.abs(e[c]) > TOL).mean()) for n, e, _, _ in rows}
        g = [k for k in w if k in bad]; o = [k for k in w if k not in bad]
        lo = np.mean([l[c] for n, _, l, _ in rows if n in bad])
        r4 = np.mean([x[c] for n, _, _, x in rows if n in bad]); r6 = np.mean([x[c] for n, _, _, x in rows if n not in bad])
        L.append("%s %.3f %.3f %.3f %.3f %.3f %.3f" % (label(c), np.mean(list(w.values())), np.mean([w[k] for k in g]), np.mean([w[k] for k in o]), lo, r4, r6))
    L += ["", "C. wrong share per clip: " + " ".join(label(c) for c in CELLS)]
    for n, e, _, _ in rows:
        L.append(n + " " + " ".join("%.3f" % (np.abs(e[c]) > TOL).mean() for c in CELLS))
    Path(__file__).with_name("gated.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
