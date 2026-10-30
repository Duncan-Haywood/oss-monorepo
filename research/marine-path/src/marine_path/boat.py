"""3-DOF surface boat (surge, sway, yaw) with a rudder, in a current, after Fossen (2011) ch. 7.

State (x, y, psi, u, v, r): earth position (x east... here x along the survey line, y to port),
heading psi, body velocities relative to the water u, v and yaw rate r. The current is a constant
earth-frame vector (cx, cy), irrotational, so it adds to ground velocity only (Fossen's relative-
velocity formulation). Damping is linear in sway and yaw and quadratic in surge. Parameters are
a 200 kg craft (the marine-hull reference boat); damping and rudder gains are NOT sourced.
"""
import math
from dataclasses import dataclass


@dataclass
class Boat:
    m: float = 260.0        # kg, 200 kg craft plus 30% added mass in sway
    iz: float = 180.0       # kg m^2 yaw inertia incl. added
    xu2: float = 22.0       # N s^2/m^2 quadratic surge drag (about 22 N at 1 m/s)
    yv: float = 180.0       # N s/m linear sway damping
    nr: float = 90.0        # N m s linear yaw damping
    n_delta: float = 120.0  # N m per rad rudder moment at 1 m/s (scales with u^2)
    rud_max: float = 0.6    # rad
    rud_rate: float = 0.5   # rad/s
    eta_prop: float = 0.5   # propeller x motor efficiency
    u_ref: float = 1.0      # m/s commanded speed through water


def step(b, s, thrust, rudder, cur, f_wave, dt):
    """Advance state s=(x,y,psi,u,v,r) by dt (semi-implicit Euler). f_wave = (Fu, Fv, Mr) in N, N m."""
    x, y, psi, u, v, r = s
    fu, fv, mr = f_wave
    du = (thrust - b.xu2 * u * abs(u) + b.m * v * r + fu) / b.m
    dv = (-b.yv * v - b.m * u * r + fv) / b.m
    dr = (-b.nr * r + b.n_delta * rudder * (u * u) + mr) / b.iz
    u += du * dt
    v += dv * dt
    r += dr * dt
    c, sn = math.cos(psi), math.sin(psi)
    x += (u * c - v * sn + cur[0]) * dt
    y += (u * sn + v * c + cur[1]) * dt
    return (x, y, psi + r * dt, u, v, r)


def wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi
