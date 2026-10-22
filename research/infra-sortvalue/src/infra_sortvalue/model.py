"""Value-aware dispatch for a single-robot belt pick cell (extends `infra-sorting`).

`infra-sorting` found that FIFO, LIFO and largest-first tie, because every item had the same
value, the same pick time and the same window. Here items differ in value (by TACO category)
and in arm travel (by lateral position on the belt), so a pick order can matter. The detector,
belt and TACO class mix are those of `infra-sorting`, copied so this project stands alone.

Value per pick is in "PET-bottle units". The per-category weights are ASSUMED (see README) and
swept: `can_value` scales aluminium drink cans against plastic bottles.
Policies: fifo | value (highest value first) | density (value per second of pick).
A pick is only attempted if it can finish before the item leaves reach.
"""
import csv, math, os, random
from dataclasses import dataclass

HERE = os.path.dirname(os.path.abspath(__file__))
TABLE = os.path.join(HERE, "..", "..", "data", "taco_items.csv")

# category -> weight relative to a clear plastic bottle (1.0). Assumed, swept via can_value.
VALUE_CLASS = {"Clear plastic bottle": 1.0, "Other plastic bottle": 0.6, "Glass bottle": 0.15,
               "Drink can": None,           # = Config.can_value
               "Food Can": 0.3, "Aerosol": 0.3}


@dataclass(frozen=True)
class Config:
    speed: float = 0.5
    density: float = 6.0        # items per metre (overloaded on purpose; infra-sorting used 3)
    window: float = 1.0
    t_base: float = 0.5         # s fixed part of a pick (grasp, release)
    arm_speed: float = 0.6      # m/s lateral arm speed; travel = lateral offset / arm_speed
    belt_width: float = 0.6     # m; lateral offset uniform in [0, belt_width]
    grasp: float = 0.95
    scene_width: float = 0.6
    s50: float = 0.04
    slope: float = 0.015
    recall_max: float = 0.97
    false_call: float = 0.03
    can_value: float = 4.0      # aluminium drink can, in plastic-bottle units (assumed, swept)
    false_cost: float = 0.0     # value lost per non-target put in the bin (contamination)
    policy: str = "fifo"
    horizon: float = 1800.0


def load_items(path=TABLE):
    with open(path) as f:
        return [(r["category"], r["supercategory"], float(r["rel_size"])) for r in csv.DictReader(f)]


def value_of(cat, c):
    v = VALUE_CLASS.get(cat)
    return c.can_value if cat == "Drink can" else (v or 0.0)


def recall(size_m, c):
    return c.recall_max / (1.0 + math.exp(-(size_m - c.s50) / c.slope))


def simulate(c, items, rng):
    t, arr = 0.0, []
    lam = c.speed * c.density
    while True:
        t += rng.expovariate(lam)
        if t > c.horizon:
            break
        cat, sup, rel = items[rng.randrange(len(items))]
        lateral = rng.random() * c.belt_width
        is_t = value_of(cat, c) > 0 and sup in ("Bottle", "Can")
        called = rng.random() < (recall(rel * c.scene_width, c) if is_t else c.false_call)
        dur = c.t_base + lateral / c.arm_speed
        arr.append({"in": t, "out": t + c.window / c.speed, "t": is_t, "call": called,
                    "val": value_of(cat, c) if is_t else -c.false_cost, "dur": dur})
    total_value_avail = sum(a["val"] for a in arr if a["t"])
    pending = [a for a in arr if a["call"]]
    free, i, queue, revenue, n_picks = 0.0, 0, [], 0.0, 0
    while True:
        while i < len(pending) and pending[i]["in"] <= free:
            queue.append(pending[i]); i += 1
        queue = [a for a in queue if a["out"] >= free + a["dur"]]
        if not queue:
            if i >= len(pending):
                break
            free = pending[i]["in"]
            continue
        if c.policy == "fifo":
            a = queue[0]
        elif c.policy == "value":
            a = max(queue, key=lambda q: q["val"])
        elif c.policy == "density":
            a = max(queue, key=lambda q: q["val"] / q["dur"])
        else:
            raise ValueError(c.policy)
        queue.remove(a)
        free += a["dur"]
        if rng.random() < c.grasp:
            revenue += a["val"]; n_picks += 1
    return {"revenue": revenue, "available": total_value_avail, "share": revenue / total_value_avail if total_value_avail else float("nan"),
            "per_min": revenue / (c.horizon / 60.0), "picks_min": n_picks / (c.horizon / 60.0)}


def run_many(c, items, runs=40, seed=1):
    return [simulate(c, items, random.Random(seed * 100003 + k)) for k in range(runs)]


def summarise(rs, key):
    v = [r[key] for r in rs if r[key] == r[key]]
    m = sum(v) / len(v)
    sd = (sum((x - m) ** 2 for x in v) / max(len(v) - 1, 1)) ** 0.5
    return m, 1.96 * sd / math.sqrt(len(v))
