"""Milestone 7ag, post hoc (not predicted): does one first-order lag on the commanded acceleration explain the point mass's misses?

The simulator was faster than the point mass, and overshot more, exactly where the linear tail is a large share of the travel
(S = 0.5 m, A_P = 8). A lag between the requested and the achieved acceleration (the attitude loop has to lean the vehicle) delays
the braking that kd v asks for, so the vehicle arrives sooner and overshoots more. Here the point mass gets a lag tau,
a' = (a_cmd - a) / tau, with tau fitted on the in-sample condition (A_P 3.5, S 1) only, by grid search on median |error|, and is
then scored on the six out-of-sample conditions unchanged. Writes posthoc.txt."""
import os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import verdicts as V  # noqa: E402
from cruise_model import DT  # noqa: E402


def lagged(kp, kd, ki, a_p, step, band, tau, t_end=6.0):
    kp, kd, ki = (np.atleast_1d(np.asarray(v, float)) for v in (kp, kd, ki))
    x = np.full(kp.shape, float(step)); v = np.zeros_like(x); I = np.zeros_like(x); a = np.zeros_like(x)
    rise = np.full(kp.shape, np.nan); over = np.zeros_like(x)
    for k in range(int(round(t_end / DT))):
        e = -x
        I = np.clip(I + np.where(np.abs(e) < band, e, 0.0) * DT, -2.0, 2.0)
        ac = kp * e * np.minimum(1.0, (a_p / kp) / np.maximum(np.abs(e), 1e-12)) - kd * v + ki * I
        a = a + (ac - a) * min(1.0, DT / tau) if tau > 0 else ac
        v = v + a * DT; x = x + v * DT
        hit = np.isnan(rise) & (x <= 0.1 * step); rise[hit] = (k + 1) * DT
        over = np.maximum(over, -x)
    return rise, over


def main():
    from scipy.stats import spearmanr
    G = V.G; K = V.KEYS
    kp, kd, ki = (np.array([G[k][f] for k in K]) for f in ("kp", "kd", "ki"))
    T = {tuple(c): V.table(*c) for c in V.R["conds"]}
    taus = np.round(np.arange(0.0, 0.1501, 0.005), 3)
    fit = [float(np.nanmedian(np.abs(T[(3.5, 1.0)]["sim"] - lagged(kp, kd, ki, 3.5, 1.0, V.B, t)[0]))) for t in taus]
    tau = float(taus[int(np.argmin(fit))])
    L = [f"tau fitted on (3.5, 1) only: {tau * 1000:.0f} ms (grid 0-150 ms by 5 ms; median |error| {min(fit):.4f} s)", "",
         f"{'A_P':>5} {'S':>4} | {'pm<=0.1s':>8} {'lag<=0.1s':>9} | {'MAE pm':>6} {'MAE lag':>7} | {'bias lag':>8} | "
         f"{'over sim':>8} {'over lag':>8} {'rho':>5}"]
    for (a, s), t in T.items():
        r, o = lagged(kp, kd, ki, a, s, V.B, tau)
        L.append(f"{a:5.1f} {s:4.1f} | {V.within_abs(t['sim'], t['pm'], 0.1):>5}/36 {V.within_abs(t['sim'], r, 0.1):>6}/36 | "
                 f"{V.mae(t['sim'], t['pm']):6.3f} {V.mae(t['sim'], r):7.3f} | {np.nanmedian(t['sim'] - r):+8.3f} | "
                 f"{np.nanmedian(t['ov']) * 100:6.1f}cm {np.median(o) * 100:6.1f}cm {spearmanr(t['ov'], o).statistic:5.2f}")
    out = "\n".join(L) + "\n"
    open(os.path.join(HERE, "posthoc.txt"), "w").write(out); print(out)


if __name__ == "__main__":
    main()
