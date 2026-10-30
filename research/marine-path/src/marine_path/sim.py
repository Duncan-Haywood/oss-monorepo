"""Run one survey leg and score it."""
import math
import random
from .boat import Boat, step, wrap
from .guidance import los, ILOS


def wave_forces(t, hs, phases, rng_amp):
    """Wave-frequency disturbance: sum of sinusoids at periods 4 to 9 s, amplitudes scaling with Hs.
    A force of 40*Hs N surge/sway and 60*Hs N m yaw per component (swept scale, NOT sourced)."""
    fu = fv = mr = 0.0
    for (w, ph, a) in phases:
        fu += a * math.sin(w * t + ph[0])
        fv += a * math.sin(w * t + ph[1])
        mr += 1.5 * a * math.sin(w * t + ph[2])
    k = 40.0 * hs
    return (k * fu, k * fv, k * mr)


def make_phases(seed, n=6):
    rng = random.Random(seed)
    out = []
    for i in range(n):
        T = 4.0 + 5.0 * i / (n - 1)
        out.append((2 * math.pi / T, [rng.uniform(0, 2 * math.pi) for _ in range(3)], 1 / math.sqrt(n)))
    return out, None


def run(controller, delta=12.0, kappa=0.0, cur=(0.0, 0.3), hs=0.0, seed=0, T=900.0, dt=0.1,
        y0=15.0, boat=None, kp=2.0, kd=4.0, ki_speed=60.0):
    """controller 'los' or 'ilos'. Returns dict of rms cross-track error over the last half, energy (Wh)
    and distance along the line (m). Heading PD drives the rudder; surge PI holds speed through water."""
    b = boat or Boat()
    phases, _ = make_phases(seed)
    s = (0.0, y0, 0.0, b.u_ref, 0.0, 0.0)
    ilos = ILOS(delta, kappa)
    rud = 0.0
    isp = 0.0
    n = int(T / dt)
    sq = cnt = 0
    e_j = 0.0
    for k in range(n):
        t = k * dt
        y = s[1]
        psi_d = los(y, delta) if controller == "los" else ilos.heading(y, dt)
        e = wrap(psi_d - s[2])
        cmd = max(-b.rud_max, min(b.rud_max, kp * e - kd * s[5]))
        d = max(-b.rud_rate * dt, min(b.rud_rate * dt, cmd - rud))
        rud += d
        eu = b.u_ref - s[3]
        isp += eu * dt
        thrust = max(0.0, b.xu2 * b.u_ref ** 2 + ki_speed * eu + 6.0 * isp)
        s = step(b, s, thrust, rud, cur, wave_forces(t, hs, phases, None), dt)
        e_j += thrust * max(s[3], 0.0) / b.eta_prop * dt
        if t >= T / 2:
            sq += s[1] ** 2
            cnt += 1
    return {"rms_xte": math.sqrt(sq / cnt), "mean_xte": None, "energy_wh": e_j / 3600.0, "x": s[0], "y_end": s[1]}
