"""Milestone 5zk figure: where the plating sits through the negative electrode at cycle 2 (median node share by set)."""
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[2] / "_shared"))
from linefig import write_lines  # noqa: E402

SETS = ("Ai2020@0.45x", "Chen2020@1.5x", "OKane2022@1.5x", "NCA_Kim2011@0.875x")


def main():
    runs = [json.loads(l) for l in (HERE / "bench.jsonl").open() if '"ok": true' in l]
    series = []
    for c in SETS:
        rs = [r for r in runs if r["cond"] == c and r.get("ok_cycles", 0) >= 100]
        shares = [[v / sum(r["pl_node"][1]) for v in r["pl_node"][1]] for r in rs]
        xs = [x / rs[0]["L_n"] for x in rs[0]["x_n"]]
        series.append((c.split("@")[0], xs, [statistics.median(s[i] for s in shares) for i in range(len(xs))]))
    write_lines(HERE, "depth.svg", "Where plating happens in the negative electrode (cycle 2)",
                "Median share of each node's plating over the cycle, by PyBaMM parameter set",
                "depth from current collector (1 = separator side)", "share of the cycle's plating", series,
                xticks=[0, 0.2, 0.4, 0.6, 0.8, 1.0])


if __name__ == "__main__":
    main()
