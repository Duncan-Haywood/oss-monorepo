"""Shared-clock analysis for the chip-systolic designs (4-vector batch): feasibility, latency, and the best design by area x latency.

Mapping itself reuses `eda-clocksweep` (ABC `map -D T; upsize; dnsize`) and `eda-sky130rung` (`map_full`)."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(HERE.parent / "eda-clocksweep" / "src"))
from eda_clocksweep import sweep as S  # noqa: E402,F401

met = S.met
script = S.script
feasible_front = S.feasible_front


def label(r):
    return f"{'sys4x%d' % r['c'] if r['kind'] == 'systolic' else 'lane%d' % r['c']}w{r['wb']}"


def best(rows, period_ps, kind=None):
    """Index of the feasible design with least area x (cycles x T); None if no design meets the target."""
    ok = [i for i, r in enumerate(rows) if met(r, period_ps) and (kind is None or r["kind"] == kind)]
    return min(ok, key=lambda i: rows[i]["area_um2"] * rows[i]["cycles"]) if ok else None


def kind_verdict(rows, period_ps):
    """'systolic', 'lane' or None: which family holds the best area x latency among designs meeting the target."""
    i = best(rows, period_ps)
    return None if i is None else rows[i]["kind"]
