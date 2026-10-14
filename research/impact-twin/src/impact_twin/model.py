"""Impact twin.  Real system: a point mass dropped from height h0 onto a rigid floor under gravity g, Newton restitution
coefficient e in (0,1) at each impact.  Event-driven truth is closed form: impact speeds v_n = v1 e^(n-1), v1 = sqrt(2 g h0),
infinitely many impacts in the finite Zeno time T = (v1/g)(1+e)/(1-e).
Twin: fixed-step semi-implicit Euler (v -= g dt; y += v dt) with a penetration test after the step ("clamp": put y = 0 and
reflect v -> -e v; "mirror": y -> -y; "locate": interpolate the impact instant inside the step, reflect there, finish the step).
"""
import math

G = 9.81


def v1(h0, g=G):
    return math.sqrt(2.0 * g * h0)


def zeno_time(e, h0=1.0, g=G):
    """Time of the (infinite) sequence of impacts' accumulation point: (v1/g)(1+e)/(1-e)."""
    return v1(h0, g) / g * (1 + e) / (1 - e)


def impact_time(n, e, h0=1.0, g=G):
    """Time of the n-th impact (n >= 1): (v1/g)(1 + 2(e + ... + e^(n-1)))."""
    return v1(h0, g) / g * (1 + 2 * e * (1 - e ** (n - 1)) / (1 - e))


def last_time_above(delta, e, h0=1.0, g=G):
    """Last instant the exact height exceeds delta (0 < delta < h0): down-crossing of the last bounce whose apex exceeds delta."""
    n = 0
    while h0 * e ** (2 * (n + 1)) > delta:
        n += 1
    if n == 0:                        # first rebound apex h0 e^2 <= delta: last above delta on the first fall
        return math.sqrt(2 * (h0 - delta) / g)
    vn = v1(h0, g) * e ** n          # launch speed of bounce n (apex h0 e^(2n))
    return impact_time(n, e, h0, g) + (vn + math.sqrt(vn * vn - 2 * g * delta)) / g


def settle_error_factor(e):
    """d ln T / d e = 2/(1-e^2): relative error in the Zeno time per unit error in e."""
    return 2.0 / (1 - e * e)


def simulate(e, dt, scheme="clamp", T=10.0, h0=1.0, g=G, log=None):
    """Fixed-step twin.  Returns (ys, impacts, apex1): heights every dt (from t=0), impact step count, and the apex height of
    the first rebound (max y between the first and second impact steps).  If `log` is a list, the time of every impact step
    (the end of the step in which the penetration test fired) is appended to it."""
    n = int(round(T / dt))
    y, v = h0, 0.0
    ys = [y]
    impacts = 0
    apex1 = 0.0
    for _ in range(n):
        v2 = v - g * dt
        yn = y + v2 * dt
        if yn < 0.0:
            if scheme == "clamp":
                yn, v2 = 0.0, -e * v2
            elif scheme == "mirror":
                yn, v2 = -yn, -e * v2
            elif scheme == "locate":
                f = y / (y - yn)                     # fraction of the step before contact
                vi = v + (v2 - v) * f
                vr = -e * vi
                rem = (1 - f) * dt
                v2 = vr - g * rem
                yn = max(vr * rem, 0.0)
            else:
                raise ValueError(scheme)
            impacts += 1
            if log is not None:
                log.append((len(ys)) * dt)
        if impacts == 1 and yn > apex1:
            apex1 = yn
        v, y = v2, yn
        ys.append(y)
    return ys, impacts, apex1


def e_eff(e, dt, scheme="clamp", h0=1.0, g=G):
    """Apparent restitution of the twin: sqrt(apex of first rebound / h0).  Exact system: e."""
    T = 2.5 * math.sqrt(2 * h0 / g)
    _, _, a1 = simulate(e, dt, scheme, T=T, h0=h0, g=g)
    return math.sqrt(a1 / h0)


def last_above(ys, dt, delta):
    for i in range(len(ys) - 1, -1, -1):
        if ys[i] > delta:
            return i * dt
    return 0.0
