"""A planar spoon-feeding twin, copied from osrobot-assist with the tip mass and damping made arguments, plus an n-joint arm model
that supplies the tip mass. A spoon tip is driven toward a mouth whose centre sways sideways.

The mouth is an opening of radius R in a lip plane at x = 0. Outside the opening the lips are a spring-damper wall.
Every constant marked ASSUMED is a round number, not a measurement of any person or product. Stdlib only."""
import math, random

DT = 0.002            # s, integration step
M_TIP = 0.30          # kg, default effective moving mass at the spoon (osrobot-assist value; ASSUMED)
KP, KD = 400.0, 28.0  # N/m, N s/m, tip position loop (ASSUMED; about critically damped for M_TIP)
DAMP_RATIO = KD / (2 * (KP * M_TIP) ** 0.5)   # 1.28: kept for every tip mass so only the mass changes
F_ACT = 20.0          # N, actuator force limit per axis (ASSUMED)
K_LIP, C_LIP = 800.0, 1.5   # N/m, s/m, lip wall: Hunt-Crossley F = K x (1 + C v), no force step at touch (ASSUMED)
R_MOUTH = 0.012       # m, opening half-width the spoon must be inside (ASSUMED)
X_START, X_DEPTH = -0.10, 0.015   # m, start of the approach and target depth inside the mouth
LEAD = 0.05          # s, how far ahead of the tip the forward reference sits; a push against the wall is KP*LEAD*v_app (ASSUMED)
T_MAX = 12.0          # s, give-up time
F_SAFE = 2.0          # N, assumed comfort limit for lip contact (ASSUMED, not a standard)


class Design:
    """sense: 'none' (aims at the mouth's rest position), 'camera' (tracks the sensed position).
    v_app: approach speed in m/s. f_cap: forward force cap in N (None = actuator limit).
    delay: sensing latency in s. sigma: sensing noise in m. rate: sensing rate in Hz."""
    def __init__(self, sense="camera", v_app=0.05, f_cap=None, delay=0.10, sigma=0.003, rate=15.0):
        self.sense, self.v_app, self.f_cap = sense, v_app, f_cap
        self.delay, self.sigma, self.rate = delay, sigma, rate


def sway(amp, rng):
    """Mouth lateral position function: two sinusoids (slow head drift, faster sway) with random phases."""
    p1, p2 = rng.random() * 2 * math.pi, rng.random() * 2 * math.pi
    f1, f2 = 0.25 + 0.1 * rng.random(), 0.9 + 0.3 * rng.random()
    return lambda t: amp * (math.sin(2 * math.pi * f1 * t + p1) + 0.33 * math.sin(2 * math.pi * f2 * t + p2))


def run_trial(design, amp, seed, m_tip=M_TIP):
    """Feed one spoonful. Returns dict: entered (bool), t (s), peak (N, peak lip force), contact_s (s in contact)."""
    kd = DAMP_RATIO * 2 * (KP * m_tip) ** 0.5
    rng = random.Random(seed)
    mouth = sway(amp, rng)
    x, y, vx, vy = X_START, mouth(0.0), 0.0, 0.0
    hist = []                 # (time, sensed y)
    y_meas = mouth(0.0)       # held sensor value
    next_meas = 0.0
    peak, contact_s, t = 0.0, 0.0, 0.0
    while t < T_MAX:
        # sensing with latency, noise and a sample-and-hold rate
        if design.sense == "camera" and t >= next_meas:
            y_meas = mouth(max(0.0, t - design.delay)) + rng.gauss(0.0, design.sigma)
            next_meas += 1.0 / design.rate
        y_target = y_meas if design.sense == "camera" else 0.0
        y_now = mouth(t)
        lateral_err = y - y_now
        inside = abs(lateral_err) <= R_MOUTH
        # reference: ramp forward at v_app, held back until the tip is lined up with the sensed mouth
        aligned = abs(y - y_target) <= 0.5 * R_MOUTH
        if design.sense == "camera" and not aligned and x < -0.02:
            x_ref = x                 # wait before the lip plane until lined up
        else:
            x_ref = min(X_DEPTH, x + design.v_app * LEAD)  # carrot LEAD seconds ahead of the tip
        fx = KP * (x_ref - x) - kd * vx
        fy = KP * (y_target - y) - kd * vy
        cap = F_ACT if design.f_cap is None else min(F_ACT, design.f_cap)
        fx = max(-F_ACT, min(cap, fx))
        fy = max(-F_ACT, min(F_ACT, fy))
        # speed limit on the approach so a stiff loop cannot outrun the commanded speed
        if vx > design.v_app and fx > 0:
            fx = 0.0
        # lip wall: only when the tip is at or past the plane and outside the opening
        fc = 0.0
        if x > 0.0 and not inside:
            fc = max(0.0, K_LIP * x * (1.0 + C_LIP * max(vx, 0.0)))
            fx -= fc
            peak = max(peak, fc)
            contact_s += DT
        vx += DT * fx / m_tip
        vy += DT * fy / m_tip
        x += DT * vx
        y += DT * vy
        t += DT
        if x >= 0.0 and inside:   # crossed the lip plane through the opening: fed (later lateral edge contact is not modelled)
            return {"entered": True, "t": t, "peak": peak, "contact_s": contact_s}
    return {"entered": False, "t": t, "peak": peak, "contact_s": contact_s}


def summarise(design, amp, seeds, m_tip=M_TIP):
    rs = [run_trial(design, amp, s, m_tip) for s in seeds]
    n = len(rs)
    ok = [r for r in rs if r["entered"]]
    return {
        "success": len(ok) / n,
        "safe": sum(1 for r in rs if r["entered"] and r["peak"] <= F_SAFE) / n,
        "touch": sum(1 for r in rs if r["contact_s"] > 0) / n,
        "peak_mean": sum(r["peak"] for r in rs) / n,
        "peak_max": max(r["peak"] for r in rs),
        "time_mean": (sum(r["t"] for r in ok) / len(ok)) if ok else float("nan"),
    }


