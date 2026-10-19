"""Synthetic RGB + low-resolution thermal scenes, and per-pixel detectors built on them.

A scene is a 64x64 hi-res truth: reflectance, temperature, a person mask. `render` turns it into a
grey camera image (light level, smoke, shot and read noise) and a thermal image (block-averaged,
NETD noise, bilinear upsampled), optionally with the thermal camera displaced by `shift` pixels.
Detectors are logistic regressions on local-contrast features; recall is counted per person at a
threshold that allows `fa` false alarms per person-free image. Everything is simulated.
"""
from dataclasses import dataclass, replace
import numpy as np


@dataclass(frozen=True)
class Setup:
    n: int = 64              # scene side in RGB pixels
    k: int = 4               # thermal block size: thermal image is n/k square
    light: float = 1.0       # illumination, 1 = bright
    smoke_t: float = 1.0     # visible transmittance of the smoke, 1 = clear
    lwir_leak: float = 0.1   # fraction of the visible extinction that the thermal band suffers
    photons: float = 100.0   # shot-noise photon count at signal 1 and light 1
    read: float = 0.01       # RGB read noise (signal units)
    netd: float = 0.3        # thermal noise, kelvin
    person_dT: float = 6.0   # person surface warmer than background, kelvin
    decoy_dT: float = 3.0    # warm non-person objects
    max_people: int = 3
    max_decoys: int = 2
    shift: float = 0.0       # thermal camera displaced by this many RGB pixels (x)


def _smooth(rng, n, sigma):
    f = np.fft.fftfreq(n)
    g = np.exp(-2 * (np.pi * sigma) ** 2 * (f[:, None] ** 2 + f[None, :] ** 2))
    x = np.real(np.fft.ifft2(np.fft.fft2(rng.standard_normal((n, n))) * g))
    return x / x.std()


def _blob(n, cx, cy, rx, ry):
    y, x = np.mgrid[0:n, 0:n]
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0


def _rect(n, cx, cy, w, h):
    y, x = np.mgrid[0:n, 0:n]
    return (abs(x - cx) <= w / 2) & (abs(y - cy) <= h / 2)


def make_scene(s: Setup, rng, n_people=None):
    """Truth fields: reflectance R, temperature T (kelvin), person mask. n_people None draws 1..max."""
    n = s.n
    R = 0.5 + 0.08 * _smooth(rng, n, 3.0)
    T = 285.0 + 1.0 * _smooth(rng, n, 4.0)
    mask = np.zeros((n, n), bool)
    for _ in range(rng.integers(2, 5)):                     # cold clutter: contrast in RGB, nothing in thermal
        r = _rect(n, rng.uniform(5, n - 5), rng.uniform(5, n - 5), rng.uniform(4, 9), rng.uniform(6, 12))
        R = np.where(r, R + rng.choice([-1, 1]) * rng.uniform(0.05, 0.15), R)
    for _ in range(rng.integers(0, s.max_decoys + 1)):      # warm decoys: contrast in thermal, ordinary in RGB
        r = _rect(n, rng.uniform(5, n - 5), rng.uniform(5, n - 5), rng.uniform(4, 8), rng.uniform(6, 11))
        T = np.where(r, T + s.decoy_dT * rng.uniform(0.7, 1.3), T)
        R = np.where(r, R + rng.normal(0, 0.03), R)
    k = int(rng.integers(1, s.max_people + 1)) if n_people is None else n_people
    for _ in range(k):
        sc = rng.uniform(0.8, 1.2)
        p = _blob(n, rng.uniform(6, n - 6), rng.uniform(8, n - 8), 2.5 * sc, 6.0 * sc)
        T = np.where(p, T + s.person_dT * rng.uniform(0.7, 1.3), T)
        R = np.where(p, R + rng.choice([-1, 1]) * rng.uniform(0.15, 0.3), R)    # clothing darker or lighter than the background
        mask |= p
    return R, T, mask


