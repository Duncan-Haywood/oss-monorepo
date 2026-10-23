"""Delay margin of a PD-controlled double integrator: analytic, and as a fixed-step simulator sees it.

Plant x'' = u, control u(t) = -kp x(t - tau) - kd v(t - tau). Continuous-time delay margin is exact
(frequency-domain crossing). A simulator quantises tau to n whole steps of dt and integrates with a
chosen scheme; the largest n for which the discrete closed loop is stable is computed exactly from
the eigenvalues of its (2(n+1))-state companion matrix, no sampling.
"""
import math
import numpy as np


def analytic_margin(kp, kd):
    """Largest tau (s) with the loop stable: tau* = phi / w, w^2 = (kd^2 + sqrt(kd^4 + 4 kp^2)) / 2, phi = atan2(kd w, kp)."""
    w = math.sqrt((kd * kd + math.sqrt(kd ** 4 + 4 * kp * kp)) / 2)
    return math.atan2(kd * w, kp) / w, w


def step_map(scheme, dt, kp, kd):
    """(A, B) with [x', v'] = A [x, v] + B [xd, vd], xd, vd the delayed state fed to the controller."""
    K = np.array([[-kp, -kd]])
    if scheme == "euler":      # explicit Euler: x += dt v, v += dt u (old v)
        A = np.array([[1, dt], [0, 1]], float)
        B = np.array([[0, 0], [dt * -kp, dt * -kd]])
    elif scheme == "semi":     # semi-implicit Euler: v += dt u, then x += dt v (new v)
        A = np.array([[1, dt], [0, 1]], float)
        B = np.array([[dt * dt * -kp, dt * dt * -kd], [dt * -kp, dt * -kd]])
    elif scheme == "zoh":      # exact integration with u held over the step
        A = np.array([[1, dt], [0, 1]], float)
        B = np.array([[dt * dt / 2 * -kp, dt * dt / 2 * -kd], [dt * -kp, dt * -kd]])
    else:
        raise ValueError(scheme)
    return A, B


def spectral_radius(scheme, dt, n, kp, kd):
    A, B = step_map(scheme, dt, kp, kd)
    m = n + 1
    M = np.zeros((2 * m, 2 * m))
    M[0:2, 0:2] += A
    M[0:2, 2 * n:2 * n + 2] += B           # the controller reads the state n steps old
    for i in range(1, m):
        M[2 * i:2 * i + 2, 2 * (i - 1):2 * i] = np.eye(2)
    return float(max(abs(np.linalg.eigvals(M))))


def max_stable_steps(scheme, dt, kp, kd, nmax=None):
    """Largest n such that every n' <= n is stable (rho < 1); -1 if even n = 0 is unstable."""
    if nmax is None:
        nmax = int(3 * analytic_margin(kp, kd)[0] / dt) + 2
    best = -1
    for n in range(nmax + 1):
        if spectral_radius(scheme, dt, n, kp, kd) < 1 - 1e-12:
            best = n
        else:
            break
    return best


def simulate(scheme, dt, n, kp, kd, T=60.0, x0=1.0):
    """Time-domain check: |state| at the end of T seconds from (x0, 0) with a history of the initial state."""
    A, B = step_map(scheme, dt, kp, kd)
    hist = [np.array([x0, 0.0])] * (n + 1)
    s = hist[-1]
    for _ in range(int(T / dt)):
        s = A @ s + B @ hist[0]
        hist = hist[1:] + [s]
        if not np.isfinite(s).all() or abs(s).max() > 1e12:
            return float("inf")
    return float(abs(s).max())
