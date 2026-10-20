"""Soft-fruit picking gripper (strawberry-like) on a stylised bed: design -> cost, then a learned force/speed policy
scored on held-out fruit. Pure stdlib. Quasi-static contact model, no dynamics or contact solver: see README
"Limitations". Every constant marked ASSUMED is a round number written for this study, not a measurement."""
import math
import random

G = 9.81
# design x = [W pad width mm, E pad modulus MPa, F max grip force N, S finger opening span mm, V max arm speed m/s]
NAMES = ("W_mm", "E_MPa", "F_N", "S_mm", "V_ms")
LB = (4.0, 0.05, 0.5, 30.0, 0.1)
UB = (30.0, 3.0, 12.0, 90.0, 1.0)
LOG = (False, True, False, False, False)     # E is searched on a log scale
COST_CAP = 60.0           # USD parts cap (ASSUMED prices, README "Bill of materials")
PAD_LEN, PAD_T = 20.0, 5.0   # mm: pad length along the fruit, pad thickness (ASSUMED)
N_TRAIN, N_TEST = 20, 60  # fruit per policy search, fruit per scoring
VAL_OK, VAL_BRUISED = 1.0, 0.4   # sale value of an unbruised / bruised (downgraded) berry
T_FIXED = 0.8             # s: detach twist, release, reset (ASSUMED)
TRAVEL_M = 0.6            # m of arm travel per pick, there and back


def cost_usd(x):
    W, E, F, S, V = x
    servo = 6.0 + 2.5 * F + 8.0 * V             # gripper servo grows with force and speed
    arm_share = 10.0 + 22.0 * V                  # share of a cheap arm: faster costs more
    plastic_g = (S / 10) * 1.2 * 4 * 0.4 * 1.24 + 2 * (W / 10) * (PAD_LEN / 10) * 0.5 * 1.1
    pad = 0.04 * plastic_g * (1 + 2.0 / (0.3 + E))   # softer elastomer costs more per gram
    return servo + arm_share + 0.025 * plastic_g + pad + 8.0    # +8 USD: camera share, wiring


def make_fruit(seed, n=N_TEST):
    """Stylised berries: diameter mm, ripeness 0..1, sensed ripeness, camera position error mm."""
    rng = random.Random(seed)
    out = []
    for _ in range(n):
        d = min(max(rng.gauss(30, 5), 18), 44)
        ripe = rng.random()
        out.append({"d": d, "ripe": ripe, "ripe_hat": min(1, max(0, ripe + rng.gauss(0, 0.1))),
                    "err": abs(rng.gauss(0, 5.0)), "pull": max(0.8, rng.gauss(2.0, 0.6)),
                    "clutter": rng.random()})
    return out


def _mu(E):                       # softer pads grip better (ASSUMED law)
    return 0.3 + 0.5 * math.exp(-E / 0.8)


def pick(x, policy, f):
    """One pick. policy = (a, b, s): force = F*clip(a - b*ripe_hat), speed = V*s. Returns outcome dict."""
    W, E, F, S, V = x
    a, b, s = policy
    force = F * min(1.0, max(0.15, a - b * f["ripe_hat"]))
    v = V * min(1.0, max(0.2, s))
    d, r = f["d"], f["d"] / 2
    m = 0.00095 * (4 / 3) * math.pi * r ** 3 * 1e-3   # kg: 0.95 g/cm3 (ASSUMED), r in mm
    # capture: fruit plus camera error must fit inside the opening; neighbours/leaves catch in wide openings
    captured = d / 2 + f["err"] <= S / 2 and S > d
    knocked = f["clutter"] < max(0.0, (S - d - 15.0) / 75.0)
    # contact: pad indents under force, patch length follows the fruit radius until the pad bottoms out
    sigma = force / (W * PAD_LEN)                       # N/mm2 = MPa, nominal
    delta = min(PAD_T * 0.6, PAD_T * sigma / E)
    lc = min(PAD_LEN, 2 * math.sqrt(max(2 * r * delta, 0.01)) + 2.0)
    area = W * lc
    p_static = force / area                              # MPa
    vc = 0.3 * v                                         # m/s closing speed
    p_impact = vc * math.sqrt(E * 1e6 * 1000) * 1e-6     # MPa, stress-wave estimate with pad density 1000 kg/m3
    p_thr = 0.09 - 0.055 * f["ripe"]                     # MPa bruise threshold, riper = softer (ASSUMED)
    bruised = p_static + p_impact > p_thr
    accel = v / 0.25
    need = 1.5 * (f["pull"] + m * (G + accel))
    held = 2 * _mu(E) * force >= need
    t = 2 * TRAVEL_M / v + (S / 2000.0) / vc + T_FIXED
    if not captured or knocked:
        val = 0.0
        out = "missed" if not captured else "knocked"
    elif not held:
        val, out = 0.0, "dropped"
    elif bruised:
        val, out = VAL_BRUISED, "bruised"
    else:
        val, out = VAL_OK, "ok"
    return {"val": val, "t": t, "out": out, "p": p_static + p_impact, "force": force}


def _score(x, policy, fruit):
    rs = [pick(x, policy, f) for f in fruit]
    val, t = sum(r["val"] for r in rs), sum(r["t"] for r in rs)
    return val / t * 60.0, rs        # value per minute


def learn_policy(x, seed):
    """Small evolution-strategies search over (a, b, s) on the training fruit (NOT deep RL)."""
    rng = random.Random(seed)
    train = make_fruit(10_000 + seed, N_TRAIN)
    mean, sd = [0.8, 0.4, 0.8], [0.25, 0.25, 0.25]
    best, bs = tuple(mean), _score(x, tuple(mean), train)[0]
    for _ in range(6):
        cands = [tuple(m + sd_i * rng.gauss(0, 1) for m, sd_i in zip(mean, sd)) for _ in range(8)]
        scored = sorted(((_score(x, c, train)[0], c) for c in cands), reverse=True)
        if scored[0][0] > bs:
            bs, best = scored[0]
        mean = [sum(c[i] for _, c in scored[:3]) / 3 for i in range(3)]
        sd = [s_ * 0.7 for s_ in sd]
    return best


def evaluate(x):
    x = [float(v) for v in x]
    cost = cost_usd(x)
    if cost > COST_CAP:
        return {"x": x, "J": -1.0, "cost": cost, "feasible": False}
    seed = int(sum((i + 1) * v * 1000 for i, v in enumerate(x))) % 100_000
    pol = learn_policy(x, seed)
    vpm, rs = _score(x, pol, make_fruit(777))
    n = len(rs)
    share = {k: sum(r["out"] == k for r in rs) / n for k in ("ok", "bruised", "dropped", "missed", "knocked")}
    return {"x": x, "J": vpm / 20.0, "value_per_min": vpm, "cost": cost, "feasible": True, "policy": pol,
            "picks_per_min": 60 * n / sum(r["t"] for r in rs), "mean_pressure_kpa": 1000 * sum(r["p"] for r in rs) / n, **share}