def _shift_x(img, dx):
    """Shift right by dx pixels (bilinear, edge replicate)."""
    n = img.shape[1]
    x = np.clip(np.arange(n) - dx, 0, n - 1)
    x0 = np.floor(x).astype(int)
    x1 = np.minimum(x0 + 1, n - 1)
    w = x - x0
    return img[:, x0] * (1 - w) + img[:, x1] * w


def _upsample(t, k):
    """Bilinear upsample a thermal image by k (pixel centres at block centres)."""
    m = t.shape[0]
    pos = (np.arange(m * k) + 0.5) / k - 0.5
    i0 = np.clip(np.floor(pos).astype(int), 0, m - 1)
    i1 = np.minimum(i0 + 1, m - 1)
    w = np.clip(pos - i0, 0, 1)
    a = t[i0] * (1 - w)[:, None] + t[i1] * w[:, None]
    return a[:, i0] * (1 - w)[None, :] + a[:, i1] * w[None, :]


def render(s: Setup, R, T, rng):
    """Return (grey RGB image n x n, thermal image upsampled to n x n)."""
    air = 0.8
    sig = s.light * (s.smoke_t * R + (1 - s.smoke_t) * air)
    rgb = sig + rng.standard_normal(sig.shape) * np.sqrt(np.maximum(sig, 0) / s.photons + s.read ** 2)
    tt = 1 - s.lwir_leak * (1 - s.smoke_t)
    Tobs = tt * T + (1 - tt) * 285.0
    Tobs = _shift_x(Tobs, s.shift)
    m = s.n // s.k
    low = Tobs.reshape(m, s.k, m, s.k).mean(axis=(1, 3))
    low = low + rng.standard_normal(low.shape) * s.netd
    return rgb, _upsample(low, s.k)


def _box(img, w):
    p = w // 2
    q = np.pad(img, p, mode="edge")
    c = np.cumsum(np.cumsum(np.pad(q, ((1, 0), (1, 0))), 0), 1)
    return (c[w:, w:] - c[:-w, w:] - c[w:, :-w] + c[:-w, :-w]) / (w * w)


def _mad_norm(x):
    return x / (1.4826 * np.median(np.abs(x - np.median(x))) + 1e-12)


def features(rgb, th):
    """Per-pixel features: RGB contrast magnitudes (sign of clothing is unknown) and signed thermal contrast."""
    ra, rb = _box(rgb, 3) - _box(rgb, 9), _box(rgb, 7) - _box(rgb, 21)
    ta, tb = _box(th, 3) - _box(th, 9), _box(th, 7) - _box(th, 21)
    ra, rb = np.abs(_mad_norm(ra)), np.abs(_mad_norm(rb))
    ta, tb = _mad_norm(ta), _mad_norm(tb)
    return {"rgb": np.stack([ra, rb, ra * rb], -1).reshape(-1, 3),
            "thermal": np.stack([ta, tb, ta * tb, np.maximum(tb, 0) ** 2], -1).reshape(-1, 4)}


def fit_logistic(X, y, iters=20, ridge=1e-3):
    mu, sd = X.mean(0), X.std(0) + 1e-9
    A = np.hstack([(X - mu) / sd, np.ones((len(X), 1))])
    w = np.zeros(A.shape[1])
    for _ in range(iters):
        z = np.clip(A @ w, -30, 30)
        p = 1 / (1 + np.exp(-z))
        g = A.T @ (p - y) + ridge * w
        H = (A * (p * (1 - p) + 1e-6)[:, None]).T @ A + ridge * np.eye(len(w))
        w = w - np.linalg.solve(H, g)
    return mu, sd, w


def _logit(model, X):
    mu, sd, w = model
    return np.hstack([(X - mu) / sd, np.ones((len(X), 1))]) @ w


