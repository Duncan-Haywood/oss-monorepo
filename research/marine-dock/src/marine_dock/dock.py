"""One docking run. The dock mouth is the line x = 0, axis along +x, boat starts at x = -40 m.

Capture: the boat crosses x = 0 with |y| <= g (capture half-width), |heading| <= psi_max and
ground speed <= v_max. Crossing otherwise is a miss (hits a wall or the mouth); no crossing in T is a
timeout. Strategies steer on a NOISY position estimate: 'pursuit' heads at the dock point (0, 0),
'los' is plain line-of-sight to the dock axis, 'ilos' is integral LOS (Borhaug et al. 2008).
Estimate noise is AR(1) (time constant tau, stationary std sigma) per axis, since GNSS/USBL errors are
correlated in time; compass noise is white. Boat from marine-path (unsourced coefficients).
"""
import math
import random
from .boat import Boat, step, wrap


def waves(t, hs, phases):
    fu = fv = mr = 0.0
    for (w, ph, a) in phases:
        fu += a * math.sin(w * t + ph[0])
        fv += a * math.sin(w * t + ph[1])
        mr += 1.5 * a * math.sin(w * t + ph[2])
    k = 40.0 * hs
    return (k * fu, k * fv, k * mr)


def run(strategy, cy=0.0, sigma=0.0, seed=0, hs=0.25, g=0.5, psi_max=math.radians(30), v_max=1.2,
        delta=6.0, kappa=0.5, tau=5.0, compass_deg=1.0, T=200.0, dt=0.1, u_far=1.0, u_near=0.5,
        slow_x=-15.0, kp=2.0, kd=4.0):
    rng = random.Random(seed)
    b = Boat()
    phases = [(2 * math.pi / (4.0 + 5.0 * i / 5), [rng.uniform(0, 6.283) for _ in range(3)], 1 / math.sqrt(6))
              for i in range(6)]
    y0 = rng.uniform(-5.0, 5.0)
    s = (-40.0, y0, rng.uniform(-0.2, 0.2), u_far, 0.0, 0.0)
    ex = ey = 0.0
    a = math.exp(-dt / tau)
    q = sigma * math.sqrt(1 - a * a)
    yint = 0.0
    rud = isp = 0.0
    for k in range(int(T / dt)):
        t = k * dt
        ex = a * ex + q * rng.gauss(0, 1)
        ey = a * ey + q * rng.gauss(0, 1)
        xe, ye = s[0] + ex, s[1] + ey
        psi_m = s[2] + math.radians(compass_deg) * rng.gauss(0, 1)
        if strategy == "pursuit":
            psi_d = math.atan2(-ye, -xe)
        elif strategy == "los":
            psi_d = -math.atan2(ye, delta)
        else:
            e = ye + kappa * yint
            yint += dt * delta * ye / (delta ** 2 + e * e)
            psi_d = -math.atan2(e, delta)
        cmd = max(-b.rud_max, min(b.rud_max, kp * wrap(psi_d - psi_m) - kd * s[5]))
        rud += max(-b.rud_rate * dt, min(b.rud_rate * dt, cmd - rud))
        uref = u_far if xe < slow_x else u_near
        eu = uref - s[3]
        isp = max(-5.0, min(5.0, isp + eu * dt))
        thrust = max(0.0, b.xu2 * uref ** 2 + 60.0 * eu + 6.0 * isp)
        prev = s
        s = step(b, s, thrust, rud, (0.0, cy), waves(t, hs, phases), dt)
        if s[0] >= 0.0:
            f = -prev[0] / (s[0] - prev[0]) if s[0] != prev[0] else 0.0
            yc = prev[1] + f * (s[1] - prev[1])
            vg = math.hypot(s[3] * math.cos(s[2]) - s[4] * math.sin(s[2]),
                            s[3] * math.sin(s[2]) + s[4] * math.cos(s[2]) + cy)
            ok = abs(yc) <= g and abs(wrap(s[2])) <= psi_max and vg <= v_max
            return {"outcome": "capture" if ok else "miss", "y": yc, "psi": wrap(s[2]), "t": t}
    return {"outcome": "timeout", "y": s[1], "psi": wrap(s[2]), "t": T}
