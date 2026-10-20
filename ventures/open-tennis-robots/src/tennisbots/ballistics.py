"""Tennis ball flight: gravity, aerodynamic drag, Magnus lift, and a bounce model.

The model is the standard one from the sports-physics literature (drag
coefficient roughly constant, lift coefficient a function of the spin
parameter r*omega/v, a friction-limited bounce that can end in rolling). All
coefficients are parameters on `BallModel`, because they vary with ball wear,
altitude, temperature and court surface: calibrate them against your own
machine (see `launcher.calibrate_exit_speed`) before trusting a number to the
centimetre.

Spin is a vector in rad/s. For a ball moving along +x, topspin is a positive
y-component (see `spin_vector`).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, replace

from . import court

Vec = tuple[float, float, float]

RPM = 2 * math.pi / 60  # rad/s per rpm


def add(a: Vec, b: Vec) -> Vec:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def scale(a: Vec, k: float) -> Vec:
    return (a[0] * k, a[1] * k, a[2] * k)


def dot(a: Vec, b: Vec) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a: Vec, b: Vec) -> Vec:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norm(a: Vec) -> float:
    return math.sqrt(dot(a, a))


@dataclass(frozen=True)
class BallModel:
    mass: float = 0.0577          # kg (ITF: 56.0-59.4 g)
    radius: float = 0.0335        # m  (ITF: 6.54-6.86 cm diameter)
    air_density: float = 1.21     # kg/m^3, sea level ~20 C
    drag_coeff: float = 0.55      # new ball; worn balls run lower
    gravity: float = 9.81
    restitution: float = 0.75     # vertical COR on a hard court
    friction: float = 0.6         # sliding friction ball-court
    inertia_factor: float = 0.55  # I = k * m * r^2 (thin-walled sphere ~0.55-0.67)

    @property
    def area(self) -> float:
        return math.pi * self.radius ** 2

    def lift_coeff(self, speed: float, spin_rate: float) -> float:
        """C_L = 1 / (2 + v / (r * omega)), a fit that is widely used for tennis balls."""
        if spin_rate <= 0 or speed <= 0:
            return 0.0
        return 1.0 / (2.0 + speed / (self.radius * spin_rate))


DEFAULT_BALL = BallModel()


def spin_vector(velocity: Vec, topspin: float, sidespin: float = 0.0) -> Vec:
    """Spin vector for `topspin` (+) / backspin (-) and `sidespin` in rad/s.

    Topspin rotates about the horizontal axis z x heading, so the Magnus force
    points down. Positive sidespin rotates counter-clockwise seen from above
    and curves the ball to the left of its direction of travel.
    """
    hx, hy = velocity[0], velocity[1]
    h = math.hypot(hx, hy)
    if h == 0:
        return (0.0, 0.0, sidespin)
    hx, hy = hx / h, hy / h
    # z x (hx, hy, 0) = (-hy, hx, 0)
    return (-hy * topspin, hx * topspin, sidespin)


@dataclass
class State:
    t: float
    pos: Vec
    vel: Vec
    spin: Vec


def acceleration(vel: Vec, spin: Vec, ball: BallModel) -> Vec:
    v = norm(vel)
    g = (0.0, 0.0, -ball.gravity)
    if v == 0:
        return g
    k = 0.5 * ball.air_density * ball.area / ball.mass
    drag = scale(vel, -k * ball.drag_coeff * v)
    w = norm(spin)
    if w == 0:
        return add(g, drag)
    wxv = cross(spin, vel)
    m = norm(wxv)
    if m == 0:
        return add(g, drag)
    lift = scale(wxv, k * ball.lift_coeff(v, w) * v * v / m)
    return add(add(g, drag), lift)


def _rk4(pos: Vec, vel: Vec, spin: Vec, dt: float, ball: BallModel) -> tuple[Vec, Vec]:
    a1 = acceleration(vel, spin, ball)
    v2 = add(vel, scale(a1, dt / 2))
    a2 = acceleration(v2, spin, ball)
    v3 = add(vel, scale(a2, dt / 2))
    a3 = acceleration(v3, spin, ball)
    v4 = add(vel, scale(a3, dt))
    a4 = acceleration(v4, spin, ball)
    new_pos = add(pos, scale(add(add(vel, scale(v2, 2)), add(scale(v3, 2), v4)), dt / 6))
    new_vel = add(vel, scale(add(add(a1, scale(a2, 2)), add(scale(a3, 2), a4)), dt / 6))
    return new_pos, new_vel


def bounce(vel: Vec, spin: Vec, ball: BallModel = DEFAULT_BALL) -> tuple[Vec, Vec]:
    """Velocity and spin just after a bounce on a flat court.

    Vertical: v_z' = -e * v_z. Horizontal: friction opposes the slip of the
    contact point; the impulse is mu*(1+e)*m*|v_z| unless that would reverse
    the slip, in which case the ball leaves rolling (slip = 0).
    """
    vx, vy, vz = vel
    vz_out = -ball.restitution * vz
    u = math.hypot(vx, vy)
    if u == 0:
        return (0.0, 0.0, vz_out), spin
    hx, hy = vx / u, vy / u
    axis = (-hy, hx, 0.0)                     # topspin axis for this heading
    s = dot(spin, axis)                        # topspin component
    other = add(spin, scale(axis, -s))
    r = ball.radius
    alpha = ball.inertia_factor
    slip = u - r * s                           # contact-point speed along heading
    du = -ball.friction * (1 + ball.restitution) * abs(vz) * (1 if slip > 0 else -1)
    if abs(du) * (1 + 1 / alpha) >= abs(slip):
        du = -slip / (1 + 1 / alpha)           # grips: leaves rolling
    u_out = u + du
    s_out = s - du / (alpha * r)
    vel_out = (hx * u_out, hy * u_out, vz_out)
    return vel_out, add(other, scale(axis, s_out))


@dataclass
class Flight:
    """A simulated trajectory, sampled every `dt` seconds."""

    states: list[State] = field(default_factory=list)
    bounces: list[State] = field(default_factory=list)   # state at each ground contact
    net_clearance: float | None = None   # metres above net cord when crossing x=0; None if it never crossed
    hit_net: bool = False

    @property
    def first_bounce(self) -> State | None:
        return self.bounces[0] if self.bounces else None

    def crossing(self, x_plane: float) -> State | None:
        """Interpolated state when the ball first crosses the plane x = x_plane."""
        for a, b in zip(self.states, self.states[1:]):
            if (a.pos[0] - x_plane) * (b.pos[0] - x_plane) <= 0 and a.pos[0] != b.pos[0]:
                f = (x_plane - a.pos[0]) / (b.pos[0] - a.pos[0])
                lerp = lambda p, q: tuple(pi + (qi - pi) * f for pi, qi in zip(p, q))  # noqa: E731
                return State(a.t + (b.t - a.t) * f, lerp(a.pos, b.pos), lerp(a.vel, b.vel), a.spin)
        return None


def simulate(pos: Vec, vel: Vec, spin: Vec = (0.0, 0.0, 0.0), *, ball: BallModel = DEFAULT_BALL,
             dt: float = 0.002, max_time: float = 4.0, max_bounces: int = 1,
             stop_x: float | None = None, net: bool = True) -> Flight:
    """Integrate a ball's flight.

    Follows the ball through `max_bounces` bounces and stops at the next
    ground contact after that, at `max_time`, when x passes `stop_x`, or when
    it hits the net (if `net`). Spin decay in flight is not modelled (it is a
    few percent per second).
    """
    flight = Flight()
    st = State(0.0, pos, vel, spin)
    flight.states.append(st)
    r = ball.radius
    while st.t < max_time:
        p, v = _rk4(st.pos, st.vel, st.spin, dt, ball)
        s = st.spin
        t = st.t + dt
        # Net plane crossing.
        if net and (st.pos[0] < 0) != (p[0] < 0) and flight.net_clearance is None:
            f = -st.pos[0] / (p[0] - st.pos[0])
            y = st.pos[1] + (p[1] - st.pos[1]) * f
            z = st.pos[2] + (p[2] - st.pos[2]) * f
            if abs(y) <= court.NET_POST_Y:
                flight.net_clearance = z - r - court.net_height(y)
                if flight.net_clearance < 0:
                    flight.hit_net = True
                    flight.states.append(State(st.t + dt * f, (0.0, y, z), (0.0, 0.0, 0.0), s))
                    return flight
        # Ground contact.
        if p[2] <= r and v[2] < 0:
            f = (st.pos[2] - r) / (st.pos[2] - p[2]) if st.pos[2] != p[2] else 1.0
            contact = State(st.t + dt * f,
                            tuple(a + (b - a) * f for a, b in zip(st.pos, p)),
                            tuple(a + (b - a) * f for a, b in zip(st.vel, v)), s)
            contact.pos = (contact.pos[0], contact.pos[1], r)
            flight.bounces.append(contact)
            flight.states.append(contact)
            if len(flight.bounces) > max_bounces:
                return flight
            v, s = bounce(contact.vel, s, ball)
            p, t = contact.pos, contact.t
            if v[2] < 0.05:  # ball has stopped bouncing
                return flight
        st = State(t, p, v, s)
        flight.states.append(st)
        if stop_x is not None and (p[0] - stop_x) * (pos[0] - stop_x) <= 0:
            return flight
    return flight


def launch_velocity(speed: float, elevation: float, azimuth: float) -> Vec:
    """Velocity vector from speed (m/s), elevation above horizontal and azimuth from +x."""
    c = math.cos(elevation)
    return (speed * c * math.cos(azimuth), speed * c * math.sin(azimuth), speed * math.sin(elevation))


def with_overrides(ball: BallModel, **kw: float) -> BallModel:
    return replace(ball, **kw)
