"""Milestone 2a: do the circuit rankings survive random cycles bounded by a machine envelope?

Envelope (flows from a search-result summary of the Kubota KX018-4 sheet, page not opened; the
180 bar ceiling is an unverified parts-site figure): section capacities 17.3, 17.3, 10.4 L/min,
pump 45 L/min total, pressures 20 to 180 bar. Cycles are random, not measured.
Stdlib, deterministic (seeded), a few seconds.
"""
import random, statistics, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from heavy_hydraulics import Phase, Actuator, cycle_energy, CIRCUITS

SECTION = (17.3, 17.3, 10.4)
PUMP = 45.0
SEEDS = (0, 1, 2, 3, 4)
N_PER_SEED = 4000


def random_cycle(rng, equal_pressure=False):
    phases = []
    for i in range(4):
        n = rng.randint(1, 3)
        secs = rng.sample(range(3), n)
        flows = [rng.uniform(0.2, 1.0) * SECTION[j] for j in secs]
        tot = sum(flows)
        if tot > PUMP:
            flows = [f * PUMP / tot for f in flows]
        p0 = rng.uniform(20, 180)
        acts = tuple(Actuator(p0 if equal_pressure else rng.uniform(20, 180), f) for f in flows)
        phases.append(Phase(f"p{i}", rng.uniform(2, 6), acts))
    return tuple(phases)


def draw(equal_pressure, seed):
    rng = random.Random(seed)
    out = []
    for _ in range(N_PER_SEED):
        c = random_cycle(rng, equal_pressure)
        kw = dict(pump_flow=PUMP, dp_ls=rng.uniform(14, 30), dp_spool=rng.uniform(5, 20),
                  dp_m=rng.uniform(3, 10), eta_pump=rng.uniform(0.75, 0.92))
        out.append({k: cycle_energy(c, k, **kw)["shaft_J"] for k in CIRCUITS})
    return out


def q(xs, f):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(f * len(xs)))]


def report(label, equal_pressure):
    per_seed = []
    allr = []
    for s in SEEDS:
        r = draw(equal_pressure, 1000 * equal_pressure + s)
        allr += r
        per_seed.append((statistics.median(x["load_sensing"] / x["open_centre"] for x in r),
                         statistics.median(x["metered"] / x["load_sensing"] for x in r)))
    ls = [x["load_sensing"] / x["open_centre"] for x in allr]
    mt = [x["metered"] / x["load_sensing"] for x in allr]
    order = sum(x["open_centre"] >= x["load_sensing"] >= x["metered"] for x in allr) / len(allr)
    print(f"{label}: {len(allr)} cycles")
    print(f"  ordering OC>=LS>=metered: {100*order:.2f}%")
    print(f"  LS/OC  median {statistics.median(ls):.3f}  5-95%: {q(ls,.05):.3f} to {q(ls,.95):.3f}; "
          f"per-seed medians {min(a for a,_ in per_seed):.3f} to {max(a for a,_ in per_seed):.3f}")
    print(f"  Met/LS median {statistics.median(mt):.3f}  5-95%: {q(mt,.05):.3f} to {q(mt,.95):.3f}; "
          f"per-seed medians {min(b for _,b in per_seed):.3f} to {max(b for _,b in per_seed):.3f}")
    print(f"  share with Met/LS < 0.85: {100*sum(x<0.85 for x in mt)/len(mt):.1f}%; > 0.95: {100*sum(x>0.95 for x in mt)/len(mt):.1f}%")


report("random pressures per actuator", False)
report("equal pressure within each phase (H3 case)", True)
