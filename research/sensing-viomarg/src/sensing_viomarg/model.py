"""Planar VIO fixed-lag smoother with a marginalisation prior (extends research/sensing-vio).

The world, sensors and factors are those of `sensing_vio`. The only change is the prior on the oldest
keyframe in the window. `sensing_vio` pins it to its previous estimate with a fixed sigma, so velocity and
bias information is forgotten. Here, after each solve, the oldest keyframe is marginalised out of its prior
and the IMU factor to the next keyframe (a Schur complement), and the result is the dense prior on that
next keyframe. Bearing factors of the dropped keyframe are not marginalised (that would couple landmarks);
this is a known approximation, stated in the README.
"""
import os
import sys

import numpy as np
from scipy.optimize import least_squares

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "sensing-vio", "src"))
from sensing_vio import Setup, make_world, simulate_sensors, drift_percent  # noqa: E402,F401
from sensing_vio import model as base  # noqa: E402

_BIG = 1e12


def _prior_res(K0, pri):
    """Residual of the prior on the oldest keyframe state K0 (8,): dense (L, c) if present, else diagonal pin."""
    if "L" in pri:
        dx = K0 - pri["x"]
        dx[2] = base.wrap(dx[2])
        return pri["L"].T @ dx + pri["c"]
    return np.zeros(0)


def _res(x, nk, imu, ob, pri, sg):
    dummy = pri if "L" not in pri else dict(x=pri["x"], sig=np.full(8, _BIG))
    r = base._residuals(x, nk, imu, ob, dummy, sg)
    if "L" in pri:
        return np.concatenate([r, _prior_res(x[:8], pri)])
    return r


def _jac(f, x, args):
    r0 = f(x, *args)
    J = np.empty((len(r0), len(x)))
    for c in range(len(x)):
        h = 1e-6 * max(1.0, abs(x[c]))
        xp = x.copy(); xp[c] += h
        J[:, c] = (f(xp, *args) - r0) / h
    return J


def _jac_full(x, nk, imu, ob, pri, sg):
    return _jac(_res, x, (nk, imu, ob, pri, sg))


def marginal_prior(K01, g01, a01, T, dt, pri, sg):
    """Dense prior on keyframe 1 from marginalising keyframe 0 (its prior + the IMU factor 0 to 1)."""
    imu = (g01, a01, T, dt)
    ob = (np.zeros(0, dtype=int), np.zeros(0, dtype=int), np.zeros(0))
    x = K01.ravel().copy()
    args = (2, imu, ob, pri, sg)
    f = lambda xx, *a: _res(xx, *a)  # noqa: E731
    r = f(x, *args)
    J = _jac(f, x, args)
    H, g = J.T @ J, J.T @ r
    A, B, D = H[:8, :8], H[:8, 8:], H[8:, 8:]
    Ai = np.linalg.pinv(A, rcond=1e-12)
    lam = D - B.T @ Ai @ B
    b = g[8:] - B.T @ Ai @ g[:8]
    lam = 0.5 * (lam + lam.T)
    w, V = np.linalg.eigh(lam)
    w = np.maximum(w, 1e-9 * max(w.max(), 1.0))
    L = V * np.sqrt(w)                                   # lam = L L^T
    c = np.linalg.solve(L, b)                            # r = L^T dx + L^-1 b has cost 0.5|r|^2 = 0.5 dx^T lam dx + b^T dx + const
    return dict(x=K01[1].copy(), L=L, c=c)


def run_vio_marg(world, s, sens, marginalise=True, init_v_sigma=0.02):
    """As `sensing_vio.run_vio`; with marginalise=True the window prior comes from a Schur complement."""
    nkf = len(sens["kf"])
    step, dt = sens["step"], world["dt"]
    T = step * dt
    gy, ac = sens["gyro"], sens["acc"]
    sg = dict(th=s.gyro_nd * np.sqrt(T), v=s.acc_nd * np.sqrt(T), p=s.acc_nd * T ** 1.5 / np.sqrt(3),
              bg=s.gyro_rw * np.sqrt(T), ba=s.acc_rw * np.sqrt(T), b=s.bearing_sigma)
    sg = {k: max(v, 1e-6) for k, v in sg.items()}
    by_frame = {}
    for (i, l, z) in sens["obs"]:
        by_frame.setdefault(i, {})[l] = z
    k0 = sens["kf"][0]
    est = np.zeros((nkf, 8))
    est[0, :2] = world["p"][k0]
    est[0, 2] = world["th"][k0]
    est[0, 3:5] = world["v"][k0]
    lmap, marg = {}, {}
    out = np.zeros((nkf, 2))
    out[0] = est[0, :2]
    for j in range(1, nkf):
        i0 = max(0, j - s.window + 1)
        idx = list(range(i0, j + 1))
        nk = len(idx)
        if nk < 2:
            continue
        g = np.stack([gy[sens["kf"][a]: sens["kf"][a] + step] for a in idx[:-1]])
        a_ = np.stack([ac[sens["kf"][a]: sens["kf"][a] + step] for a in idx[:-1]])
        prev = est[j - 1].copy()
        dth, dvv, dpp = base._preint(g[-1:], a_[-1:], prev[5:6], prev[6:8][None], dt)
        R = base.rot(prev[2])
        est[j, 2] = prev[2] + dth[0]
        est[j, 3:5] = prev[3:5] + R @ dvv[0]
        est[j, :2] = prev[:2] + prev[3:5] * T + R @ dpp[0]
        est[j, 5:8] = prev[5:8]
        counts = {}
        for a, fi in enumerate(idx):
            for l in by_frame.get(fi, {}):
                counts.setdefault(l, []).append(a)
        lids, l0 = [], []
        for l, fr in counts.items():
            if len(fr) < 2:
                continue
            if l in lmap:
                l0.append(lmap[l]); lids.append(l)
                continue
            a1, a2 = fr[0], fr[-1]
            P1, P2 = est[idx[a1]], est[idx[a2]]
            x = base._triangulate(P1[:2], P1[2], by_frame[idx[a1]][l], P2[:2], P2[2], by_frame[idx[a2]][l])
            if x is not None:
                l0.append(x); lids.append(l)
        lpos = {l: n for n, l in enumerate(lids)}
        ki, li, z = [], [], []
        for l in lids:
            for a in counts[l]:
                ki.append(a); li.append(lpos[l]); z.append(by_frame[idx[a]][l])
        x0 = np.concatenate([est[idx].ravel(), np.array(l0).ravel() if l0 else np.zeros(0)])
        if marginalise and idx[0] in marg:
            pri = dict(marg[idx[0]])
        else:
            vs = init_v_sigma * (1 if j == 1 else 3)
            pri = dict(x=est[idx[0]].copy(), sig=np.array([1e-3, 1e-3, 1e-4, vs, vs, 3e-3, 3e-2, 3e-2]))
        imu = (g, a_, T, dt)
        ob = (np.array(ki, dtype=int), np.array(li, dtype=int), np.array(z))
        try:
            sol = least_squares(_res, x0, jac=_jac_full, args=(nk, imu, ob, pri, sg),
                                x_scale="jac", max_nfev=15, xtol=1e-6, ftol=1e-6)
            K, L = base._unpack(sol.x, nk)
            if np.all(np.isfinite(K)):
                est[idx] = K
                for n, l in enumerate(lids):
                    lmap[l] = L[n]
                if marginalise:
                    marg[idx[1]] = marginal_prior(K[:2], g[:1], a_[:1], T, dt, pri, sg)
        except Exception:
            pass
        out[j] = est[j, :2]
    return out
