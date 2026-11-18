"""Exact sign test and cell-level bootstrap for neural minus boosted pinball, from results/*.json.
Stdlib only. Cells (5 pairs x 3 quantiles x 3 years) share data across quantiles and years, so they
are not independent: the p-values are descriptive, not a formal test."""
import random
from math import comb
from summarise_neural import collect


def sign_p(k, n):
    """Two-sided exact binomial p-value, null p=0.5."""
    tail = sum(comb(n, i) for i in range(0, min(k, n - k) + 1)) / 2 ** n
    return min(1.0, 2 * tail)


def boot_mean_ci(xs, b=10000, seed=0):
    r = random.Random(seed)
    m = sorted(sum(r.choice(xs) for _ in xs) / len(xs) for _ in range(b))
    return m[int(0.025 * b)], m[int(0.975 * b)]


if __name__ == "__main__":
    flat = [(y, x) for y, _, _, r in collect() for x in r]
    for label, xs in [("all", [x for _, x in flat])] + [(str(y), [x for yy, x in flat if yy == y]) for y in (2022, 2023, 2024)]:
        k = sum(x < 0 for x in xs)
        lo, hi = boot_mean_ci(xs)
        print(f"{label}: n={len(xs)} neural ahead {k}; sign p={sign_p(k, len(xs)):.3f}; mean {sum(xs)/len(xs):+.2f}% (95% boot {lo:+.2f}, {hi:+.2f})")
