"""Joint CMA-ES vs uniform random search over (L, D, kp, kd, ki), trained on the wide randomised plant, at two
evaluation budgets and 8 seeds; each winner is re-scored on 64 held-out episodes. Compared with the grid-then-tune
result of codesign-aero-robust (results.json there). Writes results.txt and results.json."""
import json, os, sys, warnings
import numpy as np

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_aero_joint import joint as J
from codesign_aero_joint import aero as A

SEEDS, BUDGETS = range(8), (960, 4800)
if __name__ == "__main__":
    lines, R = [], {}
    P = lambda s="": (lines.append(s), print(s, flush=True))
    ref = json.load(open(os.path.join(HERE, "..", "..", "codesign-aero-robust", "experiments", "results.json")))
    g = np.array(ref["rms"]["wide|wide"]); gn = np.array(ref["rms"]["nominal|wide"])
    P(f"reference (codesign-aero-robust, 50-cell grid, 96 evals/cell = 4800 evals): wide-tuned gains, held-out wide-plant RMS: best cell {g.min():.2f} deg (chosen on the held-out set, so optimistic), median cell {np.median(g):.2f}")
    for B in BUDGETS:
        for name, f in (("cma", J.run_cma), ("random", J.run_random)):
            out = []
            for s in SEEDS:
                x, tr = f(B, s)
                h = J.heldout(x); sz = A.size(*[A.L_RANGE[0] + x[0] * (A.L_RANGE[1] - A.L_RANGE[0]), A.D_RANGE[0] + x[1] * (A.D_RANGE[1] - A.D_RANGE[0])])
                out.append(dict(seed=s, train=-tr, heldout=h, x=x.tolist(), L=float(sz["L"]), D=float(sz["D"])))
            R[f"{name}|{B}"] = out
            h = np.array([o["heldout"] for o in out]); t = np.array([o["train"] for o in out])
            P(f"{name:6s} budget {B:5d}: held-out RMS median {np.median(h):.2f} (min {h.min():.2f}, max {h.max():.2f}) deg; training-score median {np.median(t):.2f}; "
              f"train-to-held-out optimism {np.median(h - t):+.2f} deg; designs L {np.median([o['L'] for o in out]):.3f} m, D {np.median([o['D'] for o in out]):.3f} m (median over {len(out)} seeds)")
    R["grid_wide_best"], R["grid_wide_median"] = float(g.min()), float(np.median(g))
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(R, open(os.path.join(HERE, "results.json"), "w"))
