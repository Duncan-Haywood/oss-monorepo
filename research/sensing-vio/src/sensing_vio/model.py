"""Planar visual-inertial odometry (fixed-lag smoother) on a synthetic world.

A vehicle drives a smooth random path past point landmarks. A forward camera measures the bearing of
landmarks in view (known data association); a gyro and a body-frame accelerometer run at 100 Hz with
white noise and bias random walk. The estimator is a sliding-window nonlinear least-squares smoother:
keyframe poses, velocities and IMU biases, landmark positions, IMU preintegration factors and bearing
factors. The oldest pose is pinned at its previous estimate. Nothing here is measured on a real sensor.
"""
from dataclasses import dataclass, replace

import numpy as np
from scipy.optimize import least_squares

IMU_HZ = 100


@dataclass(frozen=True)
class Setup:
    width_px: int = 640          # horizontal resolution; focal length follows from the field of view
    fov_deg: float = 90.0
    px_sigma: float = 0.5        # feature localisation noise in pixels
    fps: float = 10.0            # camera (= keyframe) rate; must divide IMU_HZ
    max_range: float = 15.0
    gyro_nd: float = 1.7e-4      # rad/s/sqrt(Hz)
    gyro_rw: float = 2.0e-5      # rad/s^2/sqrt(Hz)
    acc_nd: float = 2.0e-3       # m/s^2/sqrt(Hz)
    acc_rw: float = 3.0e-3       # m/s^3/sqrt(Hz)
    window_s: float = 0.6        # smoother span in seconds; keyframes = window_s * fps + 1 (at least 4)

    @property
    def window(self):
        return max(4, int(round(self.window_s * self.fps)) + 1)

    @property
    def focal_px(self):
        return (self.width_px / 2) / np.tan(np.radians(self.fov_deg) / 2)

    @property
    def bearing_sigma(self):
        return self.px_sigma / self.focal_px

    def with_imu_scale(self, gyro, acc):
        return replace(self, gyro_nd=self.gyro_nd * gyro, gyro_rw=self.gyro_rw * gyro,
                       acc_nd=self.acc_nd * acc, acc_rw=self.acc_rw * acc)


def rot(th):
    c, s = np.cos(th), np.sin(th)
    return np.array([[c, -s], [s, c]])


def wrap(a):
    return (a + np.pi) % (2 * np.pi) - np.pi


def make_world(seed, T=40.0, n_landmarks=120):
    """Truth at IMU rate (forward Euler, so preintegration is consistent) plus landmarks along the path."""
    rng = np.random.default_rng(seed)
    n = int(T * IMU_HZ)
    dt = 1.0 / IMU_HZ
    w = np.zeros(n)
    wv = 0.0
    for k in range(n):                       # low-passed random turn rate, rms ~0.3 rad/s, bounded
        wv += (-wv / 2.0) * dt + 0.6 * np.sqrt(dt) * rng.standard_normal()
        w[k] = wv
    t = np.arange(n) * dt
    speed = 1.0 + 0.3 * np.sin(2 * np.pi * t / 7.0 + rng.uniform(0, 6.28))
    th = np.concatenate([[0.0], np.cumsum(w * dt)])[:n]
    v = speed[:, None] * np.stack([np.cos(th), np.sin(th)], 1)
    p = np.concatenate([np.zeros((1, 2)), np.cumsum(v * dt, axis=0)])[:n]
    a_world = np.diff(v, axis=0, append=v[-1:]) / dt
    a_body = np.einsum("kji,kj->ki", np.stack([np.stack([np.cos(th), -np.sin(th)], 1),
                                               np.stack([np.sin(th), np.cos(th)], 1)], 1), a_world)
    idx = rng.integers(0, n, n_landmarks)
    ang = rng.uniform(0, 2 * np.pi, n_landmarks)
    rad = rng.uniform(2.0, 14.0, n_landmarks)
    lm = p[idx] + rad[:, None] * np.stack([np.cos(ang), np.sin(ang)], 1)
    return dict(dt=dt, th=th, v=v, p=p, w=w, a_body=a_body, lm=lm, T=T)


