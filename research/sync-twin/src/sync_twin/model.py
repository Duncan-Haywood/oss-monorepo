"""Two sensors observe the same smooth latent signal x(t) (zero-mean Gaussian process, squared-exponential kernel, variance s2,
length scale ell).  Sensor A is on the reference clock with noise variance a.  Sensor B has noise variance b and a clock error
u = delta + J (constant offset delta, jitter J ~ N(0, s^2) independent per sample), so it reports x(t-u) + noise.  The twin's
sensors share one simulated clock (u = 0).  A fused estimate is w*y_A + (1-w)*y_B.
Everything is closed form: E[(x(t)-x(t-u))^2] = 2*s2*(1 - E exp(-u^2/(2 ell^2))) and E exp(-u^2/(2 ell^2)) for Gaussian u is
(1+s^2/ell^2)^(-1/2) * exp(-delta^2/(2(ell^2+s^2)))."""
import math

__all__ = ["timing_var", "fused_mse", "twin_weight", "twin_claim", "real_mse_twin_weight", "opt_weight", "opt_mse",
           "breakeven_g", "budget_g", "g_to_rms", "rms_to_g", "excess_ratio", "randomized_weight", "wrong_range_mse"]


def timing_var(s2, ell, delta, s):
    """g = E[(x(t) - x(t-u))^2] for u ~ N(delta, s^2): the variance the clock error adds to sensor B's reading."""
    r = ell * ell
    return 2.0 * s2 * (1.0 - math.exp(-delta * delta / (2.0 * (r + s * s)))/ math.sqrt(1.0 + s * s / r))


def fused_mse(w, a, b, g):
    """MSE of w*yA + (1-w)*yB when sensor B carries extra error variance g (signal-independent of the noises)."""
    return w * w * a + (1.0 - w) * (1.0 - w) * (b + g)


def twin_weight(a, b):
    """Inverse-variance weight on A chosen in a twin with synchronised clocks."""
    return b / (a + b)


def twin_claim(a, b):
    """MSE the twin reports for its own weight."""
    return a * b / (a + b)


def real_mse_twin_weight(a, b, g):
    """Real MSE of the twin-designed fusion: ab/(a+b) + a^2 g/(a+b)^2."""
    return fused_mse(twin_weight(a, b), a, b, g)


def opt_weight(a, b, g):
    """Best weight when B's timing error variance g is known."""
    return (b + g) / (a + b + g)


def opt_mse(a, b, g):
    return a * (b + g) / (a + b + g)


def excess_ratio(a, b, g):
    """Real MSE / twin claim for the twin-designed fusion: 1 + a g / (b (a+b))."""
    return real_mse_twin_weight(a, b, g) / twin_claim(a, b)


def breakeven_g(a, b):
    """Timing variance at which twin-weight fusion is exactly as bad as sensor A alone: g = a + b."""
    return a + b


def budget_g(a, b, eps):
    """Largest g such that real MSE <= (1+eps)*claim for the twin-designed fusion: g = eps*b*(a+b)/a."""
    return eps * b * (a + b) / a


def g_to_rms(g, s2, ell):
    """Pure-offset (s=0) timing error delta with 2 s2 (1 - exp(-delta^2/(2 ell^2))) = g."""
    if g >= 2.0 * s2:
        return math.inf
    return ell * math.sqrt(-2.0 * math.log(1.0 - g / (2.0 * s2)))


def rms_to_g(rms, s2, ell):
    return timing_var(s2, ell, rms, 0.0)


def randomized_weight(a, b, g_r):
    """Weight learned in a twin that randomises B's clock so its timing variance is g_r (exact minimiser)."""
    return opt_weight(a, b, g_r)


def wrong_range_mse(a, b, g_true, g_r):
    """Real MSE of the weight learned under randomised timing variance g_r when the real one is g_true."""
    return fused_mse(randomized_weight(a, b, g_r), a, b, g_true)