# ---- n-joint planar arm: operational-space mass at the tip ----
REACH = 0.50          # m, total link length shoulder to spoon tip, split equally (ASSUMED)
M_SERVO = 0.060       # kg, one joint servo carried at its joint (ASSUMED, about a hobby 12 V servo)
RHO_LINK = 0.20       # kg/m, printed link structure, as a point mass at each link's middle (ASSUMED)
M_SPOON = 0.050       # kg, spoon, food and holder at the tip (ASSUMED)
I_ROTOR = 1.0e-7      # kg m^2, one servo's rotor inertia before the gearbox (ASSUMED)
GEAR = 345.0          # gear ratio of a 12 V 30 kg.cm hobby servo as listed by retailers
TIP_FROM_SHOULDER = (0.35, 0.05)   # m, where the tip is at the lip plane in the arm frame (ASSUMED)


def _fk(q, L):
    """Joint positions (shoulder at 0 ... tip) and cumulative angles of a planar chain."""
    pts, a, x, y = [(0.0, 0.0)], 0.0, 0.0, 0.0
    for qi in q:
        a += qi
        x += L * math.cos(a)
        y += L * math.sin(a)
        pts.append((x, y))
    return pts


def _jac_point(q, L, k, frac):
    """2 x n Jacobian of the point a fraction frac along link k (0-based); joints after k contribute nothing."""
    pts = _fk(q, L)
    px = pts[k][0] + frac * (pts[k + 1][0] - pts[k][0])
    py = pts[k][1] + frac * (pts[k + 1][1] - pts[k][1])
    J = [[0.0] * len(q) for _ in range(2)]
    for j in range(min(k + 1, len(q))):
        dx, dy = px - pts[j][0], py - pts[j][1]
        J[0][j], J[1][j] = -dy, dx
    return J


def solve_pose(n, target=TIP_FROM_SHOULDER):
    """Inverse kinematics by damped least squares, with the spare freedom of n > 2 joints pulled toward a gentle
    elbow-up zig-zag (joint angles of +-0.6 rad after the first), so redundant arms get a tidy pose, not a coiled one."""
    L = REACH / n
    q_nom = [0.5] + [(-1.2 if i % 2 == 1 else 1.2) / 2 for i in range(1, n)]
    q = q_nom[:]
    for _ in range(3000):
        tip = _fk(q, L)[-1]
        e = (target[0] - tip[0], target[1] - tip[1])
        J = _jac_point(q, L, n - 1, 1.0)
        lam2 = 1e-4
        a = sum(J[0][j] ** 2 for j in range(n)) + lam2
        b = sum(J[0][j] * J[1][j] for j in range(n))
        d = sum(J[1][j] ** 2 for j in range(n)) + lam2
        det = a * d - b * b
        # P = J^T (J J^T + lam2 I)^-1 : n x 2
        P = [[(J[0][j] * d - J[1][j] * b) / det, (-J[0][j] * b + J[1][j] * a) / det] for j in range(n)]
        pull = [0.05 * (q_nom[j] - q[j]) for j in range(n)]
        Jp = [sum(J[r][j] * pull[j] for j in range(n)) for r in range(2)]          # J * pull
        q = [q[j] + P[j][0] * (e[0] - Jp[0]) + P[j][1] * (e[1] - Jp[1]) + pull[j] for j in range(n)]
    tip = _fk(q, L)[-1]
    assert math.hypot(tip[0] - target[0], tip[1] - target[1]) < 1e-3, "pose not reached"
    return q, L


def _inv(A):
    n = len(A)
    M = [row[:] + [1.0 if i == j else 0.0 for j in range(n)] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        pv = M[c][c]
        M[c] = [v / pv for v in M[c]]
        for r in range(n):
            if r != c:
                f = M[r][c]
                M[r] = [v - f * w for v, w in zip(M[r], M[c])]
    return [row[n:] for row in M]


def tip_mass(n, m_servo=M_SERVO, i_rotor=I_ROTOR, gear=GEAR, target=TIP_FROM_SHOULDER):
    """Operational-space mass at the tip along x (the approach direction): Lambda_xx of Lambda = (J M^-1 J^T)^-1, where M is the joint-space mass matrix of the chain (servo and link point masses plus
    each servo's rotor inertia reflected through its gearbox, gear^2 * i_rotor, on its own joint)."""
    q, L = solve_pose(n, target)
    M = [[0.0] * n for _ in range(n)]
    masses = []                       # (mass, link index, fraction along that link)
    for k in range(n):
        masses.append((m_servo, k, 0.0))                   # servo k sits at the start of link k
        masses.append((RHO_LINK * L, k, 0.5))              # the link's printed structure
    masses.append((M_SPOON, n - 1, 1.0))
    for m, k, fr in masses:
        J = _jac_point(q, L, k, fr)
        for i in range(n):
            for j in range(n):
                M[i][j] += m * (J[0][i] * J[0][j] + J[1][i] * J[1][j])
    for j in range(n):
        M[j][j] += gear ** 2 * i_rotor
    Mi = _inv(M)
    J = _jac_point(q, L, n - 1, 1.0)
    A = [[sum(J[r][i] * Mi[i][j] * J[c][j] for i in range(n) for j in range(n)) for c in range(2)] for r in range(2)]
    det = A[0][0] * A[1][1] - A[0][1] * A[1][0]
    return A[1][1] / det              # (A^-1)_xx