def simulate_sensors(world, s, seed):
    """Noisy gyro/accelerometer samples and per-keyframe bearing observations [(keyframe, landmark, bearing)]."""
    rng = np.random.default_rng(10_000 + seed)
    n = len(world["th"])
    dt = world["dt"]
    bg = np.cumsum(s.gyro_rw * np.sqrt(dt) * rng.standard_normal(n))
    ba = np.cumsum(s.acc_rw * np.sqrt(dt) * rng.standard_normal((n, 2)), axis=0)
    gyro = world["w"] + bg + s.gyro_nd / np.sqrt(dt) * rng.standard_normal(n)
    acc = world["a_body"] + ba + s.acc_nd / np.sqrt(dt) * rng.standard_normal((n, 2))
    step = int(round(IMU_HZ / s.fps))
    kf = np.arange(0, n, step)
    obs = []
    half = np.radians(s.fov_deg) / 2
    for i, k in enumerate(kf):
        d = world["lm"] - world["p"][k]
        loc = d @ rot(world["th"][k])         # rows: R^T d
        r = np.hypot(loc[:, 0], loc[:, 1])
        b = np.arctan2(loc[:, 1], loc[:, 0])
        vis = np.where((np.abs(b) < half) & (r > 1.0) & (r < s.max_range))[0]
        for l in vis:
            obs.append((i, l, b[l] + s.bearing_sigma * rng.standard_normal()))
    return dict(gyro=gyro, acc=acc, kf=kf, obs=obs, step=step)


def _preint(gyro, acc, bg, ba, dt):
    """Batched 2D preintegration over intervals. gyro (N,m), acc (N,m,2), bg (N,), ba (N,2)."""
    wc = (gyro - bg[:, None]) * dt
    th = np.cumsum(wc, 1) - wc                       # angle before each sample
    c, s = np.cos(th), np.sin(th)
    a = acc - ba[:, None, :]
    inc = np.stack([c * a[..., 0] - s * a[..., 1], s * a[..., 0] + c * a[..., 1]], -1) * dt
    dv = np.cumsum(inc, 1) - inc                     # velocity change before each sample
    return wc.sum(1), inc.sum(1), dv.sum(1) * dt


def _unpack(x, nk):
    return x[: nk * 8].reshape(nk, 8), x[nk * 8:].reshape(-1, 2)


def _residuals(x, nk, imu, ob, pri, sg):
    K, L = _unpack(x, nk)
    p, th, v, bg, ba = K[:, 0:2], K[:, 2], K[:, 3:5], K[:, 5], K[:, 6:8]
    g, a, T, dt = imu
    dth, dvv, dpp = _preint(g, a, bg[:-1], ba[:-1], dt)
    ci, si = np.cos(th[:-1]), np.sin(th[:-1])
    def toi(d):                                       # R_i^T d
        return np.stack([ci * d[:, 0] + si * d[:, 1], -si * d[:, 0] + ci * d[:, 1]], 1)
    r_th = wrap(th[1:] - th[:-1] - dth) / sg["th"]
    r_v = (toi(v[1:] - v[:-1]) - dvv) / sg["v"]
    r_p = (toi(p[1:] - p[:-1] - v[:-1] * T) - dpp) / sg["p"]
    r_bg = (bg[1:] - bg[:-1]) / sg["bg"]
    r_ba = (ba[1:] - ba[:-1]) / sg["ba"]
    ki, li, z = ob
    co, so = np.cos(th[ki]), np.sin(th[ki])
    d = L[li] - p[ki]
    lx, ly = co * d[:, 0] + so * d[:, 1], -so * d[:, 0] + co * d[:, 1]
    r_b = wrap(np.arctan2(ly, lx) - z) / sg["b"]
    r_pr = (K[0] - pri["x"]) / pri["sig"]
    return np.concatenate([r_th, r_v.ravel(), r_p.ravel(), r_bg, r_ba.ravel(), r_b, r_pr])


