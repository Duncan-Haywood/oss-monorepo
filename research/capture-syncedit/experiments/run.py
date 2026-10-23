"""Write experiments/results.txt: cut damage of the residual sync error (deterministic)."""
import sys
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parents[2]
for p in ("capture-syncedit", "capture-audiosync", "capture-edit"):
    sys.path.insert(0, str(root / p / "src"))
from capture_syncedit import trial  # noqa: E402

SEEDS = range(12)
KEYS = ["visible", "event", "jump_ms", "max_err_ms"]


def cell(mode, win, snr):
    rs = [trial(s, mode, win, snr) for s in SEEDS]
    return {k: (float(np.mean([r[k] for r in rs])), float(np.median([r[k] for r in rs]))) for k in KEYS}


def main():
    out = ["== A. cuts with a jump over one frame (visible), cuts with a loud event inside the jump (event), mean jump ms (mean / median over 12 seeds)",
           "4 cameras, 120 s Viterbi edit (sigma 0.3, cost 1.0) at a random point of a 1 h shoot, camera clock error uniform in +-40 ppm, start offset 0.8 s",
           "mode win_s snr_db visible event jump_ms_mean jump_ms_median max_err_ms_median"]
    r = cell("once", 2.0, 10)
    out.append("once 2 10 %.3f %.3f %.1f %.1f %.1f" % (r["visible"][0], r["event"][0], r["jump_ms"][0], r["jump_ms"][1], r["max_err_ms"][1]))
    for win in (2.0, 5.0):
        for snr in (0, -10, -15, -20):
            r = cell("fit", win, snr)
            out.append("fit %g %d %.3f %.3f %.1f %.1f %.1f" % (win, snr, r["visible"][0], r["event"][0], r["jump_ms"][0], r["jump_ms"][1], r["max_err_ms"][1]))
    Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
