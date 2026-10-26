"""Milestone 4e: does the SIMPLER calibration transfer to a held-out task / policy / both?
python3 transfer.py -> results/summary_4e.txt   (pre-registration: ../../LOG.md, 2026-10-26 milestone 4e)
Same cells and OLS-within-robot calibration as m4; only the training set for each cell's prediction changes."""
import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "m4_simpler"))
from data import rows, check
from analyse import stats

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")

def predictions(R, drop):
    """drop(i, j) -> True if cell j is excluded from the fit used to predict cell i."""
    cal = []
    for i, (robot, *_r, s) in enumerate(R):
        tr = [(x[5], x[4]) for j, x in enumerate(R) if x[0] == robot and not drop(i, j)]
        xs, ys = np.array(tr).T
        b, a = np.polyfit(xs, ys, 1)
        cal.append(float(np.clip(a + b * s, 0, 1)))
    return np.array(cal)

def summarise(real, n, sim, pred, ix):
    m, v, pq = stats(real[ix], n[ix], pred[ix])
    m_raw, _, _ = stats(real[ix], n[ix], sim[ix])
    return m, m_raw, (pq / m if m > 0 else np.inf), np.corrcoef(real[ix], pred[ix])[0, 1]

def main():
    assert not check(), check()
    R = rows()
    N = len(R)
    n = np.array([x[3] for x in R], float); real = np.array([x[4] for x in R]); sim = np.array([x[5] for x in R])
    schemes = {
        "cell (m4)": lambda i, j: i == j,
        "task":      lambda i, j: R[i][1] == R[j][1],
        "policy":    lambda i, j: R[i][2] == R[j][2],
        "task+policy": lambda i, j: R[i][1] == R[j][1] or R[i][2] == R[j][2],
    }
    pols = sorted({x[2] for x in R})
    pix = {p: np.array([i for i, x in enumerate(R) if x[2] == p]) for p in pols}
    rng = np.random.default_rng(0)
    lines = ["Milestone 4e: SIMPLER calibration transfer, 36 cells, OLS within robot; interval = 4,000 resamples of policies (as 4c), 95% percentile",
             "%-12s %9s %9s %8s %7s   %s" % ("held out", "MSE_cal", "MSE_raw", "n*", "r", "n* interval")]
    for name, drop in schemes.items():
        pred = predictions(R, drop)
        pt = summarise(real, n, sim, pred, np.arange(N))
        vals = []
        for _ in range(4000):
            ix = np.concatenate([pix[p] for p in rng.choice(pols, len(pols))])
            vals.append(summarise(real, n, sim, pred, ix)[2])
        v = np.array(vals); fin = v[np.isfinite(v)]
        lines.append("%-12s %9.4f %9.4f %8.1f %7.3f   [%.1f, %.1f] (undefined/infinite %.3f)" % (
            name, pt[0], pt[1], pt[2], pt[3], *np.percentile(fin, [2.5, 97.5]), 1 - len(fin) / len(v)))
    open(os.path.join(OUT, "summary_4e.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))

if __name__ == "__main__":
    main()
