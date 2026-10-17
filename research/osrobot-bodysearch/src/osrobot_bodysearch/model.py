"""Body-and-controller co-design for a planar vertical-plane arm (pure Python).

Every cost, mass, torque and limit below is ASSUMED, not a quoted value of a real product.
A design is (n joints, link lengths, base offset x) plus IK controller settings
(damping, gain). Targets are poses (x, z, tool angle): the tool must reach (x, z) within
POS_TOL and (when `orient` is on) point within ANG_TOL of straight down.
"""
import math, random

POS_TOL = 0.003            # m, ASSUMED
ANG_TOL = math.radians(15) # ASSUMED
QLIM = math.radians(150)   # joint limit, ASSUMED
TAU_MAX = 4.0              # N m per joint, ASSUMED (hobby servo class)
RHO = 1.0                  # kg per m of link, ASSUMED
PAYLOAD = 0.3              # kg, ASSUMED
G = 9.81
COST_JOINT = 40.0          # currency units per joint, ASSUMED
COST_M = 120.0             # per metre of link, ASSUMED
ITERS = 40                 # IK iteration cap, the controller's compute budget
LMIN, LMAX = 0.05, 0.45    # link length bounds, m

FIXED_LINKS = (0.2, 0.2, 0.2)   # the "off-the-shelf" body: 3 equal links, base at x=0
FIXED_BASE = 0.0


def cost(links):
    return COST_JOINT * len(links) + COST_M * sum(links)


BUDGET = cost(FIXED_LINKS)


def fk(links, q):
    x = z = a = 0.0
    pts = []
    for l, qi in zip(links, q):
        a += qi
        x += l * math.cos(a)
        z += l * math.sin(a)
        pts.append((x, z))
    return x, z, a, pts


def torques_ok(links, q):
    """Static gravity torque at each joint (link masses at their midpoints, payload at the tip)."""
    n = len(links)
    x, z, a, pts = fk(links, q)
    # joint i sits at the start of link i
    starts = [(0.0, 0.0)] + pts[:-1]
    for i in range(n):
        jx = starts[i][0]
        tau = PAYLOAD * G * (x - jx)
        for k in range(i, n):
            mx = (starts[k][0] + pts[k][0]) / 2
            tau += RHO * links[k] * G * (mx - jx)
        if abs(tau) > TAU_MAX:
            return False
    return True


def _solve3(m, e):
    # Gaussian elimination for a small square system
    n = len(e)
    a = [row[:] + [e[i]] for i, row in enumerate(m)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(a[r][c]))
        a[c], a[p] = a[p], a[c]
        d = a[c][c]
        if abs(d) < 1e-12:
            return [0.0] * n
        for r in range(c + 1, n):
            f = a[r][c] / d
            for k in range(c, n + 1):
                a[r][k] -= f * a[c][k]
    y = [0.0] * n
    for r in range(n - 1, -1, -1):
        y[r] = (a[r][n] - sum(a[r][k] * y[k] for k in range(r + 1, n))) / a[r][r]
    return y


def solve_ik(links, bx, target, ctrl, orient):
    """Damped least-squares IK from the home pose. Returns (success, iterations used)."""
    lam, gain = ctrl
    tx, tz = target[0] - bx, target[1]
    n = len(links)
    q = [0.0] * n
    q[0] = math.radians(45)
    for it in range(1, ITERS + 1):
        x, z, a, pts = fk(links, q)
        ex, ez = tx - x, tz - z
        ea = (-math.pi / 2 - a + math.pi) % (2 * math.pi) - math.pi if orient else 0.0
        pos_ok = math.hypot(ex, ez) < POS_TOL
        ang_ok = (not orient) or abs(ea) < ANG_TOL
        if pos_ok and ang_ok:
            ok = all(abs(v) <= QLIM for v in q) and torques_ok(links, q)
            return ok, it
        starts = [(0.0, 0.0)] + pts[:-1]
        rows = [[-(z - s[1]) for s in starts], [(x - s[0]) for s in starts]]
        e = [ex, ez]
        if orient:
            rows.append([1.0] * n)
            e.append(ea * 0.15)       # orientation weighted in metres per radian, ASSUMED
            rows[2] = [0.15 * v for v in rows[2]]
        m = len(rows)
        jjt = [[sum(rows[i][k] * rows[j][k] for k in range(n)) + (lam * lam if i == j else 0.0)
                for j in range(m)] for i in range(m)]
        y = _solve3(jjt, e)
        for k in range(n):
            q[k] += gain * sum(rows[i][k] * y[i] for i in range(m))
            q[k] = max(-QLIM, min(QLIM, q[k]))
    return False, ITERS


