"""Run the noisy-secretary sweep and write results.txt / results.json (about a minute, stdlib only)."""
import json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from secretary import exact_noiseless, sweep  # noqa: E402

N = 50
TRIALS = 40000
SIGMAS = [0.0, 0.25, 0.5, 1.0, 2.0, 4.0]
CUTOFFS = list(range(1, 46))


def main():
    out = {"n": N, "trials": TRIALS, "cutoffs": CUTOFFS, "rows": {}}
    lines = ["== free-secretarynoise: n=%d, %d trials per cell, seed 7 ==" % (N, TRIALS), ""]
    lines.append("1. Check: noiseless simulation vs exact formula (P(best))")
    lines.append("r  exact  simulated")
    res0 = sweep(N, 0.0, CUTOFFS, TRIALS, 7)
    for r in CUTOFFS[::3]:
        lines.append("%d %.4f %.4f" % (r, exact_noiseless(N, r), res0[r][0]))
    dev = max(abs(exact_noiseless(N, r) - res0[r][0]) for r in CUTOFFS)
    lines.append("max |exact - simulated| over all %d cutoffs: %.4f (binomial se at p=0.37 is %.4f)" % (len(CUTOFFS), dev, (0.37 * 0.63 / TRIALS) ** 0.5))
    lines += ["", "2. Best cutoff and P(best) by noise (sigma = noise sd / quality sd)",
              "sigma best_r P_best P_at_r19 best_r_for_pct pct_at_that_r"]
    for s in SIGMAS:
        res = sweep(N, s, CUTOFFS, TRIALS, 7)
        br = max(CUTOFFS, key=lambda r: res[r][0])
        out["rows"][str(s)] = {str(r): res[r] for r in CUTOFFS}
        bp = max(CUTOFFS, key=lambda r: res[r][1])
        lines.append("%.2f %d %.4f %.4f %d %.4f" % (s, br, res[br][0], res[19][0], bp, res[bp][1]))
    lines += ["", "3. P(best) by cutoff and noise"]
    lines.append("r " + " ".join("s%.2f" % s for s in SIGMAS))
    for r in CUTOFFS:
        lines.append("%d " % r + " ".join("%.4f" % out["rows"][str(s)][str(r)][0] for s in SIGMAS))
    lines += ["", "4. Mean true-quality percentile of the pick by cutoff and noise"]
    lines.append("r " + " ".join("s%.2f" % s for s in SIGMAS))
    for r in CUTOFFS:
        lines.append("%d " % r + " ".join("%.4f" % out["rows"][str(s)][str(r)][1] for s in SIGMAS))
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")
    (HERE / "results.json").write_text(json.dumps(out, indent=1))
    print("\n".join(lines[:70]))


if __name__ == "__main__":
    main()
