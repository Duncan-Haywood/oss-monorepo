"""Clock-constrained SKY130 mapping: ABC `map -D T` followed by `upsize -D T; dnsize -D T`, and the analysis helpers.

The flow itself is `eda-sky130rung`'s `map_full` (Yosys `dfflibmap` + `abc -liberty -script`); only the ABC script changes."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(HERE.parent / "eda-sky130rung" / "src"))
from eda_sky130rung import flow as F, rank as R  # noqa: E402,F401

UNCONSTRAINED = "strash; dc2; map; topo; stime"


def script(period_ps):
    """ABC script that maps for, then sizes to, a target combinational delay in picoseconds (None = unconstrained)."""
    if period_ps is None:
        return UNCONSTRAINED
    t = int(period_ps)
    return f"strash; dc2; map -D {t}; topo; upsize -D {t}; dnsize -D {t}; stime"


def met(row, period_ps):
    """A design meets a target if ABC's reported critical-path delay is at most the target."""
    return row["delay_ps"] <= period_ps


def feasible_front(rows, period_ps):
    """Indices of the (area, cycles) Pareto front among designs that meet `period_ps` (latency = cycles x period)."""
    idx = [i for i, r in enumerate(rows) if met(r, period_ps)]
    keep = R.pareto_idx([(rows[i]["area_um2"], rows[i]["cycles"]) for i in idx])
    return [idx[k] for k in keep]
