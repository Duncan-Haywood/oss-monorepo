"""Wright (1936) learning curve for sewing labour, with a floor at the experienced-operator time.

Unit n takes  t(n) = max(floor, t1 * n**b),  b = log2(rate)  (rate 0.85 means each doubling of
cumulative output cuts unit time by 15%).  All inputs are assumptions supplied by the caller.
"""
import math

__all__ = ["unit_minutes", "cumulative_minutes", "units_to_reach", "labour_cost_per_unit",
           "average_cost_over"]


def _b(rate):
    if not 0.0 < rate < 1.0:
        raise ValueError("learning rate must be in (0, 1)")
    return math.log2(rate)


def unit_minutes(n, t1, rate, floor=0.0):
    """Minutes for the n-th unit (n >= 1)."""
    if n < 1:
        raise ValueError("n >= 1")
    return max(floor, t1 * n ** _b(rate))


def cumulative_minutes(n, t1, rate, floor=0.0):
    """Total minutes for units 1..n (exact sum, no integral approximation)."""
    return sum(unit_minutes(i, t1, rate, floor) for i in range(1, int(n) + 1))


def units_to_reach(target, t1, rate, floor=0.0, limit=10**7):
    """Smallest n whose unit time is <= target minutes, or None if never within `limit`
    (a target below the floor is unreachable)."""
    if target < floor:
        return None
    if t1 <= target:
        return 1
    n = math.ceil((target / t1) ** (1.0 / _b(rate)))
    n = max(n, 1)
    while n > 1 and unit_minutes(n - 1, t1, rate, floor) <= target:
        n -= 1
    while unit_minutes(n, t1, rate, floor) > target:
        n += 1
        if n > limit:
            return None
    return n


def labour_cost_per_unit(n, t1, rate, wage_per_hour, floor=0.0, efficiency=1.0):
    """Cost of the n-th unit's sewing labour."""
    return unit_minutes(n, t1, rate, floor) / 60.0 * wage_per_hour / efficiency


def average_cost_over(n, t1, rate, wage_per_hour, floor=0.0, efficiency=1.0):
    """Mean labour cost per unit over the first n units."""
    return cumulative_minutes(n, t1, rate, floor) / n / 60.0 * wage_per_hour / efficiency
