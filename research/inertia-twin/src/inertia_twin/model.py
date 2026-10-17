"""Rolling body on an incline: exact closed forms and a stick/slip time-stepping simulator.

Body: mass m, radius r, inertia I = k m r^2 (sphere 2/5, disc 1/2, hoop 1). Incline angle a, Coulomb friction mu.
Twin: frictionless point mass (acceleration g sin a), optionally with a fitted scalar gain.
"""
import math

G = 9.81
SHAPES = {"sphere": 0.4, "disc": 0.5, "hoop": 1.0}


def mu_star(k, a):
    """Smallest friction coefficient that keeps the body rolling without slipping."""
    return k * math.tan(a) / (1 + k)


def accel_real(k, a, mu):
    """Down-ramp acceleration from rest (closed form): rolling if mu >= mu*, else kinetic slip."""
    if mu >= mu_star(k, a):
        return G * math.sin(a) / (1 + k)
    return G * (math.sin(a) - mu * math.cos(a))


def accel_twin(a):
    return G * math.sin(a)


def simulate(k, a, mu, t_end, dt=1e-4, v0=0.0, w0=0.0):
    """Time-step (v down-slope, omega with r = 1) with exact stick/slip logic. Returns (x, v, omega) at t_end."""
    x, v, w = 0.0, v0, w0
    s_eps = 1e-9
    for _ in range(int(round(t_end / dt))):
        slip = v - w
        # friction (up-slope positive) that would make slip stay zero
        f_roll = G * math.sin(a) * k / (1 + k)
        if abs(slip) <= s_eps and f_roll <= mu * G * math.cos(a):
            acc = G * math.sin(a) / (1 + k)
            v += acc * dt
            w = v
        else:
            f = mu * G * math.cos(a) * (1 if slip > 0 else -1)
            acc = G * math.sin(a) - f
            alpha = f / k
            v_new, w_new = v + acc * dt, w + alpha * dt
            # slip sign change within the step: snap to rolling if it is sustainable
            if slip * (v_new - w_new) < 0 and f_roll <= mu * G * math.cos(a):
                v_new = w_new = (v_new + k * w_new) / (1 + k)
            v, w = v_new, w_new
        x += v * dt
    return x, v, w


def fall_time(accel, length):
    return math.sqrt(2 * length / accel)


def coast_distance_real(k, a, v0):
    """Launched rolling up the ramp at speed v0 (no slip): (1+k) v0^2 / (2 g sin a)."""
    return (1 + k) * v0 * v0 / (2 * G * math.sin(a))


def coast_distance_twin(a, v0):
    return v0 * v0 / (2 * G * math.sin(a))


def launch_speed_twin(a, dist):
    """Launch speed a twin-trained policy picks to stop at dist."""
    return math.sqrt(2 * G * math.sin(a) * dist)


def fit_gain(samples):
    """Least-squares scalar c minimising sum (c*g_sin_a - a_obs)^2; samples = [(a, acc_obs)]."""
    num = sum(accel_twin(a) * acc for a, acc in samples)
    den = sum(accel_twin(a) ** 2 for a, _ in samples)
    return num / den
