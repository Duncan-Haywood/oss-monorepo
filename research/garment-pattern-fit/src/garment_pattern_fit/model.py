"""Stylised pattern fit: a skirt-like tube pattern draped on an elliptical-section body.

Cloth: position-based dynamics (PBD; Mueller et al. 2007, J. Vis. Commun. Image Represent.
18(2):109-118) on a quad grid. Rest lengths come from the flat pattern. The body is a stack of
ellipses (waist to upper thigh), a stylised stand-in for a body scan. Everything is a toy: no
real fabric properties, no real body, no friction calibration.
"""
from dataclasses import dataclass
import numpy as np


@dataclass(frozen=True)
class Body:
    """Half-axes (a: left-right, b: front-back, metres) at knot heights z (0 = waist, downward)."""
    z: tuple = (0.0, -0.10, -0.20, -0.35, -0.60)
    a: tuple = (0.165, 0.185, 0.190, 0.188, 0.185)
    b: tuple = (0.115, 0.130, 0.135, 0.133, 0.130)

    def axes(self, z):
        zs = np.array(self.z)[::-1]
        a = np.interp(z, zs, np.array(self.a)[::-1])
        b = np.interp(z, zs, np.array(self.b)[::-1])
        return a, b


def ellipse_perimeter(a, b):
    """Ramanujan's second approximation."""
    h = ((a - b) / (a + b)) ** 2
    return np.pi * (a + b) * (1 + 3 * h / (10 + np.sqrt(4 - 3 * h)))


def body_perimeter(body, z):
    a, b = body.axes(z)
    return ellipse_perimeter(a, b)


@dataclass(frozen=True)
class Pattern:
    """Flat trapezoid: tube circumference `waist` at the top, `hem` at the bottom, `length` long."""
    waist: float
    hem: float
    length: float = 0.55

    def width(self, s):
        return self.waist + (self.hem - self.waist) * s / self.length


def simulate(pattern, body, n_theta=36, n_z=16, steps=120, iters=25, stiffness=1.0,
             gravity=9.8, dt=0.01, thickness=0.004, friction=0.5, seed=0):
    """Drape the pattern on the body. Returns dict of positions and rest lengths."""
    zs = -np.linspace(0, pattern.length, n_z)
    th = np.linspace(0, 2 * np.pi, n_theta, endpoint=False)
    P = np.zeros((n_z, n_theta, 3))
    for j, z in enumerate(zs):
        a, b = body.axes(max(z, body.z[-1]))
        per = ellipse_perimeter(a, b)
        scale = pattern.width(-z) / per          # row circumference / body ellipse circumference
        P[j, :, 0] = a * scale * np.cos(th)
        P[j, :, 1] = b * scale * np.sin(th)
        P[j, :, 2] = z
    X = P.reshape(-1, 3).copy()
    V = np.zeros_like(X)
    idx = np.arange(n_z * n_theta).reshape(n_z, n_theta)
    rows = np.repeat(np.arange(n_z), n_theta).reshape(n_z, n_theta)
    dz = pattern.length / (n_z - 1)
    pairs, rest = [], []
    # around (structural), down (structural), two shears, around skip-one (bending)
    i0, i1 = idx, np.roll(idx, -1, axis=1)
    pairs.append(np.stack([i0.ravel(), i1.ravel()], 1))
    rest.append((pattern.width(-zs) / n_theta)[:, None].repeat(n_theta, 1).ravel())
    pairs.append(np.stack([idx[:-1].ravel(), idx[1:].ravel()], 1))
    rest.append(np.full((n_z - 1) * n_theta, dz))
    wavg = (pattern.width(-zs)[:-1] + pattern.width(-zs)[1:]) / 2 / n_theta
    for sh in (-1, 1):
        pairs.append(np.stack([idx[:-1].ravel(), np.roll(idx[1:], sh, axis=1).ravel()], 1))
        rest.append(np.sqrt(wavg[:, None].repeat(n_theta, 1).ravel() ** 2 + dz ** 2))
    pairs.append(np.stack([idx.ravel(), np.roll(idx, -2, axis=1).ravel()], 1))
    rest.append(2 * (pattern.width(-zs) / n_theta)[:, None].repeat(n_theta, 1).ravel())
    pairs = np.concatenate(pairs)
    rest = np.concatenate(rest)
    kind_around = np.zeros(len(pairs), bool)
    kind_around[: n_z * n_theta] = True
    z0 = 0.0
    for _ in range(steps):
        V[:, 2] -= gravity * dt
        V *= 0.98
        Xp = X + V * dt
        for _ in range(iters):
            d = Xp[pairs[:, 1]] - Xp[pairs[:, 0]]
            L = np.linalg.norm(d, axis=1) + 1e-12
            corr = (stiffness * 0.5 * (L - rest) / L)[:, None] * d
            dx = np.zeros_like(Xp)
            cnt = np.zeros(len(Xp))
            np.add.at(dx, pairs[:, 0], corr)
            np.add.at(dx, pairs[:, 1], -corr)
            np.add.at(cnt, pairs[:, 0], 1)
            np.add.at(cnt, pairs[:, 1], 1)
            Xp += dx / cnt[:, None]
            Xp, touch = _collide(Xp, body, thickness)
            Xp[: n_theta, 2] = z0     # waistband rides on a belt: height held, radius free
        Vn = (Xp - X) / dt
        Vn[touch] *= (1.0 - friction)
        X = Xp
        V = Vn
    return dict(X=X.reshape(n_z, n_theta, 3), pairs=pairs, rest=rest, around=kind_around,
                n_z=n_z, n_theta=n_theta, z0=z0, zs=zs)


