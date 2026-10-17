"""Small MLP policy: trained by behaviour cloning (NumPy Adam), post-training quantised, integer inference."""
import numpy as np
from . import arm


def make_dataset(n_moves, seed, Ts=0.002, dt=0.0005):
    """Teacher states along its own closed loop plus noise-perturbed starts (so the net sees off-reference states)."""
    rng = np.random.default_rng(seed)
    X, Y = [], []
    for _ in range(n_moves):
        qa, qb, T = arm.random_move(rng)
        q = qa + rng.normal(0, 0.05, 2)
        qd = rng.normal(0, 0.2, 2)
        tau = np.zeros(2)
        n = int(round((T + 0.15) / dt))
        every = int(round(Ts / dt))
        for k in range(n):
            t = k * dt
            if k % every == 0:
                qr, qdr, qddr = arm.min_jerk(qa, qb, T, t)
                tau = arm.teacher(q, qd, qr, qdr, qddr)
                if k % (every * 3) == 0:
                    X.append(arm.features(q, qd, qr, qdr)); Y.append(tau / arm.TAU_MAX)
            q, qd = arm.step(q, qd, tau, dt)
    return np.array(X), np.array(Y)


class MLP:
    def __init__(self, hidden, seed=0, n_in=8, n_out=2):
        rng = np.random.default_rng(seed)
        sizes = [n_in] + list(hidden) + [n_out]
        self.W = [rng.normal(0, np.sqrt(2 / a), (b, a)) for a, b in zip(sizes[:-1], sizes[1:])]
        self.b = [np.zeros(b) for b in sizes[1:]]

    @property
    def sizes(self):
        return [self.W[0].shape[1]] + [w.shape[0] for w in self.W]

    def forward(self, X, keep=False):
        acts = [X]
        for i, (W, b) in enumerate(zip(self.W, self.b)):
            X = X @ W.T + b
            if i < len(self.W) - 1:
                X = np.maximum(X, 0)
            acts.append(X)
        return (np.clip(X, -1, 1), acts) if keep else np.clip(X, -1, 1)

    def fit(self, X, Y, epochs=60, lr=3e-3, batch=256, seed=0):
        rng = np.random.default_rng(seed)
        params = self.W + self.b
        m = [np.zeros_like(p) for p in params]; v = [np.zeros_like(p) for p in params]
        t = 0
        for ep in range(epochs):
            idx = rng.permutation(len(X))
            for s in range(0, len(X), batch):
                xb, yb = X[idx[s:s + batch]], Y[idx[s:s + batch]]
                out, acts = self.forward(xb, keep=True)
                g = (out - yb) / len(xb)
                g = g * (np.abs(acts[-1]) < 1)       # clip gradient
                gW, gb = [None] * len(self.W), [None] * len(self.W)
                for i in range(len(self.W) - 1, -1, -1):
                    gW[i] = g.T @ acts[i]; gb[i] = g.sum(0)
                    if i:
                        g = (g @ self.W[i]) * (acts[i] > 0)
                t += 1
                lr_t = lr * (1 - ep / epochs) + 1e-5
                for j, (p, gr) in enumerate(zip(params, gW + gb)):
                    m[j] = 0.9 * m[j] + 0.1 * gr; v[j] = 0.999 * v[j] + 0.001 * gr * gr
                    p -= lr_t * (m[j] / (1 - 0.9 ** t)) / (np.sqrt(v[j] / (1 - 0.999 ** t)) + 1e-8)
        return self

    def macs(self):
        return sum(w.size for w in self.W)


class QMLP:
    """Symmetric per-tensor integer quantisation: `bits`-bit weights, 8-bit activations, int32 accumulators."""
    def __init__(self, net, X_calib, bits=8):
        self.bits = bits
        qmax = 2 ** (bits - 1) - 1
        self.Wq, self.ws = [], []
        for W in net.W:
            s = np.abs(W).max() / qmax
            self.Wq.append(np.clip(np.round(W / s), -qmax - 1, qmax).astype(np.int64)); self.ws.append(s)
        _, acts = net.forward(X_calib, keep=True)
        self.a_scale = [max(np.abs(a).max(), 1e-6) / 127 for a in acts]
        self.bq = [np.round(b / (self.ws[i] * self.a_scale[i])).astype(np.int64) for i, b in enumerate(net.b)]
        self.sizes = net.sizes

    def forward_int(self, x):
        h = np.clip(np.round(x / self.a_scale[0]), -128, 127).astype(np.int64)
        for i, (Wq, bq) in enumerate(zip(self.Wq, self.bq)):
            acc = Wq @ h + bq                       # integer MACs
            if i < len(self.Wq) - 1:
                acc = np.maximum(acc, 0)
                h = np.clip(np.round(acc * (self.ws[i] * self.a_scale[i]) / self.a_scale[i + 1]), 0, 127).astype(np.int64)
            else:
                return np.clip(acc * self.ws[i] * self.a_scale[i], -1, 1)
