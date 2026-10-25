"""Milestone 7e: twin-assisted empirical-Bernstein lower bound on E[min(R, c)] (c a twin quantile) versus real-only, m7c cost pools.
python3 clipcv.py [reps]  ->  results/clipcv.csv, results/summary.txt   (pre-registration: LOG.md, 2026-10-25 milestone 7e)"""
import csv, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m7d_clip"))
import clip as m7d

NS, Q, SEED = (30, 60, 120, 240), 0.999, 73


def run(R, T, c, n, reps, rng):
    yR, yT = np.minimum(R, c) / c, np.minimum(T, c) / c
    mT, truth = yT.mean(), yR.mean()
    cov = [0, 0]; gap = [0.0, 0.0]
    for _ in range(reps):
        i = rng.choice(len(yR), n, replace=False)
        L0 = m7d.eb_lower(yR[i], 0.05)
        d = (yR[i] - yT[i] + 1) / 2
        L1 = 2 * m7d.eb_lower(d, 0.05) - 1 + mT
        for k, L in enumerate((L0, L1)):
            cov[k] += L <= truth; gap[k] += R.mean() - L * c
    return [100 * x / reps for x in cov], [g / reps for g in gap]


if __name__ == "__main__":
    reps = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    D = m7d.load(); T = D["twin"]; c = float(np.quantile(T, Q))
    rng = np.random.default_rng(SEED)
    rows = []
    for name, R in D.items():
        if name == "twin":
            continue
        rho = float(np.corrcoef(np.minimum(R, c), np.minimum(T, c))[0, 1])
        for n in NS:
            cov, gap = run(R, T, c, n, reps, rng)
            rows.append([name, n, round(rho, 3), round(R.mean(), 4), round(cov[0], 2), round(cov[1], 2),
                         round(gap[0] / R.mean(), 3), round(gap[1] / R.mean(), 3)])
    hdr = ["pair", "n", "rho_clipped", "mean_R", "cov_real", "cov_twin", "rel_gap_real", "rel_gap_twin"]
    with open(os.path.join(HERE, "results", "clipcv.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(hdr); w.writerows(rows)
    out = [f"q={Q}, c={c:.3f}"]
    for n in NS:
        s = [r for r in rows if r[1] == n]
        win = [r for r in s if r[7] < r[6]]
        out.append(f"n={n}: twin-assisted smaller gap on {len(win)}/21 pairs (rho of winners: {sorted(r[2] for r in win)}); "
                   f"median rel gap real {np.median([r[6] for r in s]):.3f}, twin {np.median([r[7] for r in s]):.3f}; "
                   f"min coverage real {min(r[4] for r in s)}%, twin {min(r[5] for r in s)}%")
    open(os.path.join(HERE, "results", "summary.txt"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))
