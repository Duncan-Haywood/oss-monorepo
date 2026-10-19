"""Copied from research/osrobot-leannoise (same repo, MIT) and extended: the user's misjudgement of the spoon can shrink as the spoon nears the lips.

A planar spoon-feeding twin. A spoon tip (point mass) is driven toward a mouth whose centre sways sideways.

The mouth is an opening of radius R in a lip plane at x = 0. Outside the opening the lips are a spring-damper wall.
Every constant marked ASSUMED is a round number, not a measurement of any person or product. Stdlib only."""
import math, random

DT = 0.002            # s, integration step
M_TIP = 0.30          # kg, effective moving mass at the spoon (ASSUMED)
KP, KD = 400.0, 28.0  # N/m, N s/m, tip position loop (ASSUMED; about critically damped for M_TIP)
F_ACT = 20.0          # N, actuator force limit per axis (ASSUMED)
K_LIP, C_LIP = 800.0, 1.5   # N/m, s/m, lip wall: Hunt-Crossley F = K x (1 + C v), no force step at touch (ASSUMED)
R_MOUTH = 0.012       # m, opening half-width the spoon must be inside (ASSUMED)
X_START, X_DEPTH = -0.10, 0.015   # m, start of the approach and target depth inside the mouth
LEAD = 0.05          # s, how far ahead of the tip the forward reference sits; a push against the wall is KP*LEAD*v_app (ASSUMED)
LEAN_X = -0.04        # m, the user starts leaning when the tip is this close to the lip plane (ASSUMED)
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


def run_trial(design, amp, seed, lean=0.0, perc_delay=0.0, perc_bias=0.0, shrink=0.0):
    """lean: m/s, speed at which the user shifts the mouth sideways toward the spoon tip once the tip is within LEAN_X of the lip plane (0 = passive user, ASSUMED).
    perc_delay: s, the user sees the tip this late. perc_bias: m, std of a fixed per-feed lateral misjudgement of the tip (drawn from its own seeded stream so other draws are unchanged; both 0 = osrobot-lean).
    shrink: 0..1, how much of the misjudgement vanishes as the tip reaches the lip plane. The offset applied is bias * ((1 - shrink) + shrink * d / -LEAN_X), d = -x the distance to the lip plane (capped at -LEAN_X), so 0 = constant offset (osrobot-leannoise) and 1 = linear to zero at the lips (ASSUMED shape).
    Feed one spoonful. Returns dict: entered (bool), t (s), peak (N, peak lip force), contact_s (s in contact)."""
    rng = random.Random(seed)
    base = sway(amp, rng)
    bias = random.Random(seed + 10**6).gauss(0.0, perc_bias) if perc_bias > 0.0 else 0.0
    ylog = []                 # tip lateral position per step, for the delayed view
    off = [0.0]               # user's lean offset, m
    mouth = lambda t: base(t) + off[0]
    x, y, vx, vy = X_START, base(0.0), 0.0, 0.0
    hist = []                 # (time, sensed y)
    y_meas = base(0.0)        # held sensor value
    next_meas = 0.0
    peak, contact_s, t = 0.0, 0.0, 0.0
    while t < T_MAX:
        # sensing with latency, noise and a sample-and-hold rate
        if design.sense == "camera" and t >= next_meas:
            y_meas = base(max(0.0, t - design.delay)) + off[0] + rng.gauss(0.0, design.sigma)
            next_meas += 1.0 / design.rate
        y_target = y_meas if design.sense == "camera" else 0.0
        ylog.append(y)
        if lean > 0.0 and x >= LEAN_X:
            seen = ylog[max(0, len(ylog) - 1 - int(round(perc_delay / DT)))] + bias * ((1.0 - shrink) + shrink * min(1.0, max(0.0, -x) / -LEAN_X))
            gap = seen - base(t) - off[0]
            off[0] += max(-lean * DT, min(lean * DT, gap))   # move toward the tip, rate-limited
        y_now = mouth(t)
        lateral_err = y - y_now
        inside = abs(lateral_err) <= R_MOUTH
        # reference: ramp forward at v_app, held back until the tip is lined up with the sensed mouth
        aligned = abs(y - y_target) <= 0.5 * R_MOUTH
        if design.sense == "camera" and not aligned and x < -0.02:
            x_ref = x                 # wait before the lip plane until lined up
        else:
            x_ref = min(X_DEPTH, x + design.v_app * LEAD)  # carrot LEAD seconds ahead of the tip
        fx = KP * (x_ref - x) - KD * vx
        fy = KP * (y_target - y) - KD * vy
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
        vx += DT * fx / M_TIP
        vy += DT * fy / M_TIP
        x += DT * vx
        y += DT * vy
        t += DT
        if x >= 0.0 and inside:   # crossed the lip plane through the opening: fed (later lateral edge contact is not modelled)
            return {"entered": True, "t": t, "peak": peak, "contact_s": contact_s}
    return {"entered": False, "t": t, "peak": peak, "contact_s": contact_s}


def summarise(design, amp, seeds):
    rs = [run_trial(design, amp, s) for s in seeds]
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
