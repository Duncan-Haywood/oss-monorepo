"""Elementary scoring rules (losses; lower is better). Each elicits a property
of the outcome distribution: pinball -> tau-quantile, expectile loss ->
tau-expectile, any Bregman score -> the mean (Savage 1971; Banerjee et al. 2005;
Frongillo & Kash, convex-analytic characterisations of elicitation)."""


def pinball(r, y, tau):
    """Quantile loss; its expected value is minimised at the tau-quantile."""
    return (1.0 - tau) * (r - y) if y < r else tau * (y - r)


def expectile_loss(r, y, tau):
    """Asymmetric squared loss; minimised at the tau-expectile."""
    w = (1.0 - tau) if y < r else tau
    return w * (y - r) ** 2


def squared_loss(r, y):
    return (y - r) ** 2


def bregman_score(G, dG):
    """Loss S(r,y) = G(y) - G(r) - G'(r)(y-r) for convex G: elicits the mean."""
    return lambda r, y: G(y) - G(r) - dG(r) * (y - r)


def joint_mean_second_moment(report, y):
    """Loss for the pair (E y, E y^2); variance = s - m^2 is then recoverable
    from the 2-dimensional report although it is not elicitable in 1-d."""
    m, s = report
    return (y - m) ** 2 + (y * y - s) ** 2
