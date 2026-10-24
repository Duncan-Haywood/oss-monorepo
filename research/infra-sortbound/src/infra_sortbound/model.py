"""How far below a clairvoyant schedule is online dispatch in a belt pick cell?

Extends `infra-sortvalue` (same belt, TACO class mix, assumed values, detector and arm; the code is
copied so this project stands alone). That project compared greedy pick orders with each other and
listed "an offline optimal schedule as an upper bound" as a next step. This is that bound.

Key fact used (checked by brute force in the tests): every item has the same reach window, so
deadlines are in the same order as arrival times ("agreeable" deadlines). For a single machine and
non-preemptive jobs, a set of jobs with agreeable release dates and deadlines is feasible in any
order only if it is feasible in arrival order. So the best schedule is a subsequence of the called
items picked in arrival order, and dynamic programming over (finish time, value) states solves it.
Finish times are put on a grid of `eps` seconds, rounded UP for a lower bound (a schedule the cell
could really run) and DOWN for an upper bound (it can only be too generous), so the two bracket
the true optimum.
"""
import csv, itertools, math, os, random
from dataclasses import dataclass

HERE = os.path.dirname(os.path.abspath(__file__))
TABLE = os.path.join(HERE, "..", "..", "data", "taco_items.csv")

# category -> weight relative to a clear plastic bottle (1.0). Assumed, as in infra-sortvalue.
VALUE_CLASS = {"Clear plastic bottle": 1.0, "Other plastic bottle": 0.6, "Glass bottle": 0.15,
               "Drink can": None, "Food Can": 0.3, "Aerosol": 0.3}


@dataclass(frozen=True)
class Config:
    speed: float = 0.5
    density: float = 6.0
    window: float = 1.0
    t_base: float = 0.5
    arm_speed: float = 0.6
    belt_width: float = 0.6
    grasp: float = 0.95
    scene_width: float = 0.6
    s50: float = 0.04
    slope: float = 0.015
    recall_max: float = 0.97
    false_call: float = 0.03
    can_value: float = 4.0
    horizon: float = 1800.0


def load_items(path=TABLE):
    with open(path) as f:
        return [(r["category"], r["supercategory"], float(r["rel_size"])) for r in csv.DictReader(f)]


def value_of(cat, c):
    v = VALUE_CLASS.get(cat)
    return c.can_value if cat == "Drink can" else (v or 0.0)


def recall(size_m, c):
    return c.recall_max / (1.0 + math.exp(-(size_m - c.s50) / c.slope))


def arrivals(c, items, rng):
    """Detector-called items in arrival order: dicts with in, out, val (0 for a false call), dur."""
    t, out, lam = 0.0, [], c.speed * c.density
    while True:
        t += rng.expovariate(lam)
        if t > c.horizon:
            break
        cat, sup, rel = items[rng.randrange(len(items))]
        lateral = rng.random() * c.belt_width
        is_t = value_of(cat, c) > 0 and sup in ("Bottle", "Can")
        called = rng.random() < (recall(rel * c.scene_width, c) if is_t else c.false_call)
        if called:
            out.append({"in": t, "out": t + c.window / c.speed, "val": value_of(cat, c) if is_t else 0.0,
                        "dur": c.t_base + lateral / c.arm_speed})
    return out


def online(jobs, policy):
    """Greedy dispatch as in infra-sortvalue, without grasp noise. Returns attempted value."""
    free, i, queue, total = 0.0, 0, [], 0.0
    while True:
        while i < len(jobs) and jobs[i]["in"] <= free:
            queue.append(jobs[i]); i += 1
        queue = [a for a in queue if a["out"] >= free + a["dur"]]
        if not queue:
            if i >= len(jobs):
                return total
            free = jobs[i]["in"]
            continue
        if policy == "fifo":
            a = queue[0]
        elif policy == "value":
            a = max(queue, key=lambda q: q["val"])
        elif policy == "density":
            a = max(queue, key=lambda q: q["val"] / q["dur"])
        else:
            raise ValueError(policy)
        queue.remove(a)
        free += a["dur"]
        total += a["val"]


