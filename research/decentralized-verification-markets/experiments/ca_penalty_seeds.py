"""Bonus-only vs published multi-task Correlated Agreement over ten seeds.

Same population as run_experiment.py (2000 tasks, 15% corruption, 14 honest
/ 3 lazy / 3 colluding / 2 adversarial). Prints the honest advantage over
the best deviation for each CA variant. About 6 s.

    python3 experiments/ca_penalty_seeds.py
"""

import os
import statistics
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from verification_markets.metrics import (  # noqa: E402
    average_payoff_by_strategy,
    incentive_compatibility_gap,
)
from verification_markets.simulation import SimulationConfig, run_simulation  # noqa: E402

COLUMNS = (
    ("bonus-only, full", "ca_payoff"),
    ("bonus-only, held-out", "ca_scoring_payoff"),
    ("trust-weighted, held-out", "ca_trust_payoff"),
    ("multi-task sign, full", "ca_multitask_payoff"),
    ("multi-task Delta, full", "ca_multitask_delta_payoff"),
    ("multi-task sign, held-out", "ca_multitask_scoring_payoff"),
)


def main() -> None:
    rows = []
    for seed in range(1, 11):
        r = run_simulation(SimulationConfig(
            n_tasks=2000, corruption_rate=0.15, signal_noise=0.1,
            n_honest=14, n_lazy=3, n_colluding=3, n_adversarial=2,
            market_liquidity=5.0, audit_fraction=0.05, seed=seed,
        ))
        rows.append([
            incentive_compatibility_gap(average_payoff_by_strategy(r, getattr(r, attr)))
            for _, attr in COLUMNS
        ])
    print("| seed | " + " | ".join(name for name, _ in COLUMNS) + " |")
    print("|---" * (len(COLUMNS) + 1) + "|")
    for seed, row in zip(range(1, 11), rows):
        print(f"| {seed} | " + " | ".join(f"{v:+.2f}" for v in row) + " |")
    cols = list(zip(*rows))
    print("| mean | " + " | ".join(f"{statistics.mean(c):+.2f}" for c in cols) + " |")
    print("| min | " + " | ".join(f"{min(c):+.2f}" for c in cols) + " |")
    print("| seeds with honest ahead | " + " | ".join(f"{sum(v > 0 for v in c)}/10" for c in cols) + " |")


if __name__ == "__main__":
    main()
