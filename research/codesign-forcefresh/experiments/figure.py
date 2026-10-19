"""Write experiments/best_so_far.svg: best feasible test success after n evaluations, from results.json.

    python experiments/figure.py

Baselines: median over seeds. Session agent: its single trajectory of 40 proposals (four rounds of 10).
"""
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def curve(recs):
    best, out = 0.0, []
    for r in recs:
        if r["feasible"]:
            best = max(best, r["success"])
        out.append(best)
    return out


def main():
    res = json.loads((HERE / "results.json").read_text())
    n = res["budget"]
    xs = list(range(1, n + 1))
    series = []
    for name, m in res["methods"].items():
        cs = [curve(r) for r in m["recs"]]
        series.append((name + " (median of %d)" % len(cs), xs, [statistics.median(c[i] for c in cs) for i in range(n)]))
    series.append(("session agent (n = 1)", xs, curve(res["agent"]["recs"])))
    write_lines(HERE, "best_so_far.svg", "Gripper co-design: best test success after n evaluations",
                "Line plot of the best grasp success rate found so far against the number of simulated designs, for random search, CMA-ES, "
                "Bayesian optimisation (medians over seeds) and one trajectory of session-agent proposals",
                "designs evaluated (each trains a grasp force in MuJoCo)", "best test success (40 scenes)", series)


if __name__ == "__main__":
    main()