@dataclass
class Detector:
    kind: str       # "rgb", "thermal", "early", "late"
    models: dict
    n: int

    def score(self, rgb, th):
        f = features(rgb, th)
        if self.kind == "rgb":
            z = _logit(self.models["rgb"], f["rgb"])
        elif self.kind == "thermal":
            z = _logit(self.models["thermal"], f["thermal"])
        elif self.kind == "late":     # sum of the two single-sensor log-odds (independence assumed)
            z = _logit(self.models["rgb"], f["rgb"]) + _logit(self.models["thermal"], f["thermal"])
        else:                         # early: one joint model, plus products across sensors
            z = _logit(self.models["early"], _joint(f))
        return _box(z.reshape(self.n, self.n), 5)


def _joint(f):
    r, t = f["rgb"], f["thermal"]
    return np.hstack([r, t, r[:, [1]] * t[:, [1]], r[:, [0]] * t[:, [1]], r[:, [1]] * t[:, [0]]])


def train_detectors(s: Setup, n_scenes, seed, jitter=0.0):
    """Fit all four detectors on n_scenes scenes at setup s; jitter draws the thermal shift in [-jitter, jitter]."""
    rng = np.random.default_rng(seed)
    F = {"rgb": [], "thermal": [], "joint": []}
    Y = []
    for _ in range(n_scenes):
        R, T, mask = make_scene(s, rng)
        sh = replace(s, shift=rng.uniform(-jitter, jitter)) if jitter else s
        rgb, th = render(sh, R, T, rng)
        f = features(rgb, th)
        F["rgb"].append(f["rgb"]); F["thermal"].append(f["thermal"]); F["joint"].append(_joint(f))
        Y.append(mask.ravel().astype(float))
    y = np.concatenate(Y)
    models = {"rgb": fit_logistic(np.vstack(F["rgb"]), y), "thermal": fit_logistic(np.vstack(F["thermal"]), y),
              "early": fit_logistic(np.vstack(F["joint"]), y)}
    return {k: Detector(k, models, s.n) for k in ("rgb", "thermal", "early", "late")}


def train_detector(s, n_scenes, seed, kind, jitter=0.0):
    return train_detectors(s, n_scenes, seed, jitter)[kind]


def evaluate(dets, s: Setup, n_test, seed, fa=0.1):
    """Person recall for each detector at a threshold giving `fa` false alarms per person-free image.

    The threshold is the (1-fa) quantile of the per-image maximum score over person-free scenes (decoys and
    clutter present). A person counts as found when the score maximum inside its dilated mask beats it.
    """
    rng = np.random.default_rng(seed)
    neg = {k: [] for k in dets}
    for _ in range(n_test):
        R, T, _ = make_scene(s, rng, n_people=0)
        rgb, th = render(s, R, T, rng)
        for k, d in dets.items():
            neg[k].append(d.score(rgb, th).max())
    thr = {k: np.quantile(v, 1 - fa) for k, v in neg.items()}
    hit = {k: 0 for k in dets}
    tot = 0
    for _ in range(n_test):
        R, T, mask = make_scene(s, rng)
        rgb, th = render(s, R, T, rng)
        lab = _label_people(mask)
        sc = {k: d.score(rgb, th) for k, d in dets.items()}
        for m in lab:
            tot += 1
            for k in dets:
                hit[k] += sc[k][m].max() > thr[k]
    return {k: hit[k] / tot for k in dets}


def _label_people(mask):
    """Connected components of the person mask, each dilated by 1 pixel (touching people merge)."""
    n = mask.shape[0]
    seen = np.zeros_like(mask)
    out = []
    for i, j in zip(*np.nonzero(mask)):
        if seen[i, j]:
            continue
        stack, comp = [(i, j)], np.zeros_like(mask)
        seen[i, j] = True
        while stack:
            a, b = stack.pop()
            comp[a, b] = True
            for da, db in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                x, y = a + da, b + db
                if 0 <= x < n and 0 <= y < n and mask[x, y] and not seen[x, y]:
                    seen[x, y] = True
                    stack.append((x, y))
        out.append(_box(comp.astype(float), 3) > 0)
    return out
