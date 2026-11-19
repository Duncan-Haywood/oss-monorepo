"""Milestone 7ag: a one-dimensional point-mass model of the capped outer loop, used to predict a tune's rise time without flying it.

x'' = -min(kp |x|, A_P) sign(x) - kd x' + ki I,  I' = x only while |x| < b (conditional integration),  x(0) = S, x'(0) = 0.
Rise = first time x <= 0.1 S (90% of the step), as 7y measures it. No attitude loop, motor lag, noise or plant randomisation:
the residual against the full simulator is what those cost. Stdlib-free but numpy; integrates at the simulator's 2 ms step.
cruise_line is 7af's post hoc fit, rise = 0.90 * (0.9 S) * kd / A_P + 0.33 s, written for general S."""
import numpy as np

DT = 0.002


def rise_point_mass(kp, kd, ki, a_p, step=1.0, band=0.25, t_end=6.0):
    kp, kd, ki = (np.atleast_1d(np.asarray(v, float)) for v in (kp, kd, ki))
    x = np.full(kp.shape, float(step)); v = np.zeros_like(x); I = np.zeros_like(x)
    rise = np.full(kp.shape, np.nan)
    for k in range(int(round(t_end / DT))):
        # same sign convention as poshold: error e = -x, integrator on e
        e = -x
        if band is None:
            I = np.clip(I + e * DT, -2.0, 2.0)
        else:
            I = np.clip(I + np.where(np.abs(e) < band, e, 0.0) * DT, -2.0, 2.0)
        acc = kp * e * np.minimum(1.0, (a_p / kp) / np.maximum(np.abs(e), 1e-12)) - kd * v + ki * I
        v = v + acc * DT; x = x + v * DT
        hit = np.isnan(rise) & (x <= 0.1 * step)
        rise[hit] = (k + 1) * DT
    return rise


def cruise_line(kd, a_p, step=1.0):
    return 0.90 * (0.9 * step) * np.asarray(kd, float) / a_p + 0.33


def overshoot_point_mass(kp, kd, ki, a_p, step=1.0, band=0.25, t_end=6.0):
    """Largest excursion past the hold point (m) of the same model over t_end."""
    kp, kd, ki = (np.atleast_1d(np.asarray(v, float)) for v in (kp, kd, ki))
    x = np.full(kp.shape, float(step)); v = np.zeros_like(x); I = np.zeros_like(x); over = np.zeros_like(x)
    for _ in range(int(round(t_end / DT))):
        e = -x
        I = np.clip(I + (e if band is None else np.where(np.abs(e) < band, e, 0.0)) * DT, -2.0, 2.0)
        acc = kp * e * np.minimum(1.0, (a_p / kp) / np.maximum(np.abs(e), 1e-12)) - kd * v + ki * I
        v = v + acc * DT; x = x + v * DT
        over = np.maximum(over, -x)
    return over
