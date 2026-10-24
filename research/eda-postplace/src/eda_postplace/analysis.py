"""Pure analysis of placed.json rows: does ABC's pre-layout view rank designs the way the placed view does?"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "eda-sky130rung" / "src"))
from eda_sky130rung import rank as R  # noqa: E402

STAGES = ("netlist", "placed", "repaired")


def rho(rows, a, b):
    return R.spearman([r[a] for r in rows], [r[b] for r in rows])


def meets(rows, key, period_ns):
    """Indices of rows whose `key` (a period in ns) is at most `period_ns`."""
    return [i for i, r in enumerate(rows) if r[key] <= period_ns]


def front(rows, idx, area_key):
    """Indices of the (area, cycles) Pareto front within `idx`."""
    keep = R.pareto_idx([(rows[i][area_key], rows[i]["cycles"]) for i in idx])
    return [idx[k] for k in keep]


def best_area_latency(rows, idx, area_key, period_ns):
    """Index in `idx` with the lowest area x cycles at one shared clock `period_ns` (cycles x T is the latency)."""
    return min(idx, key=lambda i: rows[i][area_key] * rows[i]["cycles"] * period_ns) if idx else None


def best_own_clock(rows, area_key, period_key):
    """Index with the lowest area x cycles x (its own achieved period): each design runs as fast as it can."""
    return min(range(len(rows)), key=lambda i: rows[i][area_key] * rows[i]["cycles"] * rows[i][period_key])


def wire_penalty(rows):
    """Placed implied period over the no-wire netlist implied period, per row."""
    return [r["placed_period_ns"] / r["netlist_period_ns"] for r in rows]


def quantiles(xs):
    xs = sorted(xs)
    n = len(xs)
    return xs[0], xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2, xs[-1]
