"""Milestone 5zh figure: how many of the 24 pools the per-set plating exponent's 90th-percentile error beats the
physical exponent on, against the number k of earlier 100-cycle runs it is calibrated on (A scattered, B one campaign);
and the same count for the median over resamples. Read from summary.json."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

P = json.loads((HERE / "summary.json").read_text())["pools"].values()


def count(proto, stat):
    ks = sorted({int(k) for d in P for k in d[proto]})
    return ks, [sum(d[proto][str(k)][stat] < d["phys"] for d in P) for k in ks]


series = []
for proto, lab in (("A", "scattered runs"), ("B", "one earlier campaign")):
    for stat, s in (("q90", "90th percentile"), ("med", "median")):
        xs, ys = count(proto, stat)
        series.append((f"{lab}, {s}", xs, ys))
write_lines(HERE, "fewruns.svg", "Milestone 5zh: pools (of 24) where k earlier runs beat alpha F/RT",
            "Pools where the per-set plating exponent calibrated on k earlier 100-cycle runs beats the physical exponent",
            "earlier 100-cycle runs k", "pools beating kappa = 25.3 (of 24)", series, logx=True, hline=24)
