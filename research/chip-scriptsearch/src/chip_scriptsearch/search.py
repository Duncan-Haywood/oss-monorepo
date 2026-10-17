"""Search over ABC pass sequences. Evaluation is the chip-ppa-sky130mac flow (imported by relative path, not copied)."""
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(HERE.parent / "chip-ppa-sky130mac" / "src"))
from chip_ppa_sky130mac import flow  # noqa: E402

PASSES = ["balance", "rewrite", "rewrite -z", "refactor", "refactor -z", "dc2", "dch"]
DESIGNS = {"ref": HERE.parent / "chip-ppa-sky130mac" / "designs" / "mac4.v",
           "csa": HERE.parent / "chip-ppa-sky130mac" / "proposals" / "mac4" / "p0_csa.v"}
MAXLEN = 3


def script_text(seq):
    """A sequence of passes becomes `strash; <passes>; map` (ABC's `dc2`/`dch` need an AIG, hence strash first)."""
    return "; ".join(["strash"] + list(seq) + ["map"])


class Evaluator:
    """Caches results; `calls` counts distinct (design, sequence) evaluations, which is the budget unit."""

    def __init__(self, liberty):
        self.lib = str(liberty)
        self.cache = {}

    @property
    def calls(self):
        return len(self.cache)

    def __call__(self, point):
        design, seq = point
        if point not in self.cache:
            name = "seq:" + "|".join(seq)
            flow.SCRIPTS[name] = script_text(seq)
            top = "mac4"
            try:
                r = flow.map_sky130(DESIGNS[design], top, name, self.lib)
                self.cache[point] = r["area_um2"] * r["delay_ps"] / 1000.0  # um^2 * ns
            except RuntimeError:  # ABC aborts on e.g. `dch` followed by `rewrite`; the evaluation still costs budget
                self.cache[point] = float("inf")
        return self.cache[point]


def random_point(rng):
    n = rng.randint(0, MAXLEN)
    return (rng.choice(sorted(DESIGNS)), tuple(rng.choice(PASSES) for _ in range(n)))


def neighbour(point, rng):
    """One edit: swap the design, or insert / delete / replace one pass."""
    design, seq = point
    seq = list(seq)
    moves = ["design", "replace"] + (["insert"] if len(seq) < MAXLEN else []) + (["delete"] if seq else [])
    m = rng.choice(moves)
    if m == "design":
        design = [d for d in sorted(DESIGNS) if d != design][0]
    elif m == "insert":
        seq.insert(rng.randint(0, len(seq)), rng.choice(PASSES))
    elif m == "delete":
        del seq[rng.randrange(len(seq))]
    elif seq:
        seq[rng.randrange(len(seq))] = rng.choice(PASSES)
    return (design, tuple(seq))


def random_search(ev, budget, rng):
    """Best score after `budget` distinct evaluations of uniformly drawn points (length uniform on 0..3, then passes uniform)."""
    best = None
    while ev.calls < budget:
        p = random_point(rng)
        s = ev(p)
        best = s if best is None or s < best else best
    return best


def hill_climb(ev, budget, rng):
    """First-improvement hill climbing from a random start, one edit per step; restarts from a fresh point after 8 failed edits."""
    best, cur, cs, fails = None, None, None, 0
    while ev.calls < budget:
        if cur is None or fails >= 8:
            cur = random_point(rng)
            cs = ev(cur)
            fails = 0
        else:
            q = neighbour(cur, rng)
            s = ev(q)
            if s < cs:
                cur, cs, fails = q, s, 0
            else:
                fails += 1
        best = min(ev.cache.values())
    return best


def all_points(maxlen):
    """Every (design, sequence) with sequence length 0..maxlen."""
    out = []
    for d in sorted(DESIGNS):
        level = [()]
        out.append((d, ()))
        for _ in range(maxlen):
            level = [s + (p,) for s in level for p in PASSES]
            out.extend((d, s) for s in level)
    return out


class TableEvaluator:
    """Replays a precomputed {point: score} table with the Evaluator interface. The flow is deterministic, so this gives
    the same numbers as re-running it. `calls` counts distinct points asked for."""

    def __init__(self, table):
        self.table = table
        self.cache = {}

    @property
    def calls(self):
        return len(self.cache)

    def __call__(self, point):
        if point not in self.cache:
            self.cache[point] = self.table[point]
        return self.cache[point]


def key(point):
    return point[0] + ":" + "|".join(point[1])
