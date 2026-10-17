"""Slip twin.  Real system: linear single-track ("bicycle") car at constant forward speed v with tyre slip.  States
(y, psi, vy, r) = lateral offset from a straight reference line, heading error, body-frame lateral speed, yaw rate; input
steering angle delta.  Axle forces Fyf = Cf (delta - (vy + a r)/v), Fyr = -Cr (vy - b r)/v.
Twin: kinematic bicycle, no slip:  y' = v psi, psi' = v delta / L  (L = a + b).
Calibrated twin: same, with the steady-turn gain fitted:  psi' = v delta / (L + K v^2).
Exact steady-turn law of the real car: delta = (L + K v^2)/R with understeer gradient K = m/L (b/Cf - a/Cr).
"""
import math


class Car:
    def __init__(self, m=1500.0, iz=2500.0, a=1.2, b=1.4, cf=60000.0, cr=80000.0):
        self.m, self.iz, self.a, self.b, self.cf, self.cr = m, iz, a, b, cf, cr

    @property
    def L(self):
        return self.a + self.b

    @property
    def K(self):
        """Understeer gradient (s^2/m); >0 understeer, <0 oversteer."""
        return self.m / self.L * (self.b / self.cf - self.a / self.cr)

    def v_char(self):
        """Characteristic speed sqrt(L/K) (understeer): the speed at which the steady turn radius is twice the kinematic one."""
        return math.sqrt(self.L / self.K) if self.K > 0 else math.inf

    def v_crit(self):
        """Critical speed sqrt(-L/K) (oversteer): the open-loop car is unstable above it."""
        return math.sqrt(-self.L / self.K) if self.K < 0 else math.inf

    def matrices(self, v):
        """x' = A x + B delta for x = (y, psi, vy, r)."""
        m, iz, a, b, cf, cr = self.m, self.iz, self.a, self.b, self.cf, self.cr
        A = [[0, v, 1, 0],
             [0, 0, 0, 1],
             [0, 0, -(cf + cr) / (m * v), -v - (a * cf - b * cr) / (m * v)],
             [0, 0, -(a * cf - b * cr) / (iz * v), -(a * a * cf + b * b * cr) / (iz * v)]]
        B = [0, 0, cf / m, a * cf / iz]
        return A, B


def steady_radius_ratio(K, L, v):
    """R_real / R_kinematic for the same steering angle: 1 + K v^2 / L."""
    return 1.0 + K * v * v / L


def charpoly(A):
    """Characteristic polynomial coefficients [1, c1, ..., cn] of det(sI - A) by Faddeev-LeVerrier."""
    n = len(A)
    M = [[0.0] * n for _ in range(n)]
    c = [1.0]
    for k in range(1, n + 1):
        # M = A M_prev + c_{k-1} I
        M = [[sum(A[i][j] * M[j][l] for j in range(n)) + (c[-1] if i == l else 0.0) for l in range(n)] for i in range(n)]
        AM = [[sum(A[i][j] * M[j][l] for j in range(n)) for l in range(n)] for i in range(n)]
        c.append(-sum(AM[i][i] for i in range(n)) / k)
    return c


def is_hurwitz(p):
    """Routh test: all roots of p (leading coeff first) strictly in the open left half plane."""
    if any(x <= 0 for x in p):
        return False
    n = len(p) - 1
    r0, r1 = p[0::2], p[1::2]
    for _ in range(n - 1):
        if r1[0] <= 0:
            return False
        nxt = []
        for i in range(len(r0) - 1):
            nxt.append(r0[i + 1] - r0[0] * (r1[i + 1] if i + 1 < len(r1) else 0.0) / r1[0])
        if not nxt:
            break
        r0, r1 = r1, nxt
    return True


def closed_loop_poly(car, v, kp, kd):
    """Real car under delta = -kp y - kd psi."""
    A, B = car.matrices(v)
    Acl = [[A[i][j] - B[i] * (kp if j == 0 else kd if j == 1 else 0.0) for j in range(4)] for i in range(4)]
    return charpoly(Acl)


def twin_poly(L, v, kp, kd, K=0.0):
    """Closed loop of the (calibrated) kinematic twin under the same law: s^2 + (v kd/Leff) s + v^2 kp/Leff, Leff = L + K v^2."""
    le = L + K * v * v
    return [1.0, v * kd / le, v * v * kp / le]


def real_stable(car, v, kp, kd):
    return is_hurwitz(closed_loop_poly(car, v, kp, kd))


def max_stable_speed(car, kp, kd, vlo=1.0, vhi=200.0):
    """Largest v (bisection on the first loss of stability scanning up from vlo) such that the real loop is stable on [vlo, v]."""
    v = vlo
    if not real_stable(car, v, kp, kd):
        return 0.0
    step = 0.5
    while v < vhi and real_stable(car, v + step, kp, kd):
        v += step
    lo, hi = v, v + step
    if hi >= vhi:
        return math.inf
    for _ in range(50):
        mid = 0.5 * (lo + hi)
        if real_stable(car, mid, kp, kd):
            lo = mid
        else:
            hi = mid
    return lo


def simulate(car, v, law, T, dt=1e-3, x0=(0.0, 0.0, 0.0, 0.0)):
    """RK4 simulation of the real car under steering law(t, x) -> delta.  Returns list of (t, x)."""
    A, B = car.matrices(v)

    def f(t, x):
        d = law(t, x)
        return [sum(A[i][j] * x[j] for j in range(4)) + B[i] * d for i in range(4)]

    x, t, out = list(x0), 0.0, [(0.0, list(x0))]
    for _ in range(int(round(T / dt))):
        k1 = f(t, x)
        k2 = f(t + dt / 2, [x[i] + dt / 2 * k1[i] for i in range(4)])
        k3 = f(t + dt / 2, [x[i] + dt / 2 * k2[i] for i in range(4)])
        k4 = f(t + dt, [x[i] + dt * k3[i] for i in range(4)])
        x = [x[i] + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) for i in range(4)]
        t += dt
        out.append((t, list(x)))
    return out


def steady_radius_sim(car, v, R_des, T=20.0, dt=2e-3):
    """Apply the twin's steering delta = L/R_des at constant value; radius of the settled real turn = v / r."""
    d = car.L / R_des
    tr = simulate(car, v, lambda t, x: d, T, dt)
    return v / tr[-1][1][3]
