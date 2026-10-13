"""A rectangular robot (length L along its heading, width W) crosses a straight gap of width g with heading error theta.

The swept cross-section is f(theta) = W cos(theta) + L sin(theta) = R sin(theta + alpha), R = hypot(L, W), alpha = atan2(W, L),
for |theta| <= atan(L/W) (f increasing in |theta|). We take W <= g < min(R, L) so the pass set is |theta| <= theta*,
theta* = asin(g / R) - alpha, and theta ~ N(0, sigma^2) (tracking error)."""
import math
from statistics import NormalDist

N01 = NormalDist()


def swept_width(L, W, theta):
    return W * math.cos(theta) + L * math.sin(abs(theta))


def _check(L, W, g):
    if not (0 < W <= L):
        raise ValueError("need 0 < W <= L")
    if g >= L:
        raise ValueError("closed form needs g < L (otherwise a second pass region near 90 degrees opens)")


def theta_star(L, W, g):
    """Largest |heading error| that still fits; 0 if g < W (never fits), pi/2-ish cap if g >= R."""
    _check(L, W, g)
    R = math.hypot(L, W)
    if g < W:
        return -1.0
    if g >= R:
        return math.pi / 2
    return math.asin(g / R) - math.atan2(W, L)


def pass_prob(L, W, g, sigma):
    """P(rectangle fits) = 2 Phi(theta*/sigma) - 1."""
    ts = theta_star(L, W, g)
    if ts < 0:
        return 0.0
    return 2 * N01.cdf(ts / sigma) - 1


def pass_prob_geometric(L, W, g, theta):
    """Independent check: rotate the four corners and test the max |y| extent against g/2."""
    c, s = math.cos(theta), math.sin(theta)
    ys = [abs(-s * x + c * y) for x in (-L / 2, L / 2) for y in (-W / 2, W / 2)]
    return 2 * max(ys) <= g + 1e-12


def required_gap(L, W, sigma, p):
    """Smallest gap with pass probability >= p: R sin(alpha + z sigma), z = Phi^-1((1+p)/2)."""
    R, a = math.hypot(L, W), math.atan2(W, L)
    z = N01.inv_cdf((1 + p) / 2)
    return R * math.sin(a + z * sigma)


def circle_twin_pass(radius, g):
    """Heading-blind circle twin: passes iff the gap holds the diameter."""
    return 1.0 if 2 * radius <= g else 0.0


def calibrated_radius(L, W, sigma0, p):
    """Inflation radius rho such that the circle twin's required gap 2 rho equals the real required gap at sigma0."""
    return required_gap(L, W, sigma0, p) / 2


def gap_for_success(L, W, sigma, p_gap, n):
    """Per-gap pass probability needed for an n-gap mission to succeed w.p. >= p_gap, and its gap (independent errors)."""
    return required_gap(L, W, sigma, p_gap ** (1.0 / n))
