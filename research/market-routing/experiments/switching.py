"""Piecewise-stationary expert routing: softmax (LMSR) vs sparsemax (quadratic)
markets, with and without forgetting. Prints a markdown table.

    PYTHONPATH=src python3 experiments/switching.py
"""
import random
import statistics as st

from market_routing import EntropicMarket, QuadraticMarket, run_routing

N, T, BLOCK, SEEDS = 16, 3000, 500, 6
P_BEST, P_OTHER = 0.65, 0.5   # Bernoulli gains: per-round gap 0.15, sd ~0.5


def make_env(seed):
    rng = random.Random(seed)
    order = [rng.randrange(N) for _ in range(T // BLOCK)]
    for i in range(1, len(order)):           # force a real switch each block
        while order[i] == order[i - 1]:
            order[i] = rng.randrange(N)
    best = [order[t // BLOCK] for t in range(T)]
    gains = [[1.0 if rng.random() < (P_BEST if i == best[t] else P_OTHER) else 0.0
              for i in range(N)] for t in range(T)]
    return gains, best


BS = (0.1, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0)
DECAY = 0.99


def main():
    envs = [make_env(s) for s in range(SEEDS)]
    print(f"n={N} experts, T={T}, best switches every {BLOCK}, {SEEDS} seeds, forgetting decay {DECAY}")
    print("(active = experts with weight > 1e-3; no-forgetting baseline shown at the end)\n")
    print("| b | LMSR regret | LMSR active | sparsemax regret | sparsemax active |")
    print("|---|---|---|---|---|")
    for b in BS:
        out = []
        for M in (EntropicMarket, QuadraticMarket):
            rs = [run_routing(M(N, b), g, decay=DECAY, best_seq=bs) for g, bs in envs]
            out += [st.mean(r.switching_regret for r in rs), st.mean(r.mean_active for r in rs)]
        print(f"| {b:g} | {out[0]:.1f} | {out[1]:.1f} | {out[2]:.1f} | {out[3]:.1f} |")
    for M, name in ((EntropicMarket, "LMSR"), (QuadraticMarket, "sparsemax")):
        rs = [run_routing(M(N, 1.0), g, best_seq=bs) for g, bs in envs]
        print(f"\nno forgetting, b=1, {name}: switching regret {st.mean(r.switching_regret for r in rs):.1f}")


if __name__ == "__main__":
    main()
