"""A scalar Kalman filter tuned in a twin whose sensor is ideal, deployed on a quantizing sensor.
Plant x' = a x + w (var Q).  Twin sensor y = x + v (var R).  Real sensor y = D*round((x+v)/D) (step D).
The gain is a fixed number K.  If the quantization error were independent white noise of variance D^2/12
(Sheppard), the real error would be mse(K, a, Q, R + D^2/12); `simulate_mse` measures the truth."""
import math, random

__all__ = ["prior_var", "opt_gain", "mse", "sheppard_gain", "quantize", "simulate_mse", "best_gain"]


def prior_var(a, Q, R):
    b = a * a * R + Q - R
    return 0.5 * (b + math.sqrt(b * b + 4.0 * Q * R))


def opt_gain(a, Q, R):
    p = prior_var(a, Q, R)
    return p / (p + R)


def mse(K, a, Q, R):
    """Exact stationary posterior variance under fixed gain K with white sensor noise of variance R."""
    d = 1.0 - (1.0 - K) ** 2 * a * a
    return math.inf if d <= 0.0 else ((1.0 - K) ** 2 * Q + K * K * R) / d


def sheppard_gain(a, Q, R, D):
    """Gain for the noise-inflated model R + D^2/12."""
    return opt_gain(a, Q, R + D * D / 12.0)


def quantize(y, D):
    return y if D == 0 else D * math.floor(y / D + 0.5)


def simulate_mse(gains, a, Q, R, D, n, seed=0, burn=500):
    """Real posterior MSE of each fixed gain, all driven by the same noise stream (paired)."""
    rng = random.Random(seed)
    sq, sr = math.sqrt(Q), math.sqrt(R)
    x = 0.0
    xh = [0.0] * len(gains)
    acc = [0.0] * len(gains)
    for k in range(n + burn):
        x = a * x + rng.gauss(0, sq)
        y = quantize(x + rng.gauss(0, sr), D)
        for i, K in enumerate(gains):
            p = a * xh[i]
            xh[i] = p + K * (y - p)
            if k >= burn:
                acc[i] += (x - xh[i]) ** 2
    return [s / n for s in acc]


def best_gain(a, Q, R, D, n, seed=0, grid=None):
    """Simulation-optimal gain on a grid; returns (K*, mse*, gains, mses)."""
    grid = grid or [0.02 * i for i in range(1, 50)]
    m = simulate_mse(grid, a, Q, R, D, n, seed)
    i = min(range(len(grid)), key=m.__getitem__)
    return grid[i], m[i], grid, m
