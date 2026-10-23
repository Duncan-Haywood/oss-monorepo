"""Hourly on/off schedule for pump 10 (24 bits) by genetic algorithm and by random search, against the best single window.
PYTHONPATH=src python experiments/hourly.py > experiments/hourly_results.txt"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from infra_pumpsched.sched import build_hourly, cost, simulate, tariff, total_kwh  # noqa: E402

STEP, DRIFT_MAX, TANK_MARGIN, PMIN = 900, 0.01, 0.5, 14.06
BUDGET, POP, SEEDS = 1200, 30, (0, 1, 2)
CASES = (("evening", 3), ("evening", 10), ("daytime", 3))


def feasible(r):
    return r["min_pressure"] >= PMIN and r["tank_min_margin"] >= TANK_MARGIN and abs(r["drift_m3"]) <= DRIFT_MAX * r["demand_m3"]


def window_bits(s, h):
    b = np.zeros(24, int)
    for i in range(h):
        b[(s + i) % 24] = 1
    return b


class Evaluator:
    def __init__(self, price):
        self.price, self.cache, self.n = price, {}, 0

    def __call__(self, bits):
        key = tuple(int(x) for x in bits)
        if key not in self.cache:
            self.n += 1
            try:
                r = simulate(0, 0, step=STEP, wn=build_hourly(key, step=STEP))
            except ValueError:  # EPANET wrote no results (the network cannot be solved with this pump schedule)
                self.cache[key] = (1e9, None)
                return 1e9
            # infeasible schedules are ranked below every feasible one, by how far they miss
            miss = max(0, (abs(r["drift_m3"]) / r["demand_m3"] - DRIFT_MAX)) + max(0, TANK_MARGIN - r["tank_min_margin"]) + max(0, PMIN - r["min_pressure"])
            self.cache[key] = (cost(r, self.price) if feasible(r) else 1e6 * (1 + miss), r)
        return self.cache[key][0]


def ga(ev, rng, budget):
    pop = [rng.integers(0, 2, 24) for _ in range(POP - 3)] + [window_bits(1, 14), window_bits(1, 21), window_bits(21, 19)]
    fit = [ev(p) for p in pop]
    while ev.n < budget:
        def pick():
            i, j = rng.integers(0, len(pop), 2)
            return pop[i] if fit[i] < fit[j] else pop[j]
        a, b = pick(), pick()
        cut = rng.integers(1, 24)
        child = np.concatenate([a[:cut], b[cut:]])
        flip = rng.random(24) < 1 / 24
        child = np.where(flip, 1 - child, child)
        f = ev(child)
        w = int(np.argmax(fit))
        if f < fit[w]:
            pop[w], fit[w] = child, f
    return min(fit)


def random_search(ev, rng, budget):
    best = 1e18
    while ev.n < budget:
        best = min(best, ev(rng.integers(0, 2, 24)))
    return best


def main():
    base = simulate(1, 14, step=STEP)
    print(f"step {STEP} s; evaluation budget {BUDGET} per run, population {POP}, seeds {list(SEEDS)}; shipped {total_kwh(base):,.0f} kWh")
    print("tariff | ratio | shipped cost | best window (409 evals) | GA mean (min-max) | random search mean (min-max) | GA best kWh | GA best hours on")
    for kind, ratio in CASES:
        price = tariff(kind, ratio)
        c0 = cost(base, price)
        wev = Evaluator(price)
        best_w = min(wev(window_bits(s, h)) for s in range(24) for h in list(range(6, 23)) + [24] if not (h == 24 and s))
        g, rs, bestga = [], [], (1e18, None)
        for sd in SEEDS:
            ev = Evaluator(price)
            g.append(ga(ev, np.random.default_rng(sd), BUDGET))
            for k, (f, r) in ev.cache.items():
                if r is not None and f < bestga[0]:
                    bestga = (f, k, total_kwh(r))
            rs.append(random_search(Evaluator(price), np.random.default_rng(100 + sd), BUDGET))
        pct = lambda x: f"{100 * x / c0:.1f}"
        rng_ = lambda v: f"{pct(np.mean(v))} ({pct(min(v))}-{pct(max(v))})"
        hrs = "".join(str(b) for b in bestga[1])
        print(f"{kind} | {ratio} | {c0:,.0f} | {pct(best_w)} | {rng_(g)} | {rng_(rs)} | {bestga[2]:,.0f} | {hrs}")
    print("(costs as % of the shipped schedule's cost; lower is better)")


if __name__ == "__main__":
    main()
