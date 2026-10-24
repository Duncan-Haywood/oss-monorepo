"""Robots that read urgency at a door: does yielding only to people in a hurry beat yielding to all?

Builds on `society-doorway` (go-or-yield game, logit people with memory `m`, mean field) and adds a
share `u` of *urgent* people whose waiting cost is `wu` times the usual (`w = 1`). A person's cost of
yielding to a goer is their own waiting cost. People do not see a partner's urgency; they respond to
the share of remembered partners who went. A robot can read its partner's urgency and plays
`gU` (partner urgent) or `gN` (partner not urgent): the probability of going.

Mean field. Robots' going depends on the partner's type, so the share of partners who go differs by
the person's type: q_X = r g_X + (1 - r) h, where h is the share of human partners who go,
h = u pU + (1 - u) pN, and pX = human_go(q_X, w_X). h is the fixed point of a decreasing map, so bisect.
"""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "society-doorway" / "src"))
from society_doorway import cost_go, cost_yield, human_go  # noqa: E402

GRID = [i / 10 for i in range(11)]


def solve(r, gU, gN, u=0.2, wu=3.0, k=3.0, w=1.0, d=1.0, m=9, beta=8.0):
    """Mean-field equilibrium. Returns shares of partners who go (qU, qN), people's go
    probabilities (pU, pN) and mean costs per encounter by group."""
    def rhs(h):
        qU, qN = r * gU + (1 - r) * h, r * gN + (1 - r) * h
        return u * human_go(qU, m, beta, k=k, w=wu * w, d=d) + (1 - u) * human_go(qN, m, beta, k=k, w=w, d=d)
    lo, hi = 0.0, 1.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if rhs(mid) - mid > 0:
            lo = mid
        else:
            hi = mid
    h = (lo + hi) / 2
    qU, qN = r * gU + (1 - r) * h, r * gN + (1 - r) * h
    pU = human_go(qU, m, beta, k=k, w=wu * w, d=d)
    pN = human_go(qN, m, beta, k=k, w=w, d=d)
    cU = pU * cost_go(qU, k) + (1 - pU) * cost_yield(qU, k, wu * w, d)
    cN = pN * cost_go(qN, k) + (1 - pN) * cost_yield(qN, k, w, d)
    # robots: the partner is urgent with the share of encounters a robot has with urgent people
    # (random pairing: u among human partners, and a robot meets a human w.p. 1 - r; robots meet
    # robots too, treated as non-urgent and playing gN against each other)
    return {"qU": qU, "qN": qN, "pU": pU, "pN": pN, "cU": cU, "cN": cN, "h": h}


def robot_cost(r, gU, gN, u=0.2, wu=3.0, k=3.0, w=1.0, d=1.0, m=9, beta=8.0):
    """Mean cost per encounter of a robot. Its partner is a person (urgent w.p. u) w.p. 1 - r and
    another robot w.p. r. A robot's own waiting cost is `w`. A person's go probability against the
    robot is pU or pN; the robot goes with gU or gN. Robot-robot meetings: both play gN."""
    s = solve(r, gU, gN, u, wu, k, w, d, m, beta)

    def vs(g, p):  # robot goes w.p. g, partner goes w.p. p
        return g * (p * k) + (1 - g) * (p * w + (1 - p) * d)
    cu, cn = vs(gU, s["pU"]), vs(gN, s["pN"])
    crr = vs(gN, gN)
    return (1 - r) * (u * cu + (1 - u) * cn) + r * crr


def crowd_cost(r, gU, gN, **kw):
    """Mean cost per encounter over everyone (people weighted by their share, robots by r)."""
    u = kw.get("u", 0.2)
    s = solve(r, gU, gN, **kw)
    return (1 - r) * (u * s["cU"] + (1 - u) * s["cN"]) + r * robot_cost(r, gU, gN, **kw)


def best_policy(r, objective, **kw):
    """Grid (gU, gN) minimising the objective ('crowd', 'urgent', 'people')."""
    u = kw.get("u", 0.2)

    def f(gU, gN):
        s = solve(r, gU, gN, **kw)
        if objective == "crowd":
            return crowd_cost(r, gU, gN, **kw)
        if objective == "urgent":
            return s["cU"]
        return u * s["cU"] + (1 - u) * s["cN"]
    return min(((gU, gN) for gU in GRID for gN in GRID), key=lambda t: f(*t))


def deviation_gains(r, gU, gN, **kw):
    """Gain from going rather than yielding for one extra robot, against an urgent and against a
    non-urgent person (cost of yielding minus cost of going; positive means going pays)."""
    k, w, d = kw.get("k", 3.0), kw.get("w", 1.0), kw.get("d", 1.0)
    s = solve(r, gU, gN, **kw)
    return (cost_yield(s["pU"], k, w, d) - cost_go(s["pU"], k),
            cost_yield(s["pN"], k, w, d) - cost_go(s["pN"], k))


def stable(r, gU, gN, tol=1e-3, **kw):
    """No single robot gains by deviating from the fleet rule, against either type of person:
    a pure g = 0 needs going not to pay, a pure g = 1 needs yielding not to pay, a mixed g needs
    indifference (within tol)."""
    ok = True
    for g, gain in zip((gU, gN), deviation_gains(r, gU, gN, **kw)):
        if g <= 0:
            ok &= gain <= tol
        elif g >= 1:
            ok &= gain >= -tol
        else:
            ok &= abs(gain) <= tol
    return ok


def simulate(r, gU, gN, u=0.2, wu=3.0, n=400, m=9, beta=8.0, rounds=500, burn=150, seed=0,
             k=3.0, w=1.0, d=1.0):
    """Agent-based check: n agents, share r robots; of the people a share u urgent. Random pairing
    each round; people respond to their memory of the last m partners' actions; robots read the
    partner's urgency (robot-robot meetings use gN). Returns mean costs by group."""
    from society_doorway import go_prob
    rng = random.Random(seed)
    n -= n % 2
    nr = round(r * n)
    nu = round(u * (n - nr))
    kind = ["R"] * nr + ["U"] * nu + ["N"] * (n - nr - nu)
    rng.shuffle(kind)
    mem = [[rng.random() < 0.5 for _ in range(m)] for _ in range(n)]
    tot = {"R": 0.0, "U": 0.0, "N": 0.0}
    cnt = {"R": 0, "U": 0, "N": 0}
    for t in range(rounds):
        order = list(range(n))
        rng.shuffle(order)
        for a in range(0, n, 2):
            i, j = order[a], order[a + 1]
            acts = {}
            for x, y in ((i, j), (j, i)):
                if kind[x] == "R":
                    g = gU if kind[y] == "U" else gN
                    acts[x] = rng.random() < g
                else:
                    wx = wu * w if kind[x] == "U" else w
                    acts[x] = rng.random() < go_prob(sum(mem[x]) / m, beta, k, wx, d)
            for x, y in ((i, j), (j, i)):
                wx = wu * w if kind[x] == "U" else w
                c = k if acts[x] and acts[y] else (0.0 if acts[x] else (wx if acts[y] else d))
                if t >= burn:
                    tot[kind[x]] += c
                    cnt[kind[x]] += 1
                mem[x].pop(0)
                mem[x].append(acts[y])
    return {kd: (tot[kd] / cnt[kd] if cnt[kd] else float("nan")) for kd in tot}