def _jac(x, nk, imu, ob, pri, sg):
    """Dense forward-difference Jacobian (the problems have under 150 unknowns)."""
    r0 = _residuals(x, nk, imu, ob, pri, sg)
    J = np.empty((len(r0), len(x)))
    for c in range(len(x)):
        h = 1e-6 * max(1.0, abs(x[c]))
        xp = x.copy(); xp[c] += h
        J[:, c] = (_residuals(xp, nk, imu, ob, pri, sg) - r0) / h
    return J


def _triangulate(p1, th1, b1, p2, th2, b2):
    d1 = rot(th1) @ np.array([np.cos(b1), np.sin(b1)])
    d2 = rot(th2) @ np.array([np.cos(b2), np.sin(b2)])
    A = np.array([d1, -d2]).T
    if abs(np.linalg.det(A)) < 0.02:                  # near-parallel rays
        return None
    ts = np.linalg.solve(A, p2 - p1)
    if ts[0] < 0.3 or ts[1] < 0.3:
        return None
    return p1 + ts[0] * d1


def run_vio(world, s, sens, init_v_sigma=0.02):
    """Run the smoother over all keyframes; returns estimated position per keyframe (online estimate)."""
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
    lmap = {}
    out = np.zeros((nkf, 2))
    out[0] = est[0, :2]
    for j in range(1, nkf):
        i0 = max(0, j - s.window + 1)
        idx = list(range(i0, j + 1))
        nk = len(idx)
        if nk < 2:
            continue
        # initialise the newest keyframe by dead reckoning from the previous estimate
        g = np.stack([gy[sens["kf"][a]: sens["kf"][a] + step] for a in idx[:-1]])
        a_ = np.stack([ac[sens["kf"][a]: sens["kf"][a] + step] for a in idx[:-1]])
        prev = est[j - 1].copy()
        dth, dvv, dpp = _preint(g[-1:], a_[-1:], prev[5:6], prev[6:8][None], dt)
        R = rot(prev[2])
        est[j, 2] = prev[2] + dth[0]
        est[j, 3:5] = prev[3:5] + R @ dvv[0]
        est[j, :2] = prev[:2] + prev[3:5] * T + R @ dpp[0]
        est[j, 5:8] = prev[5:8]
        # observations in the window
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
            x = _triangulate(P1[:2], P1[2], by_frame[idx[a1]][l], P2[:2], P2[2], by_frame[idx[a2]][l])
            if x is not None:
                l0.append(x); lids.append(l)
        lpos = {l: n for n, l in enumerate(lids)}
        ki, li, z = [], [], []
        for l in lids:
            for a in counts[l]:
                ki.append(a); li.append(lpos[l]); z.append(by_frame[idx[a]][l])
        x0 = np.concatenate([est[idx].ravel(), np.array(l0).ravel() if l0 else np.zeros(0)])
        vs = init_v_sigma * (1 if j == 1 else 3)
        pri_sig = np.array([1e-3, 1e-3, 1e-4, vs, vs, 3e-3, 3e-2, 3e-2])
        pri = dict(x=est[idx[0]].copy(), sig=pri_sig)
        imu = (g, a_, T, dt)
        ob = (np.array(ki, dtype=int), np.array(li, dtype=int), np.array(z))
        nl = len(lids)
        try:
            sol = least_squares(_residuals, x0, jac=_jac,
                                args=(nk, imu, ob, pri, sg), x_scale="jac", max_nfev=15, xtol=1e-6, ftol=1e-6)
            K, L = _unpack(sol.x, nk)
            if np.all(np.isfinite(K)):
                est[idx] = K
                for n, l in enumerate(lids):
                    lmap[l] = L[n]
        except Exception:                             # a failed solve keeps the dead-reckoned guess
            pass
        out[j] = est[j, :2]
    return out


def drift_percent(world, sens, est):
    """Final position error and rms position error, each as a percentage of path length, and the path length (m)."""
    k = sens["kf"]
    truth = world["p"][k]
    err = np.linalg.norm(est - truth, axis=1)
    length = np.sum(np.linalg.norm(np.diff(truth, axis=0), axis=1))
    return 100 * err[-1] / length, 100 * float(np.sqrt(np.mean(err ** 2))) / length, float(length)
