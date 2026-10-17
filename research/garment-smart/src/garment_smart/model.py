"""Synthetic sensing-garment signals and a small activity classifier.

Everything is invented: each activity is a sum of sinusoids per sensor channel
with assumed amplitudes and frequencies. No public dataset is used.
"""
import numpy as np

FS = 50.0          # sample rate, Hz
WIN = 100          # window length, samples (2 s)
ACTIVITIES = ["sit", "stand", "walk", "run", "stairs", "wave"]

# sensor -> channels. IMUs give 3-axis acceleration (gravity included), strain gives 1 channel.
SENSORS = {"chest_imu": 3, "thigh_imu": 3, "wrist_imu": 3, "knee_strain": 1, "elbow_strain": 1}

# per activity: gait frequency (Hz), body-bounce amp (m/s^2), thigh swing amp, arm swing amp,
# knee flexion amp, elbow flexion amp, trunk tilt (rad; sit leans back, stairs forward)
_P = {
    "sit":    dict(f=0.0, bounce=0.05, thigh=0.05, arm=0.05, knee=0.02, elbow=0.02, tilt=-0.3, thigh_tilt=1.4),
    "stand":  dict(f=0.0, bounce=0.05, thigh=0.05, arm=0.05, knee=0.02, elbow=0.02, tilt=0.0, thigh_tilt=0.0),
    "walk":   dict(f=1.8, bounce=2.0, thigh=3.0, arm=1.5, knee=0.5, elbow=0.2, tilt=0.05, thigh_tilt=0.0),
    "run":    dict(f=2.8, bounce=7.0, thigh=8.0, arm=4.0, knee=0.9, elbow=0.5, tilt=0.15, thigh_tilt=0.0),
    "stairs": dict(f=1.5, bounce=3.0, thigh=3.5, arm=1.0, knee=0.8, elbow=0.2, tilt=0.25, thigh_tilt=0.0),
    "wave":   dict(f=1.2, bounce=0.05, thigh=0.05, arm=6.0, knee=0.02, elbow=0.8, tilt=0.0, thigh_tilt=0.0),
}
G = 9.81


def _imu(rng, t, f, amp, tilt, phase, fmul=1.0):
    """3-axis accel: gravity rotated by tilt, plus oscillation on the vertical and forward axes."""
    osc = amp * np.sin(2 * np.pi * f * fmul * t + phase)
    x = G * np.sin(tilt) + 0.5 * osc
    z = G * np.cos(tilt) + osc
    y = 0.2 * amp * np.sin(2 * np.pi * f * 0.5 * t + phase)
    return np.stack([x, y, z])


def simulate_window(activity, rng, noise=0.3, slip=0.0, person=None):
    """One window, shape (n_channels, WIN).

    noise: std of additive sensor noise (m/s^2 for IMU, rad for strain x1).
    slip: std (rad) of a random rotation of each IMU about the y axis, a garment shifting on the body.
    person: dict of multiplicative scale factors (stride frequency, amplitude); drawn if None.
    """
    p = _P[activity]
    person = person or {"fscale": 1.0, "ascale": 1.0}
    t = np.arange(WIN) / FS + rng.uniform(0, 10)
    f = p["f"] * person["fscale"]
    a = person["ascale"]
    ph = rng.uniform(0, 2 * np.pi)
    chans = {
        "chest_imu": _imu(rng, t, f, a * p["bounce"], p["tilt"], ph),
        "thigh_imu": _imu(rng, t, f, a * p["thigh"], p["thigh_tilt"], ph + 0.5),
        "wrist_imu": _imu(rng, t, f if activity != "wave" else p["f"] * person["fscale"], a * p["arm"], 0.3, ph + 1.0),
        "knee_strain": (p["knee"] * a * (0.5 + 0.5 * np.sin(2 * np.pi * f * t + ph + 0.5)) + 0.1 * p["thigh_tilt"])[None],
        "elbow_strain": (p["elbow"] * a * (0.5 + 0.5 * np.sin(2 * np.pi * (f if f else 0) * t + ph + 1.0)) + 0.3)[None],
    }
    out = []
    for name, sig in chans.items():
        if name.endswith("imu") and slip > 0:
            th = rng.normal(0, slip)
            c, s = np.cos(th), np.sin(th)
            sig = np.stack([c * sig[0] + s * sig[2], sig[1], -s * sig[0] + c * sig[2]])
        out.append(sig + rng.normal(0, noise * (0.05 if "strain" in name else 1.0), sig.shape))
    return np.concatenate(out, axis=0)


def channel_index(sensors):
    idx, k = {}, 0
    for name, n in SENSORS.items():
        idx[name] = list(range(k, k + n))
        k += n
    return [i for s in sensors for i in idx[s]]


def features(window, chans):
    """Per channel: mean, std, dominant frequency (Hz), spectral peak share."""
    feats = []
    for c in chans:
        x = window[c]
        d = x - x.mean()
        spec = np.abs(np.fft.rfft(d)) ** 2
        freqs = np.fft.rfftfreq(len(x), 1 / FS)
        k = int(np.argmax(spec[1:])) + 1
        feats += [x.mean(), x.std(), freqs[k], spec[k] / (spec.sum() + 1e-12)]
    return np.array(feats)


def make_dataset(n_per_class, rng, sensors, noise=0.3, slip=0.0, n_people=8, person_sd=0.15):
    chans = channel_index(sensors)
    people = [{"fscale": float(rng.lognormal(0, person_sd)), "ascale": float(rng.lognormal(0, person_sd))}
              for _ in range(n_people)]
    X, y, who = [], [], []
    for ci, act in enumerate(ACTIVITIES):
        for i in range(n_per_class):
            pi = i % n_people
            X.append(features(simulate_window(act, rng, noise, slip, people[pi]), chans))
            y.append(ci)
            who.append(pi)
    return np.array(X), np.array(y), np.array(who)


class Softmax:
    """Multinomial logistic regression, full-batch gradient descent, L2."""

    def __init__(self, lr=0.5, steps=400, l2=1e-3):
        self.lr, self.steps, self.l2 = lr, steps, l2

    def fit(self, X, y):
        self.mu, self.sd = X.mean(0), X.std(0) + 1e-9
        Z = (X - self.mu) / self.sd
        k = len(ACTIVITIES)
        self.W = np.zeros((Z.shape[1] + 1, k))
        Zb = np.hstack([Z, np.ones((len(Z), 1))])
        Y = np.eye(k)[y]
        for _ in range(self.steps):
            P = self._p(Zb @ self.W)
            self.W -= self.lr * (Zb.T @ (P - Y) / len(Z) + self.l2 * self.W)
        return self

    @staticmethod
    def _p(S):
        S = S - S.max(1, keepdims=True)
        E = np.exp(S)
        return E / E.sum(1, keepdims=True)

    def predict(self, X):
        Z = (X - self.mu) / self.sd
        return np.argmax(np.hstack([Z, np.ones((len(Z), 1))]) @ self.W, axis=1)


def accuracy(model, X, y):
    return float((model.predict(X) == y).mean())
