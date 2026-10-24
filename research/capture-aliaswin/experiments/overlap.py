"""Write experiments/overlap.txt: do early-start windows fail because the content the two cameras share is quiet?
In this design (as capture-residgate) camera B is the segment delayed by 0.8 s, so a window of W s shares only
W - 0.8 s of audio, and the nominal 0 dB SNR is set from the whole segment. The shared part can be much quieter.
Window 2 s, gamma 0.25, 0 dB white noise, same seeds as run.py cell (2, 0.25, none)."""
import sys
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parents[2]
for p in ("capture-aliaswin", "capture-residgate", "capture-syncgate", "capture-realedit", "capture-syncedit", "capture-realaudio", "capture-audiosync", "capture-edit"):
    sys.path.insert(0, str(root / p / "src"))
from capture_realaudio import available_clips  # noqa: E402
from capture_aliaswin import pair_at, gcc_search  # noqa: E402

FS, W, G, TOL = 16000, 2.0, 0.25, 2.0


def main():
    L = ["window %g s, gamma %g, 0 dB nominal SNR (segment power / noise power); wrong = |error| > %g ms" % (W, G, TOL),
         "shared = the clip audio both cameras hold in the window = clip[start+0.5 s, start+W-0.3 s] for a 0.8 s delay",
         "shared_snr_db = 10 log10(power of shared audio / noise power), median over right and over wrong windows",
         "clip n_right n_wrong median_shared_snr_right median_shared_snr_wrong wrong_below_-6dB wrong_above_-6dB"]
    for name in ("soft", "untie", "space2", "wallewal", "applause", "gong"):
        clip = available_clips()[name]
        snr, wrong = [], []
        for s in range(12):
            rng = np.random.default_rng(s)
            times = np.linspace(0, 3600.0, 12)
            for _ in range(3):
                true = 0.8 + rng.uniform(-40, 40) * 1e-6 * times
                for tau in true:
                    a, b, st = pair_at(clip, rng, float(tau), W, 0)
                    d = gcc_search(a, b, G)
                    s0 = int(round(st * FS))
                    seg = clip[s0:s0 + int(W * FS) + FS]
                    sh = clip[s0 + int(0.5 * FS): s0 + int((0.5 + W - tau) * FS)]
                    nz = np.mean(seg ** 2)       # noise power = segment power at 0 dB
                    snr.append(10 * np.log10(np.mean(sh ** 2) / nz + 1e-12))
                    wrong.append(abs(d - tau) * 1e3 > TOL)
        snr, wrong = np.array(snr), np.array(wrong)
        lo = snr < -6
        L.append("%s %d %d %.1f %s %s %s" % (
            name, (~wrong).sum(), wrong.sum(), np.median(snr[~wrong]) if (~wrong).any() else float("nan"),
            "%.1f" % np.median(snr[wrong]) if wrong.any() else "nan",
            "%.3f" % wrong[lo].mean() if lo.any() else "nan", "%.3f" % wrong[~lo].mean() if (~lo).any() else "nan"))
    Path(__file__).with_name("overlap.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
