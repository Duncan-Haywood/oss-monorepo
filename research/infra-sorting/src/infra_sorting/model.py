"""Single-robot pick cell on a moving waste belt, driven by TACO's real class mix and sizes.

Items come from `data/taco_items.csv` (TACO annotations: category and linear size as a
fraction of the photo). They arrive as a Poisson stream on a belt moving at `speed` m/s with
`density` items per metre. A robot reaches a window of `window` m of belt; an item is in reach
for window/speed seconds. A detector marks an item as target with a recall that grows with the
item's physical size (assumed logistic, not a trained network) and a false-call rate on
non-targets. The robot picks one called item at a time (`pick_time` s, grasp success `grasp`),
and must finish the pick before the item leaves the window.

Outputs: purity (true targets / items in the target bin), recovery (true targets picked /
true targets that arrived) and picks per minute.
"""
import csv, math, os, random
from dataclasses import dataclass, replace

HERE = os.path.dirname(os.path.abspath(__file__))
TABLE = os.path.join(HERE, "..", "..", "data", "taco_items.csv")
TARGET = ("Bottle", "Can")          # supercategories sorted into the target bin


@dataclass(frozen=True)
class Config:
    speed: float = 0.5          # belt speed, m/s
    density: float = 3.0        # items per metre of belt
    window: float = 1.0         # robot reach along the belt, m
    pick_time: float = 1.0      # s per pick cycle (grasp, move, release, return)
    grasp: float = 0.95         # probability a pick of a called item succeeds
    scene_width: float = 0.6    # m of ground a TACO photo spans (assumed, converts rel_size to cm)
    s50: float = 0.04           # item size (m) at which recall is half its ceiling
    slope: float = 0.015        # logistic width of the recall curve, m
    recall_max: float = 0.97    # ceiling of detector recall on large items
    false_call: float = 0.03    # probability a non-target is called target
    policy: str = "fifo"        # fifo | lifo | largest
    horizon: float = 1800.0     # simulated seconds of belt


def load_items(path=TABLE):
    with open(path) as f:
        return [(r["supercategory"], float(r["rel_size"])) for r in csv.DictReader(f)]


def recall(size_m, c):
    return c.recall_max / (1.0 + math.exp(-(size_m - c.s50) / c.slope))


def simulate(c, items, rng):
    """Return dict of counts for one run."""
    t, arrivals = 0.0, []
    lam = c.speed * c.density
    while True:
        t += rng.expovariate(lam)
        if t > c.horizon:
            break
        cat, rel = items[rng.randrange(len(items))]
        size = rel * c.scene_width
        is_t = cat in TARGET
        called = rng.random() < (recall(size, c) if is_t else c.false_call)
        arrivals.append((t, t + c.window / c.speed, is_t, called, size))
    n_target = sum(1 for a in arrivals if a[2])
    pending = [a for a in arrivals if a[3]]         # called items, ordered by entry time
    picked_t = picked_f = missed_grasp = 0
    free = 0.0
    i = 0
    queue = []                                      # called items that have entered the window
    while True:
        while i < len(pending) and pending[i][0] <= free:
            queue.append(pending[i]); i += 1
        queue = [a for a in queue if a[1] >= free + c.pick_time]   # drop those that will have left
        if not queue:
            if i >= len(pending):
                break
            free = pending[i][0]
            continue
        if c.policy == "fifo":
            k = 0
        elif c.policy == "lifo":
            k = len(queue) - 1
        else:
            k = max(range(len(queue)), key=lambda j: queue[j][4])
        a = queue.pop(k)
        free += c.pick_time
        if rng.random() < c.grasp:
            if a[2]:
                picked_t += 1
            else:
                picked_f += 1
        else:
            missed_grasp += 1
    total = picked_t + picked_f
    return {"target": n_target, "items": len(arrivals), "picked_t": picked_t, "picked_f": picked_f,
            "purity": picked_t / total if total else float("nan"),
            "recovery": picked_t / n_target if n_target else float("nan"),
            "picks_min": total / (c.horizon / 60.0), "grasp_fail": missed_grasp}


def run_many(c, items, runs=40, seed=1):
    return [simulate(c, items, random.Random(seed * 100003 + k)) for k in range(runs)]


def summarise(rs, key):
    v = [r[key] for r in rs if r[key] == r[key]]
    if not v:
        return float("nan"), float("nan")
    m = sum(v) / len(v)
    sd = (sum((x - m) ** 2 for x in v) / max(len(v) - 1, 1)) ** 0.5
    return m, 1.96 * sd / math.sqrt(len(v))
