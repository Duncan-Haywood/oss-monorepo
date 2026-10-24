"""Milestone 4: what is SIMPLER's twin worth in real trials?  python3 analyse.py -> results/summary_4.txt, results/cells.csv
(pre-registration: ../../LOG.md, 2026-10-24 milestone 4)"""
import csv, os
import numpy as np
from data import rows, check

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")

def loo_predictions(R):
    """R: list of (robot, task, policy, n, real, sim). Returns raw and calibrated (pooled OLS within robot, leave one cell out) predictions."""
    raw, cal = [], []
    for i, (robot, *_rest, n, r, s) in enumerate(R):
        raw.append(s)
        tr = [(x[5], x[4]) for j, x in enumerate(R) if j != i and x[0] == robot]
        xs, ys = np.array(tr).T
        b, a = np.polyfit(xs, ys, 1)
        cal.append(float(np.clip(a + b * s, 0, 1)))
    return np.array(raw), np.array(cal)

def stats(real, n, pred):
    var_obs = real * (1 - real) / (n - 1)          # unbiased variance of each observed real rate
    mse = np.mean((pred - real) ** 2) - np.mean(var_obs)
    return mse, np.mean(var_obs), np.mean(real * (1 - real))

def main():
    assert not check(), check()
    R = rows()
    n = np.array([x[3] for x in R], float); real = np.array([x[4] for x in R]); sim = np.array([x[5] for x in R])
    raw, cal = loo_predictions(R)
    rng = np.random.default_rng(0)
    idx = np.arange(len(R))
    def summary(ix):
        m_raw, v_real, pq = stats(real[ix], n[ix], raw[ix])
        m_cal, _, _ = stats(real[ix], n[ix], cal[ix])
        r = np.corrcoef(real[ix], sim[ix])[0, 1]
        return dict(m_raw=m_raw, m_cal=m_cal, v_real=v_real, nstar=pq / m_cal if m_cal > 0 else np.inf,
                    gain=v_real / m_cal if m_cal > 0 else np.inf, r=r, rmse_cal=np.sqrt(max(m_cal, 0)))
    pt = summary(idx)
    boots = [summary(rng.choice(idx, len(idx))) for _ in range(2000)]
    def ci(k):
        v = np.array([b[k] for b in boots]); v = v[np.isfinite(v)]
        return np.percentile(v, [2.5, 97.5])
    lines = ["Milestone 4: SIMPLER Visual Matching paired rates, %d cells (leave-one-cell-out; bootstrap over cells, 2,000 resamples, optimistic: cells are clustered)" % len(R)]
    for k, label in [("m_raw", "debiased MSE, raw sim"), ("m_cal", "debiased MSE, calibrated sim"), ("v_real", "real-only variance at paper n"),
                     ("nstar", "break-even n* = mean p(1-p)/MSE_cal"), ("gain", "extra effective real trials, fraction of n (v_real/MSE_cal)"), ("r", "Pearson r sim vs real"), ("rmse_cal", "RMSE of calibrated sim")]:
        lo, hi = ci(k)
        lines.append("%-55s %8.4f   [%.4f, %.4f]" % (label, pt[k], lo, hi))
    lines.append("")
    lines.append("by task (raw / calibrated debiased MSE, real-only variance, n_real, pearson r)")
    tasks = sorted({x[1] for x in R})
    rows_out = []
    for t in tasks:
        ix = np.array([i for i, x in enumerate(R) if x[1] == t])
        mr, vr, _ = stats(real[ix], n[ix], raw[ix]); mc, _, _ = stats(real[ix], n[ix], cal[ix])
        rr = np.corrcoef(real[ix], sim[ix])[0, 1]
        lines.append("%-16s raw %+.4f  cal %+.4f  real-only %.4f  n=%d  r=%.3f" % (t, mr, mc, vr, n[ix][0], rr))
    # per-cell table
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "cells.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(["robot", "task", "policy", "n_real", "real", "sim", "cal_loo"])
        for x, c in zip(R, cal): w.writerow(list(x) + [round(float(c), 4)])
    # sensitivity: sim-only gaps
    gaps = np.abs(sim - real)
    lines.append("")
    lines.append("|sim - real|: median %.3f, max %.3f (%s), cells with gap >= 0.2: %d of %d" % (np.median(gaps), gaps.max(), "%s/%s" % (R[int(gaps.argmax())][1], R[int(gaps.argmax())][2]), int((gaps >= 0.2).sum()), len(R)))
    open(os.path.join(OUT, "summary_4.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))

if __name__ == "__main__":
    main()