def _first_pick(cands, free, eps):
    """Best arrival-order schedule over `cands` starting no earlier than `free`; returns its first job
    (None if nothing is feasible). Finish times on an eps grid, rounded up (a schedule that can run)."""
    states = {0: (0.0, None)}  # finish (grid units) -> (value, first job), Pareto-pruned below
    for j in cands:
        if j["val"] <= 0:
            continue
        rk = int(math.ceil(max(j["in"], free) / eps))
        dk = int(math.floor(j["out"] / eps + 1e-9))
        dg = int(math.ceil(j["dur"] / eps - 1e-9))
        merged = dict(states)
        for f, (v, first) in states.items():
            nf = max(f, rk) + dg
            if nf <= dk and v + j["val"] > merged.get(nf, (-1.0, None))[0]:
                merged[nf] = (v + j["val"], first or j)
        states, best = {}, -1.0
        for f in sorted(merged):
            if merged[f][0] > best + 1e-12:
                states[f] = merged[f]; best = merged[f][0]
    v, first = max(states.values(), key=lambda x: x[0])
    return first


def rolling(jobs, lookahead, eps=0.02):
    """Rolling-horizon dispatch: whenever the arm is free, re-solve the exact schedule over the items
    now in view plus, if `lookahead` > 0, those that will arrive within `lookahead` seconds (class and
    arrival time known), and do the first pick of that plan. If the plan starts with an item that has
    not arrived yet, the arm waits for it. lookahead = 0 sees only the queue. Returns attempted value."""
    free, i, queue, total = 0.0, 0, [], 0.0
    while True:
        while i < len(jobs) and jobs[i]["in"] <= free:
            queue.append(jobs[i]); i += 1
        queue = [a for a in queue if a["out"] >= free + a["dur"]]
        if not queue and i >= len(jobs):
            return total
        ahead = [j for j in jobs[i:] if j["in"] <= free + lookahead]
        a = _first_pick(queue + ahead, free, eps) if (queue or ahead) else None
        if a is None:   # only zero-value (false-call) items in view, or nothing reachable
            queue = []
            if i >= len(jobs):
                return total
            free = max(free, jobs[i]["in"])
            continue
        if a["in"] > free:
            free = a["in"]
            continue
        queue.remove(a)
        free += a["dur"]
        total += a["val"]


def _dp(jobs, eps, rnd):
    """Best total value of a subsequence picked in arrival order; finish times on an eps grid."""
    states = [(0, 0.0)]  # (finish time in grid units, value), Pareto-pruned
    for j in jobs:
        if j["val"] <= 0:
            continue
        r, d, dur = j["in"], j["out"], j["dur"]
        rk = int(math.ceil(r / eps))        # earliest start on the grid (never earlier than arrival)
        dk = int(math.floor(d / eps + 1e-9)) # latest finish on the grid
        dg = rnd(dur / eps)
        new = []
        for f, v in states:
            nf = max(f, rk) + dg
            if nf <= dk:
                new.append((nf, v + j["val"]))
        if new:
            merged = {}
            for f, v in states + new:
                f = max(f, rk)              # idle time before the next arrival is irrelevant
                if v > merged.get(f, -1.0):
                    merged[f] = v
            states, best = [], -1.0
            for f in sorted(merged):
                if merged[f] > best + 1e-12:
                    states.append((f, merged[f])); best = merged[f]
    return max(v for f, v in states)


def optimum(jobs, eps=0.02):
    """(lower, upper) bounds on the clairvoyant optimum of attempted value. Lower is a schedule
    the cell could run; upper allows each pick to finish up to one grid step early."""
    lo = _dp(jobs, eps, lambda x: int(math.ceil(x - 1e-9)))
    hi = _dp(jobs, eps, lambda x: int(math.floor(x + 1e-9)))
    return lo, hi


def brute_force(jobs):
    """Exact optimum over every subset in every order (tiny instances only), for testing."""
    n, best = len(jobs), 0.0
    for k in range(1, n + 1):
        for sub in itertools.combinations(range(n), k):
            for perm in itertools.permutations(sub):
                f, ok = 0.0, True
                for idx in perm:
                    j = jobs[idx]
                    f = max(f, j["in"]) + j["dur"]
                    if f > j["out"] + 1e-12:
                        ok = False
                        break
                if ok:
                    best = max(best, sum(jobs[i]["val"] for i in perm))
    return best


def run_many(c, items, runs=40, seed=1):
    return [arrivals(c, items, random.Random(seed * 100003 + k)) for k in range(runs)]


def summarise(v):
    m = sum(v) / len(v)
    sd = (sum((x - m) ** 2 for x in v) / max(len(v) - 1, 1)) ** 0.5
    return m, 1.96 * sd / math.sqrt(len(v))
