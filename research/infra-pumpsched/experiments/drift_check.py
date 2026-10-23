"""Is a free-form search's gain real or bought with tank drawdown?  PYTHONPATH=src python experiments/drift_check.py
Re-runs the same GA seeds as run_hourly.py for the cases where it beat the two-run optimum, prints the winning mask, its tank drift,
and its cost after pricing the drift at pump 10's own energy per m3 (drawdown is water not pumped today and owed tomorrow)."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from infra_pumpsched.hourly import Evaluator, genetic  # noqa: E402
from infra_pumpsched.sched import cost, simulate, tariff  # noqa: E402

base = simulate(1, 14)
kwh_per_m3 = base["kwh"]["10"].sum() / base["pump10_m3"]


def store_best(pr):
    """Best feasible one- or two-run mask for a tariff (the exhaustive grid of run_hourly.py, rebuilt from its cache)."""
    from run_hourly import load
    from infra_pumpsched.hourly import feasible
    store = load()
    return min((m for m, r in store.items() if feasible(r)), key=lambda m: cost(store[m], pr))


def runs(m):
    out, h = [], 0
    while h < 24:
        if m[h]:
            j = h
            while j < 24 and m[j]:
                j += 1
            out.append(f"{h:02d}-{j:02d}")
            h = j
        else:
            h += 1
    return " ".join(out)


print(f"pump 10 energy per m3 delivered: {kwh_per_m3 * 1000:.1f} Wh/m3")
print("tariff | ratio | seed | cost % of shipped | tank drift m3 (% of demand) | cost % with drift priced at flat kWh/m3 x mean price | schedule")
for kind, ratio in (("evening", 1.5), ("daytime", 1.5), ("midday-cheap", 1.5), ("midday-cheap", 10)):
    pr = tariff(kind, ratio)
    c0 = cost(base, pr)
    ref = store_best(pr)
    rr = Evaluator()(ref)
    print(f"{kind} | {ratio} | two-run optimum | {100 * cost(rr, pr) / c0:.1f} | {rr['drift_m3']:.0f} ({100 * rr['drift_m3'] / rr['demand_m3']:.2f}) | "
          f"{100 * (cost(rr, pr) - rr['drift_m3'] * kwh_per_m3 * pr.mean()) / c0:.1f} | {runs(ref)}")
    for s in (0, 1, 2):
        ev = Evaluator()
        m, f = genetic(ev, pr, 600, np.random.default_rng(100 + s))
        r = ev(m)
        # drift > 0: tanks gained water (extra pumped, cost already paid); < 0: drawn down (pumping owed later)
        owed = -r["drift_m3"] * kwh_per_m3 * pr.mean()
        print(f"{kind} | {ratio} | {s} | {100 * f / c0:.1f} | {r['drift_m3']:.0f} ({100 * r['drift_m3'] / r['demand_m3']:.2f}) | {100 * (f + owed) / c0:.1f} | {runs(m)}")