TASKS = {
    # pick from a low tray, place on a shelf; tool must point down
    "shelf": dict(orient=True, boxes=[((0.25, 0.40), (-0.05, 0.10)), ((0.20, 0.35), (0.25, 0.40))]),
    # far low reach, position only: a long, simple reach
    "far": dict(orient=False, boxes=[((0.35, 0.55), (-0.15, 0.05))]),
}


def targets(task, n, seed):
    rng = random.Random(seed)
    boxes = TASKS[task]["boxes"]
    out = []
    for i in range(n):
        (x0, x1), (z0, z1) = boxes[i % len(boxes)]
        out.append((rng.uniform(x0, x1), rng.uniform(z0, z1)))
    return out


def evaluate(design, task, tgts):
    """design = (links tuple, base x, (lam, gain)). Returns dict with success rate, mean iters, cost."""
    links, bx, ctrl = design
    c = cost(links)
    orient = TASKS[task]["orient"]
    ok = 0
    its = 0
    for t in tgts:
        s, it = solve_ik(links, bx, t, ctrl, orient)
        ok += s
        its += it
    n = len(tgts)
    return dict(success=ok / n, iters=its / n, cost=c)


def score(r):
    """Higher is better; infeasible (over budget) designs score -inf."""
    if r["cost"] > BUDGET + 1e-9:
        return -math.inf
    return 100.0 * r["success"] - 0.05 * r["iters"]


DEFAULT_CTRL = (0.05, 1.0)


def random_design(rng):
    n = rng.choice((2, 3, 4))
    links = tuple(rng.uniform(LMIN, LMAX) for _ in range(n))
    return (links, rng.uniform(-0.2, 0.2), (10 ** rng.uniform(-2.5, -0.5), rng.uniform(0.3, 1.2)))


def repair(design):
    """Scale links down so cost fits the budget (keeps the search feasible)."""
    links, bx, ctrl = design
    links = tuple(min(LMAX, max(LMIN, l)) for l in links)
    over = cost(links) - BUDGET
    if over > 0:
        f = (sum(links) * COST_M - over) / (sum(links) * COST_M)
        links = tuple(max(LMIN, l * f) for l in links)
    lam, gain = ctrl
    return (links, max(-0.3, min(0.3, bx)), (min(0.5, max(0.003, lam)), min(1.2, max(0.2, gain))))


def mutate(design, rng, s=0.1):
    links, bx, (lam, gain) = design
    links = list(links)
    if rng.random() < 0.15:                     # change the joint count
        if len(links) < 4 and rng.random() < 0.5:
            links.append(rng.uniform(LMIN, LMAX))
        elif len(links) > 2:
            links.pop(rng.randrange(len(links)))
    links = [l + rng.gauss(0, s * 0.5) for l in links]
    return repair((tuple(links), bx + rng.gauss(0, s), (lam * math.exp(rng.gauss(0, 0.4)), gain + rng.gauss(0, 0.1))))


def search(task, tgts, budget, seed, method):
    """Return best design after `budget` evaluations. method: random | evo (1+4) | ctrl_only | ctrl_base (fixed links)."""
    rng = random.Random(seed)
    if method == "ctrl_only":
        best, bs = None, -math.inf
        for _ in range(budget):
            d = (FIXED_LINKS, FIXED_BASE, (10 ** rng.uniform(-2.5, -0.5), rng.uniform(0.3, 1.2)))
            s = score(evaluate(d, task, tgts))
            if s > bs:
                best, bs = d, s
        return best, bs
    if method == "ctrl_base":    # fixed links, but the mount position is also tuned
        best, bs = None, -math.inf
        for _ in range(budget):
            d = (FIXED_LINKS, rng.uniform(-0.3, 0.3), (10 ** rng.uniform(-2.5, -0.5), rng.uniform(0.3, 1.2)))
            s = score(evaluate(d, task, tgts))
            if s > bs:
                best, bs = d, s
        return best, bs
    if method == "random":
        best, bs = None, -math.inf
        for _ in range(budget):
            d = repair(random_design(rng))
            s = score(evaluate(d, task, tgts))
            if s > bs:
                best, bs = d, s
        return best, bs
    # (1+4) evolution strategy
    best = repair(random_design(rng))
    bs = score(evaluate(best, task, tgts))
    used = 1
    while used < budget:
        for _ in range(4):
            if used >= budget:
                break
            c = mutate(best, rng)
            s = score(evaluate(c, task, tgts))
            used += 1
            if s >= bs:
                best, bs = c, s
    return best, bs
