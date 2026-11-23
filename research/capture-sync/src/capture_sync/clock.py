"""A recorder whose clock rate wanders (step 6c).

Constant-rate twins (steps 4d-6b) record device 1 with `wacd.sim_sro`: a sound at sample m of the source lands
at sample m (1 + eps 1e-6). Here the rate is a trajectory eps(m) in ppm, one value per source sample, and the
sound at source sample m lands at device-1 sample

    phi(m) = m + 1e-6 sum_{j < m} eps(j),

which is m (1 + eps 1e-6) when eps is constant. Device 1's sample n then holds the source at psi(n) =
phi^-1(n), read with a Kaiser-windowed sinc interpolator (`frac_read`).

The warm-up profile is the shape Gburrek, Schmalenstroeer and Haeb-Umbach (ICASSP 2022) describe for a device
just switched on: its rate moves by a few ppm over a few minutes as the crystal warms, then settles. Here it is
a first-order step, eps(t) = eps_s + w (1 - exp(-t / tau)), with t from power-on; w and tau are swept, since
the paper's own trajectories (zenodo) could not be fetched from this session.
"""
import numpy as np


def warmup_ppm(t, eps_s, w, tau):
    """Rate (ppm) at times t (s) after power-on: static eps_s plus a first-order warm-up of w ppm, constant tau."""
    t = np.asarray(t, float)
    if w == 0.0:
        return np.full(t.shape, float(eps_s))
    return eps_s + w * (1.0 - np.exp(-t / tau))


def warmup_integral(t, w, tau):
    """Integral of the warm-up term from 0 to t (ppm s): w (t - tau (1 - exp(-t / tau)))."""
    t = np.asarray(t, float)
    if w == 0.0:
        return np.zeros(t.shape)
    return w * (t - tau * (1.0 - np.exp(-t / tau)))


def phi(eps_ppm):
    """Device-1 sample position of each source sample m (float array, same length as eps_ppm)."""
    e = np.asarray(eps_ppm, float) * 1e-6
    out = np.arange(len(e), dtype=float)
    out[1:] += np.cumsum(e[:-1])
    return out


def frac_read(x, pos, half=16, beta=8.0, cutoff=0.95, chunk=200_000, phases=2048):
    """x read at fractional sample positions pos: Kaiser-windowed sinc over 2 half taps, zero outside x. The
    kernel is tabulated at `phases` fractional offsets and linearly interpolated between them."""
    x = np.asarray(x, float)
    pos = np.asarray(pos, float)
    out = np.zeros(len(pos))
    k = np.arange(-half + 1, half + 1)
    d = np.arange(phases + 1)[:, None] / phases - k[None, :]  # tap distance for each tabulated offset
    H = cutoff * np.sinc(cutoff * d) * _kaiser(d, half, beta)
    xp = np.concatenate([np.zeros(half), x, np.zeros(half + 1)])
    for a in range(0, len(pos), chunk):
        p = pos[a:a + chunk]
        i = np.floor(p).astype(np.int64)
        j = (p - i) * phases
        j0 = np.minimum(j.astype(np.int64), phases - 1)
        u = (j - j0)[:, None]
        h = (1.0 - u) * H[j0] + u * H[j0 + 1]
        idx = i[:, None] + k[None, :] + half
        v = xp[np.clip(idx, 0, len(xp) - 1)] * ((idx >= 0) & (idx < len(xp)))
        out[a:a + chunk] = np.sum(v * h, axis=1)
    return out


def _kaiser(d, half, beta):
    r = np.clip(d / half, -1.0, 1.0)
    return np.i0(beta * np.sqrt(1.0 - r * r)) / np.i0(beta)


def record(x, eps_ppm):
    """(y, phi): x as recorded by a device whose rate is eps_ppm (ppm, one value per sample of x)."""
    ph = phi(eps_ppm)
    n = np.arange(int(np.floor(ph[-1])) + 1, dtype=float)
    psi = np.interp(n, ph, np.arange(len(ph), dtype=float))
    return frac_read(x, psi), ph