def _collide(X, body, thickness):
    a, b = body.axes(np.clip(X[:, 2], body.z[-1], 0.0))
    a = a + thickness
    b = b + thickness
    f = (X[:, 0] / a) ** 2 + (X[:, 1] / b) ** 2
    inside = f < 1.0
    s = 1.0 / np.sqrt(np.maximum(f[inside], 1e-12))
    X[inside, 0] *= s
    X[inside, 1] *= s
    return X, inside


def metrics(res, body):
    X = res["X"]
    d = X.reshape(-1, 3)[res["pairs"][:, 1]] - X.reshape(-1, 3)[res["pairs"][:, 0]]
    strain = np.linalg.norm(d, axis=1) / res["rest"] - 1.0
    st = strain[res["around"]]
    top = X[0]
    # waist ease: garment top-row perimeter vs body perimeter at the height the row ends up
    seg = np.linalg.norm(np.roll(top, -1, axis=0) - top, axis=1).sum()
    z_top = top[:, 2].mean()
    bper = body_perimeter(body, float(np.clip(z_top, body.z[-1], 0)))
    slip = res["z0"] - z_top
    hem = X[-1]
    a, b = body.axes(float(np.clip(hem[:, 2].mean(), body.z[-1], 0)))
    hem_r = np.sqrt(hem[:, 0] ** 2 + hem[:, 1] ** 2).mean()
    return dict(strain_mean=float(st.mean()), strain_p95=float(np.percentile(np.abs(st), 95)),
                strain_max=float(np.abs(strain).max()), slip=float(slip),
                waist_ease=float(seg / bper - 1.0), hem_standoff=float(hem_r - np.sqrt(a * b)))


def cost(m, w_strain=1.0, w_ease=1.0, tol=0.04):
    """Weighted misfit. strain_p95 (fraction of rest length, 0.05 = 5%) is scaled by 0.05. Waist ease
    is the top-ring perimeter over the body perimeter minus 1 at the waist; the band 0 to `tol`
    is free (a close fit), and a ring outside it costs the excess scaled by `tol`. Weights and
    tolerance are assumptions, not a fit standard."""
    ease = m["waist_ease"]
    off = max(0.0, ease - tol) + max(0.0, -ease)
    return w_strain * m["strain_p95"] / 0.05 + w_ease * off / tol


def evaluate(pattern, body, **kw):
    res = simulate(pattern, body, **kw)
    return metrics(res, body)
