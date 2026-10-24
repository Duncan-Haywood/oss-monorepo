"""Tiny causal transformer (one block, one head, tied embeddings, no layer norm) in numpy with a hand-written backward
pass, so the harness needs only numpy. Parameters live in one flat vector so that a DiLoCo round is vector arithmetic.
  x = E[tok] + P[pos];  a = x + softmax(mask(x Wq (x Wk)^T / sqrt d)) x Wv Wo;  y = a + gelu(a W1 + b1) W2 + b2;  logits = y E^T
Loss is mean next-token cross entropy in nats. Checked against finite differences in tests/test_model.py."""
import numpy as np

__all__ = ["Config", "n_params", "init", "loss_and_grad", "loss"]


class Config:
    def __init__(self, vocab, ctx=32, d=32, ff=64):
        self.vocab, self.ctx, self.d, self.ff = vocab, ctx, d, ff

    def shapes(self):
        v, c, d, f = self.vocab, self.ctx, self.d, self.ff
        return [("E", (v, d)), ("P", (c, d)), ("Wq", (d, d)), ("Wk", (d, d)), ("Wv", (d, d)), ("Wo", (d, d)),
                ("W1", (d, f)), ("b1", (f,)), ("W2", (f, d)), ("b2", (d,))]


def n_params(cfg):
    return sum(int(np.prod(s)) for _, s in cfg.shapes())


def _views(cfg, flat):
    out, i = {}, 0
    for name, s in cfg.shapes():
        k = int(np.prod(s))
        out[name] = flat[i:i + k].reshape(s)
        i += k
    return out


def init(cfg, seed=0):
    rng = np.random.default_rng(seed)
    flat = np.zeros(n_params(cfg))
    p = _views(cfg, flat)
    for name, s in cfg.shapes():
        if name.startswith("b"):
            continue
        scale = 0.02 if name in ("E", "P") else 1.0 / np.sqrt(s[0])
        if name in ("Wo", "W2"):
            scale *= 0.5
        p[name][...] = rng.normal(0, scale, s)
    return flat


_C = np.sqrt(2.0 / np.pi)


def _gelu(z):
    return 0.5 * z * (1 + np.tanh(_C * (z + 0.044715 * z ** 3)))


def _dgelu(z):
    t = np.tanh(_C * (z + 0.044715 * z ** 3))
    return 0.5 * (1 + t) + 0.5 * z * (1 - t * t) * _C * (1 + 3 * 0.044715 * z * z)


def loss_and_grad(cfg, flat, X, Y, want_grad=True):
    """X, Y: int arrays (B, T) with T <= ctx. Returns (loss, grad flat vector or None)."""
    p = _views(cfg, flat)
    B, T = X.shape
    d = cfg.d
    x = p["E"][X] + p["P"][:T]
    q, k, v = x @ p["Wq"], x @ p["Wk"], x @ p["Wv"]
    sc = q @ k.transpose(0, 2, 1) / np.sqrt(d)
    sc = np.where(np.tril(np.ones((T, T), bool)), sc, -1e30)
    sc = sc - sc.max(-1, keepdims=True)
    att = np.exp(sc)
    att /= att.sum(-1, keepdims=True)
    ctxv = att @ v
    a = x + ctxv @ p["Wo"]
    h = a @ p["W1"] + p["b1"]
    g = _gelu(h)
    y = a + g @ p["W2"] + p["b2"]
    logits = y @ p["E"].T
    z = logits - logits.max(-1, keepdims=True)
    lse = np.log(np.exp(z).sum(-1))
    nll = lse - np.take_along_axis(z, Y[..., None], -1)[..., 0]
    L = float(nll.mean())
    if not want_grad:
        return L, None
    grad = np.zeros_like(flat)
    gr = _views(cfg, grad)
    dl = np.exp(z - lse[..., None])
    np.put_along_axis(dl, Y[..., None], np.take_along_axis(dl, Y[..., None], -1) - 1, -1)
    dl /= B * T
    gr["E"] += (dl.reshape(-1, cfg.vocab).T @ y.reshape(-1, d))
    dy = dl @ p["E"]
    gr["W2"] += g.reshape(-1, cfg.ff).T @ dy.reshape(-1, d)
    gr["b2"] += dy.sum((0, 1))
    dh = (dy @ p["W2"].T) * _dgelu(h)
    gr["W1"] += a.reshape(-1, d).T @ dh.reshape(-1, cfg.ff)
    gr["b1"] += dh.sum((0, 1))
    da = dy + dh @ p["W1"].T
    gr["Wo"] += ctxv.reshape(-1, d).T @ da.reshape(-1, d)
    dctx = da @ p["Wo"].T
    datt = dctx @ v.transpose(0, 2, 1)
    dv = att.transpose(0, 2, 1) @ dctx
    dsc = att * (datt - (datt * att).sum(-1, keepdims=True)) / np.sqrt(d)
    dq = dsc @ k
    dk = dsc.transpose(0, 2, 1) @ q
    gr["Wq"] += x.reshape(-1, d).T @ dq.reshape(-1, d)
    gr["Wk"] += x.reshape(-1, d).T @ dk.reshape(-1, d)
    gr["Wv"] += x.reshape(-1, d).T @ dv.reshape(-1, d)
    dx = da + dq @ p["Wq"].T + dk @ p["Wk"].T + dv @ p["Wv"].T
    np.add.at(gr["E"], X, dx)
    gr["P"][:T] += dx.sum(0)
    return L, grad


def loss(cfg, flat, X, Y):
    return loss_and_grad(cfg, flat, X, Y, want_grad=False)[0]
