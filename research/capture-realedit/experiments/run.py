"""Write experiments/results.txt: cut damage with sync errors measured on real clips (deterministic)."""
import sys
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parents[2]
for p in ("capture-realedit", "capture-syncedit", "capture-realaudio", "capture-audiosync", "capture-edit"):
    sys.path.insert(0, str(root / p / "src"))
from capture_realaudio import available_clips  # noqa: E402
from capture_realedit import real_trial  # noqa: E402

SEEDS = range(12)
WIN = 2.0


def cell(clip, mode, snr, gamma):
    rs = [real_trial(s, clip, mode, WIN, snr, gamma) for s in SEEDS]
    return tuple(float(np.mean([r[k] for r in rs])) for k in ("visible", "event", "jump_ms"))


def main():
    clips = available_clips()
    out = ["clips: " + " ".join(sorted(clips)),
           "== A. per clip: share of cuts with a jump over a frame / with a loud event in the jump / mean jump ms (mean of 12 seeds)",
           "4 cameras, 120 s Viterbi edit at a random point of a 1 h shoot, +-40 ppm, 0.8 s offset, 12 windows of 2 s, white noise",
           "clip mode snr_db gamma visible event jump_ms"]
    pooled = {}
    for name, clip in sorted(clips.items()):
        for mode, snr, gamma in [("fit", 10, 1.0), ("fit", 0, 1.0), ("fit", 0, 0.25), ("fit", -10, 1.0), ("fit", -10, 0.25), ("once", 10, 1.0)]:
            v = cell(clip, mode, snr, gamma)
            pooled.setdefault((mode, snr, gamma), []).append(v)
            out.append("%s %s %d %g %.3f %.3f %.1f" % ((name, mode, snr, gamma) + v))
    out += ["== B. mean over clips (worst clip in the last column = largest visible share)",
            "mode snr_db gamma visible event jump_ms worst_visible"]
    for (mode, snr, gamma), vs in pooled.items():
        a = np.array(vs)
        out.append("%s %d %g %.3f %.3f %.1f %.3f" % (mode, snr, gamma, a[:, 0].mean(), a[:, 1].mean(), a[:, 2].mean(), a[:, 0].max()))
    Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
