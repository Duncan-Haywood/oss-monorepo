"""Write experiments/bayes_vs_rules.svg from the committed results_bayes.json (numbers never retyped). Stdlib only.

    python3 experiments/figure_bayes.py
"""
import json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "_shared"))
from linefig import write_lines  # noqa: E402


def main():
    rows = json.loads((HERE / "results_bayes.json").read_text())["rows"]
    xs = [r["sigma"] for r in rows]
    series = [(name, xs, [r[key] for r in rows]) for name, key in (
        ("clairvoyant bound (sees all scores)", "p_oracle"),
        ("Bayes policy (regression Monte Carlo)", "p_bayes"),
        ("best margin rule", "p_margin"),
        ("best cutoff rule", "p_cutoff"))]
    write_lines(HERE, "bayes_vs_rules.svg", "Noisy secretary, n = 50: P(pick the true best) on 60,000 test trials",
                "Line plot of the chance of picking the true best candidate against score noise. A Bayes policy that "
                "knows the score distribution sits far above the tuned margin and cutoff rules at every noise level "
                "and below the clairvoyant upper bound", "noise sd sigma (quality sd = 1)", "P(pick the true best)",
                series)


if __name__ == "__main__":
    main()
